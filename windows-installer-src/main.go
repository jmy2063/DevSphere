package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	productName   = "DevSphere AX"
	version       = "5.0.0"
	maxEntries    = 2500
	maxExpanded   = int64(512 * 1024 * 1024)
	maxSingleFile = int64(64 * 1024 * 1024)
)

//go:embed payload.zip payload.sha256
var embeddedFS embed.FS

func main() {
	silent := hasArg("--silent")
	verifyOnly := hasArg("--verify-payload")

	payload, err := embeddedFS.ReadFile("payload.zip")
	if err != nil {
		fatal(silent, "내장 설치 파일을 읽지 못했습니다", err)
	}
	if err := verifyPayloadHash(payload); err != nil {
		fatal(silent, "내장 Payload 무결성 검증 실패", err)
	}

	if verifyOnly {
		fmt.Println("PAYLOAD_SHA256_OK")
		return
	}
	if hasArg("--self-test") {
		if err := selfTest(payload); err != nil {
			fatal(true, "격리 설치 검증 실패", err)
		}
		fmt.Println("INSTALL_SELF_TEST_OK")
		return
	}
	if runtime.GOOS != "windows" {
		fatal(silent, "이 설치 프로그램은 Windows x64용입니다", errors.New(runtime.GOOS))
	}

	fmt.Printf("=== %s %s Installer ===\n", productName, version)
	fmt.Println("관리자 권한 없이 현재 사용자 영역에 설치합니다.")

	installDir, err := install(payload)
	if err != nil {
		fatal(silent, "설치 실패", err)
	}

	shortcutErr := createShortcuts(installDir)
	if shortcutErr != nil {
		fmt.Printf("[WARN] 바로가기 생성 실패: %v\n", shortcutErr)
		fmt.Println("설치 자체는 완료되었습니다. 설치 폴더의 DevSphere_AX.exe를 실행하세요.")
	}

	if err := writeInstallInfo(installDir); err != nil {
		fmt.Printf("[WARN] INSTALL_INFO.txt 기록 실패: %v\n", err)
	}
	if err := writeUninstaller(filepath.Dir(installDir), installDir); err != nil {
		fmt.Printf("[WARN] Uninstaller 기록 실패: %v\n", err)
	}

	fmt.Println()
	fmt.Println("[OK] 설치가 완료되었습니다.")
	fmt.Printf("설치 경로: %s\n", installDir)
	fmt.Println("실행 파일: DevSphere_AX.exe")

	if silent {
		return
	}
	fmt.Print("Standalone Demo를 지금 실행할까요? [Y/n]: ")
	in, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	if strings.TrimSpace(strings.ToLower(in)) != "n" {
		launcher := filepath.Join(installDir, "DevSphere_AX.exe")
		_ = exec.Command(launcher, "--demo").Start()
	}
	pause()
}

func hasArg(want string) bool {
	for _, a := range os.Args[1:] {
		if strings.EqualFold(a, want) {
			return true
		}
	}
	return false
}

func verifyPayloadHash(payload []byte) error {
	wantBytes, err := embeddedFS.ReadFile("payload.sha256")
	if err != nil {
		return err
	}
	want := strings.TrimSpace(string(wantBytes))
	if len(want) != 64 {
		return errors.New("invalid payload SHA-256")
	}
	sum := sha256.Sum256(payload)
	got := hex.EncodeToString(sum[:])
	if got != want {
		return fmt.Errorf("expected %s, got %s", want, got)
	}
	return nil
}

func selfTest(payload []byte) error {
	base, err := os.MkdirTemp("", "devsphere-installer-self-test-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(base)
	var installed string
	for i := 0; i < 2; i++ {
		installed, err = installInto(base, payload)
		if err != nil {
			return err
		}
		if err := verifyManifest(installed); err != nil {
			return err
		}
	}
	if runtime.GOOS == "windows" {
		if err := exec.Command(filepath.Join(installed, "DevSphere_AX.exe"), "--exit").Run(); err != nil {
			return fmt.Errorf("installed launcher smoke test: %w", err)
		}
	}
	return nil
}

func install(payload []byte) (string, error) {
	local := os.Getenv("LOCALAPPDATA")
	if strings.TrimSpace(local) == "" {
		return "", errors.New("LOCALAPPDATA 환경변수가 없습니다")
	}
	return installInto(filepath.Join(local, "DevSphereAX"), payload)
}

func installInto(base string, payload []byte) (string, error) {
	if strings.TrimSpace(base) == "" {
		return "", errors.New("install base is empty")
	}
	finalDir := filepath.Join(base, version)
	if err := os.MkdirAll(base, 0o755); err != nil {
		return "", err
	}

	staging, err := os.MkdirTemp(base, ".staging-")
	if err != nil {
		return "", err
	}
	cleanupStaging := true
	defer func() {
		if cleanupStaging {
			_ = os.RemoveAll(staging)
		}
	}()

	if err := safeExtract(payload, staging); err != nil {
		return "", fmt.Errorf("payload extraction: %w", err)
	}
	if err := verifyManifest(staging); err != nil {
		return "", fmt.Errorf("release manifest: %w", err)
	}

	launcher := filepath.Join(staging, "DevSphere_AX.exe")
	if fi, err := os.Stat(launcher); err != nil || fi.Size() < 100_000 {
		if err == nil {
			err = fmt.Errorf("launcher size is suspicious: %d", fi.Size())
		}
		return "", fmt.Errorf("launcher validation: %w", err)
	}

	backup := finalDir + ".backup-" + time.Now().Format("20060102-150405")
	hadOld := false
	if _, err := os.Stat(finalDir); err == nil {
		if err := os.Rename(finalDir, backup); err != nil {
			return "", fmt.Errorf("existing install backup failed: %w", err)
		}
		hadOld = true
	} else if !os.IsNotExist(err) {
		return "", err
	}

	if err := os.Rename(staging, finalDir); err != nil {
		if hadOld {
			_ = os.Rename(backup, finalDir)
		}
		return "", fmt.Errorf("atomic install switch failed: %w", err)
	}
	cleanupStaging = false

	if err := verifyManifest(finalDir); err != nil {
		_ = os.RemoveAll(finalDir)
		if hadOld {
			_ = os.Rename(backup, finalDir)
		}
		return "", fmt.Errorf("post-install integrity verification failed: %w", err)
	}
	if hadOld {
		_ = os.RemoveAll(backup)
	}

	if err := os.WriteFile(filepath.Join(base, "current.txt"), []byte(version+"\r\n"), 0o644); err != nil {
		return "", fmt.Errorf("current version marker: %w", err)
	}
	return finalDir, nil
}

func safeExtract(payload []byte, dest string) error {
	zr, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return err
	}
	if len(zr.File) == 0 {
		return errors.New("empty payload")
	}
	if len(zr.File) > maxEntries {
		return fmt.Errorf("too many archive entries: %d", len(zr.File))
	}

	root, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	var expanded int64
	seen := map[string]struct{}{}

	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		clean := filepath.Clean(filepath.FromSlash(name))
		if clean == "." || clean == "" {
			continue
		}
		if filepath.IsAbs(clean) || filepath.VolumeName(clean) != "" || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe archive path: %q", f.Name)
		}
		key := strings.ToLower(filepath.ToSlash(clean))
		if _, ok := seen[key]; ok {
			return fmt.Errorf("duplicate archive path: %q", f.Name)
		}
		seen[key] = struct{}{}

		if f.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink is not allowed: %q", f.Name)
		}
		if int64(f.UncompressedSize64) > maxSingleFile {
			return fmt.Errorf("archive entry too large: %q", f.Name)
		}
		expanded += int64(f.UncompressedSize64)
		if expanded > maxExpanded {
			return fmt.Errorf("archive expanded-size limit exceeded")
		}

		target := filepath.Join(root, clean)
		absTarget, err := filepath.Abs(target)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, absTarget)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("archive path escaped install root: %q", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(absTarget, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(absTarget), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(absTarget, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, io.LimitReader(rc, maxSingleFile+1))
		closeOut := out.Close()
		closeIn := rc.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeOut != nil {
			return closeOut
		}
		if closeIn != nil {
			return closeIn
		}
	}
	return nil
}

func verifyManifest(root string) error {
	manifestPath := filepath.Join(root, "RELEASE_MANIFEST_SHA256.txt")
	b, err := os.ReadFile(manifestPath)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n")
	checked := 0
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(line) < 67 || line[64:66] != "  " {
			return fmt.Errorf("invalid manifest line: %q", line)
		}
		expected := strings.ToLower(line[:64])
		if _, err := hex.DecodeString(expected); err != nil {
			return fmt.Errorf("invalid manifest digest")
		}
		relRaw := line[66:]
		rel := filepath.Clean(filepath.FromSlash(strings.ReplaceAll(relRaw, "\\", "/")))
		if filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe manifest path: %q", relRaw)
		}
		p := filepath.Join(root, rel)
		data, err := os.ReadFile(p)
		if err != nil {
			return fmt.Errorf("manifest file missing %s: %w", relRaw, err)
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != expected {
			return fmt.Errorf("manifest hash mismatch: %s", relRaw)
		}
		checked++
	}
	if checked < 20 {
		return fmt.Errorf("manifest contains too few files: %d", checked)
	}
	return nil
}

func createShortcuts(installDir string) error {
	exe := filepath.Join(installDir, "DevSphere_AX.exe")
	desktop := `[Environment]::GetFolderPath('Desktop')`
	startMenu := `Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\\DevSphere AX'`
	script := fmt.Sprintf(`
$ErrorActionPreference='Stop'
$exe='%s'
$desktop=%s
$start=%s
New-Item -ItemType Directory -Force -Path $start | Out-Null
$ws=New-Object -ComObject WScript.Shell
function Link($path,$args,$desc){ $s=$ws.CreateShortcut($path); $s.TargetPath=$exe; $s.Arguments=$args; $s.WorkingDirectory='%s'; $s.Description=$desc; $s.Save() }
Link (Join-Path $desktop 'DevSphere AX.lnk') '' 'DevSphere AX'
Link (Join-Path $start 'DevSphere AX.lnk') '' 'DevSphere AX'
Link (Join-Path $start 'DevSphere AX Demo.lnk') '--demo' 'Verified standalone demo'
Link (Join-Path $start 'DevSphere AX Verify.lnk') '--verify' 'Core regression verification'
`, psQuote(exe), desktop, startMenu, psQuote(installDir))
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell shortcut creation: %v (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func writeUninstaller(base, installDir string) error {
	path := filepath.Join(base, "Uninstall-DevSphereAX.ps1")
	content := fmt.Sprintf(`param([switch]$Silent)
$ErrorActionPreference='Stop'
$InstallDir='%s'
if(-not $Silent){ $a=Read-Host 'DevSphere AX를 제거할까요? (Y/N)'; if($a -notmatch '^[Yy]$'){ exit 0 } }
$desktop=[Environment]::GetFolderPath('Desktop')
$start=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\DevSphere AX'
Remove-Item -LiteralPath (Join-Path $desktop 'DevSphere AX.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $start -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'DevSphere AX 제거가 완료되었습니다.' -ForegroundColor Green
`, strings.ReplaceAll(installDir, "'", "''"))
	return os.WriteFile(path, []byte(content), 0o644)
}

func writeInstallInfo(installDir string) error {
	cmds := []struct {
		name string
		args []string
	}{
		{"java", []string{"-version"}}, {"javac", []string{"-version"}}, {"node", []string{"--version"}},
		{"npm", []string{"--version"}}, {"gradle", []string{"--version"}},
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s\r\nInstalled: %s\r\nInstallDir: %s\r\n\r\nEnvironment:\r\n", productName, version, time.Now().Format(time.RFC3339), installDir)
	for _, c := range cmds {
		p, err := exec.LookPath(c.name)
		if err != nil {
			fmt.Fprintf(&b, "%s: MISSING\r\n", c.name)
			continue
		}
		cmd := exec.Command(p, c.args...)
		out, _ := cmd.CombinedOutput()
		first := strings.TrimSpace(string(out))
		if i := strings.IndexByte(first, '\n'); i >= 0 {
			first = first[:i]
		}
		fmt.Fprintf(&b, "%s: %s\r\n", c.name, first)
	}
	return os.WriteFile(filepath.Join(installDir, "INSTALL_INFO.txt"), []byte(b.String()), 0o644)
}

func psQuote(s string) string { return strings.ReplaceAll(s, "'", "''") }

func fatal(silent bool, message string, err error) {
	fmt.Fprintf(os.Stderr, "[ERROR] %s: %v\n", message, err)
	if !silent {
		pause()
	}
	os.Exit(1)
}

func pause() {
	fmt.Print("Enter 키를 누르면 종료합니다...")
	_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
}

// keep sort imported in release builds: deterministic helper for future manifest diagnostics.
var _ = sort.Strings
