"""Installer source selection regression tests; no real install or Go toolchain needed."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("installer_build", Path(__file__).with_name("build.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="devsphere-build-test-")
        self.root = Path(self.temp.name).resolve()
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Installer test")
        self.git("config", "core.autocrlf", "false")
        (self.root / ".gitignore").write_text("ignored/\n", encoding="utf-8")
        (self.root / "source.txt").write_bytes(b"committed")
        (self.root / "deleted.txt").write_bytes(b"remove me")
        for prefix in ("windows-installer-src", "windows-launcher-src"):
            directory = self.root / prefix
            directory.mkdir()
            (directory / "go.mod").write_bytes(b"module test\n")
            (directory / "main.go").write_bytes(b"package main\n")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, stderr=subprocess.DEVNULL)

    def test_clean_default_matches_explicit_head(self):
        files, info = builder.capture_source(self.root)
        explicit, other = builder.capture_source(self.root, "head")
        self.assertEqual(files, explicit)
        self.assertEqual(info, other)
        self.assertFalse(info["workingTreeDirty"])
        self.assertEqual(files["source.txt"], b"committed")

    def test_dirty_default_requires_explicit_choice(self):
        (self.root / "source.txt").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "--source working-tree"):
            builder.capture_source(self.root)
        files, info = builder.capture_source(self.root, "head")
        self.assertEqual(files["source.txt"], b"committed")
        self.assertTrue(info["workingTreeDirty"])

    def test_working_tree_includes_current_bytes_new_files_and_deletions(self):
        (self.root / "source.txt").write_bytes(b"staged")
        self.git("add", "source.txt")
        (self.root / "source.txt").write_bytes(b"unstaged latest")
        (self.root / "새 기능.ts").write_bytes(b"new feature")
        (self.root / "deleted.txt").unlink()
        (self.root / "ignored").mkdir()
        (self.root / "ignored" / "token.txt").write_bytes(b"secret")
        index_before = self.git("diff", "--cached", "--binary")
        files, info = builder.capture_source(self.root, "working-tree")
        self.assertEqual(files["source.txt"], b"unstaged latest")
        self.assertEqual(files["새 기능.ts"], b"new feature")
        self.assertNotIn("deleted.txt", files)
        self.assertNotIn("ignored/token.txt", files)
        self.assertEqual(self.git("diff", "--cached", "--binary"), index_before)
        self.assertEqual(info["sourceTreeSha256"], builder.digest(builder.manifest(files)))
        self.assertEqual(builder.capture_source(self.root, "working-tree")[1], info)
        (self.root / "source.txt").write_bytes(b"next edit")
        self.assertEqual(files["source.txt"], b"unstaged latest")
        self.assertNotEqual(builder.capture_source(self.root, "working-tree")[1]["sourceTreeSha256"], info["sourceTreeSha256"])

    def test_module_materialization_uses_selected_snapshot(self):
        files, _ = builder.capture_source(self.root, "head")
        (self.root / "windows-installer-src/main.go").write_bytes(b"changed live source")
        with tempfile.TemporaryDirectory() as output:
            target = Path(output) / "installer"
            builder.materialize_module(files, "windows-installer-src/", target)
            self.assertEqual((target / "main.go").read_bytes(), b"package main\n")

    def test_invalid_paths_and_case_duplicates_fail(self):
        for name in ("../escape", "/absolute", "C:/drive", "a\\b", "a//b", "a/./b", "a\nb", "name. ", "NUL.txt", "aux"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                builder.validate_files({name: b"x"})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            builder.validate_files({"File": b"x", "file": b"y"})
        with patch.object(builder, "MAX_SINGLE", 2), self.assertRaisesRegex(ValueError, "too large"):
            builder.validate_files({"file": b"xxx"})
        with patch.object(builder, "MAX_TOTAL", 2), self.assertRaisesRegex(ValueError, "expanded-size"):
            builder.validate_files({"file": b"xx", "other": b"x"})
        commit = self.git("rev-parse", "HEAD").decode("ascii").strip()
        self.git("update-index", "--add", "--cacheinfo", f"160000,{commit},dependency")
        self.git("commit", "-qm", "submodule fixture")
        for mode in ("head", "working-tree"):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "submodules"):
                builder.capture_source(self.root, mode)

    def test_symlink_source_is_rejected(self):
        try:
            (self.root / "link.txt").symlink_to(self.root / "source.txt")
        except OSError:
            self.skipTest("OS does not allow creating test symlinks")
        with self.assertRaisesRegex(ValueError, "link"):
            builder.capture_source(self.root, "working-tree")

    def test_link_detection_without_os_symlink_privileges(self):
        source = self.root / "source.txt"
        original = Path.is_symlink
        with patch.object(Path, "is_symlink", lambda path: path == source or original(path)):
            with self.assertRaisesRegex(ValueError, "link"):
                builder.capture_source(self.root, "working-tree")

    def test_failed_build_keeps_existing_artifacts(self):
        # Everything outside the source repo avoids turning fixture inputs into source.
        with tempfile.TemporaryDirectory() as temporary:
            # Keep a valid noncanonical spelling: build() resolves executable paths.
            # This reproduces CI paths whose spelling changes during normalization.
            (Path(temporary) / "path-alias").mkdir()
            work = Path(temporary) / "path-alias" / ".."
            for name, data in (("go.exe", b"fake"), ("launcher.exe", b"x" * 100001), ("report.html", b"<html>demo</html>")):
                (work / name).write_bytes(data)
            output = work / "output"
            output.mkdir()
            (output / "DevSphere_AX_Setup.exe").write_bytes(b"existing setup")
            args = SimpleNamespace(source="head", go=work / "go.exe", launcher=work / "launcher.exe", report=work / "report.html", output=output)
            real_output = subprocess.check_output
            go_version_calls = []
            def fake_go_version(command, **kwargs):
                if command[1:] == ["version"] and Path(command[0]).resolve() == (work / "go.exe").resolve():
                    go_version_calls.append(command)
                    return b"go version test windows/amd64"
                if command[0] == "git":
                    return real_output(command, **kwargs)
                raise AssertionError(f"Unexpected executable in build test: {command[0]}")
            with patch.object(builder, "ROOT", self.root), patch.object(builder.subprocess, "check_output", side_effect=fake_go_version), patch.object(builder, "run", side_effect=RuntimeError("Go test failed")):
                with self.assertRaisesRegex(RuntimeError, "Go test failed"):
                    builder.build(args)
            self.assertEqual((output / "DevSphere_AX_Setup.exe").read_bytes(), b"existing setup")
            self.assertEqual(len(list(output.iterdir())), 1)
            self.assertEqual(len(go_version_calls), 1)
            def fail_self_test(*command, **kwargs):
                if "build" in command:
                    Path(command[command.index("-o") + 1]).write_bytes(b"new setup")
                if "--self-test" in command:
                    raise RuntimeError("Isolated self-test failed")
            with patch.object(builder, "ROOT", self.root), patch.object(builder.subprocess, "check_output", side_effect=fake_go_version), patch.object(builder, "run", side_effect=fail_self_test):
                with self.assertRaisesRegex(RuntimeError, "Isolated self-test failed"):
                    builder.build(args)
            self.assertEqual((output / "DevSphere_AX_Setup.exe").read_bytes(), b"existing setup")
            self.assertEqual(len(list(output.iterdir())), 1)
            self.assertEqual(len(go_version_calls), 2)


if __name__ == "__main__":
    unittest.main()
