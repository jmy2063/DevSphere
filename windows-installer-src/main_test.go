package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func makeZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	for name, data := range files {
		w, err := z.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestSafeExtract(t *testing.T) {
	dir := t.TempDir()
	payload := makeZip(t, map[string][]byte{"a/b.txt": []byte("ok")})
	if err := safeExtract(payload, dir); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dir, "a", "b.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "ok" {
		t.Fatalf("unexpected: %q", got)
	}
}

func TestSafeExtractRejectsTraversal(t *testing.T) {
	payload := makeZip(t, map[string][]byte{"../evil.txt": []byte("bad")})
	if err := safeExtract(payload, t.TempDir()); err == nil {
		t.Fatal("expected traversal rejection")
	}
}

func TestSafeExtractRejectsDuplicateCaseInsensitivePath(t *testing.T) {
	payload := makeZip(t, map[string][]byte{"A.txt": []byte("a"), "a.txt": []byte("b")})
	if err := safeExtract(payload, t.TempDir()); err == nil {
		t.Fatal("expected duplicate rejection")
	}
}

func TestVerifyManifest(t *testing.T) {
	dir := t.TempDir()
	data := []byte("hello")
	if err := os.WriteFile(filepath.Join(dir, "x.txt"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	line := hex.EncodeToString(sum[:]) + "  x.txt\n"
	// verifier intentionally requires a substantial release; build a minimum synthetic manifest.
	var lines strings.Builder
	for i := 0; i < 20; i++ {
		name := "f" + string(rune('a'+i)) + ".txt"
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			t.Fatal(err)
		}
		lines.WriteString(hex.EncodeToString(sum[:]) + "  " + name + "\n")
	}
	_ = line
	if err := os.WriteFile(filepath.Join(dir, "RELEASE_MANIFEST_SHA256.txt"), []byte(lines.String()), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifyManifest(dir); err != nil {
		t.Fatal(err)
	}
}

func TestInstallIntoIsTransactionalAndRepeatable(t *testing.T) {
	base := t.TempDir()
	payload, err := embeddedFS.ReadFile("payload.zip")
	if err != nil {
		t.Fatal(err)
	}
	dir, err := installInto(base, payload)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "DevSphere_AX.exe")); err != nil {
		t.Fatal(err)
	}
	// A second installation must safely replace the same version.
	dir2, err := installInto(base, payload)
	if err != nil {
		t.Fatal(err)
	}
	if dir2 != dir {
		t.Fatalf("install dir changed: %s != %s", dir2, dir)
	}
	if err := verifyManifest(dir2); err != nil {
		t.Fatal(err)
	}
}
