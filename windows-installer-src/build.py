"""Build a verified Windows installer from an explicitly selected source snapshot."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "release-output"
EXCLUDED = {"DevSphere_AX.exe", "RELEASE_MANIFEST_SHA256.txt", "BUILD_SOURCE_INFO.json"}
MAX_FILES, MAX_SINGLE, MAX_TOTAL = 2500, 64 * 1024 * 1024, 512 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def manifest(files):
    return "".join(f"{digest(files[name])}  {name}\n" for name in sorted(files)).encode("utf-8")


def zip_entry(name, data):
    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    return info, data


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root)


def validate_name(name):
    parts = PurePosixPath(name).parts
    if (not parts or name.startswith("/") or "\\" in name or
            any(p in {".", ".."} or p.endswith((".", " ")) or
                re.search(r'[\x00-\x1f<>:"|?*]', p) or
                re.fullmatch(r"(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?", p, re.I)
                for p in parts) or str(PurePosixPath(name)) != name):
        raise ValueError(f"Unsafe Windows payload path: {name!r}")


def validate_files(files):
    if not files or len(files) > MAX_FILES:
        raise ValueError("Payload file-count limit exceeded or empty source")
    seen, total = set(), 0
    for name, data in files.items():
        validate_name(name)
        if name.casefold() in seen:
            raise ValueError(f"Case-insensitive duplicate payload path: {name}")
        seen.add(name.casefold())
        if len(data) > MAX_SINGLE:
            raise ValueError(f"Payload file too large: {name}")
        total += len(data)
    if total > MAX_TOTAL:
        raise ValueError("Payload expanded-size limit exceeded")


def capture_source(root, requested_mode=None):
    """Freeze bytes once; compilation also reads these bytes, never live Go source."""
    root = root.resolve()
    commit = git(root, "rev-parse", "HEAD").decode("ascii").strip()
    status = git(root, "status", "--porcelain", "--untracked-files=all", "-z")
    dirty = bool(status)
    if dirty and requested_mode is None:
        raise ValueError("Working tree has changes. Choose --source working-tree to include them, "
                         "or --source head to intentionally build only the last commit.")
    mode = requested_mode or "head"
    files = {}
    if mode == "head":
        if any(row.startswith(b"160000 ") for row in git(root, "ls-tree", "-r", "-z", commit).split(b"\0")):
            raise ValueError("Source submodules are not supported")
        with zipfile.ZipFile(io.BytesIO(git(root, "archive", "--format=zip", commit))) as source:
            for info in source.infolist():
                if info.is_dir() or info.filename in EXCLUDED:
                    continue
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise ValueError(f"Source symlink is not supported: {info.filename}")
                files[info.filename] = source.read(info)
    elif mode == "working-tree":
        if any(row.startswith(b"160000 ") for row in git(root, "ls-files", "--stage", "-z").split(b"\0")):
            raise ValueError("Source submodules are not supported")
        names = set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").decode("utf-8").split("\0")) - {""}
        if len(names) > MAX_FILES:
            raise ValueError("Source file-count limit exceeded")
        total = 0
        for name in sorted(names):
            if name in EXCLUDED:
                continue
            validate_name(name)
            path = root.joinpath(*PurePosixPath(name).parts)
            # On Python 3.10, resolve comparison also catches Windows junctions.
            if path.is_symlink() or path.resolve() != path.absolute():
                raise ValueError(f"Source link is not supported: {name}")
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"Source escaped repository: {name}")
            if not path.exists():  # Tracked deletions belong to this snapshot.
                continue
            if not path.is_file():
                raise ValueError(f"Source is not a regular file (submodules unsupported): {name}")
            if path.stat().st_size > MAX_SINGLE:
                raise ValueError(f"Source file too large: {name}")
            files[name] = path.read_bytes()
            total += len(files[name])
            if total > MAX_TOTAL:
                raise ValueError("Source expanded-size limit exceeded")
        if (git(root, "rev-parse", "HEAD").decode("ascii").strip() != commit or
                git(root, "status", "--porcelain", "--untracked-files=all", "-z") != status):
            raise ValueError("Repository changed while taking source snapshot; retry after edits finish")
        if any((root / name).read_bytes() != data for name, data in files.items()):
            raise ValueError("Source bytes changed while taking snapshot; retry after edits finish")
    else:
        raise ValueError(f"Unknown source mode: {mode}")
    validate_files(files)
    return files, {"sourceMode": mode, "baseCommit": commit, "workingTreeDirty": dirty,
                   "sourceTreeSha256": digest(manifest(files)), "sourceFiles": len(files)}


def run(*args, cwd=ROOT, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def materialize_module(files, prefix, directory):
    directory.mkdir(parents=True)
    selected = {name[len(prefix):]: data for name, data in files.items() if name.startswith(prefix)}
    if not {"go.mod", "main.go"}.issubset(selected):
        raise ValueError(f"Missing Go module sources: {prefix}")
    for name, data in selected.items():
        if name in {"payload.zip", "payload.sha256"}:
            continue
        dest = directory / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)


def build(args):
    files, source_info = capture_source(ROOT, args.source)
    go = args.go.resolve(strict=True)
    report = args.report.resolve(strict=True).read_bytes()
    output = args.output.resolve()
    if output == ROOT or ROOT.is_relative_to(output):
        raise ValueError("Output must not be the repository or one of its parents")
    if source_info["sourceMode"] == "head" and source_info["workingTreeDirty"]:
        print("NOTE: --source head excludes all staged, unstaged and untracked changes", flush=True)
    print(f"Captured {source_info['sourceFiles']} source files ({source_info['sourceMode']}) "
          f"SHA256={source_info['sourceTreeSha256']}", flush=True)
    env = os.environ.copy()
    env.update(GOOS="windows", GOARCH="amd64", CGO_ENABLED="0", GOTOOLCHAIN="local", GOWORK="off")
    source_info["goVersion"] = subprocess.check_output([str(go), "version"], env=env).decode("utf-8").strip()
    with tempfile.TemporaryDirectory(prefix="devsphere-installer-build-") as temporary:
        work = Path(temporary)
        launcher = work / "DevSphere_AX.exe"
        if args.launcher:
            launcher.write_bytes(args.launcher.resolve(strict=True).read_bytes())
            launcher_origin = "external --launcher"
        else:
            launcher_src = work / "launcher"
            materialize_module(files, "windows-launcher-src/", launcher_src)
            run(str(go), "test", "./...", cwd=launcher_src, env=env)
            run(str(go), "build", "-trimpath", "-ldflags=-s -w", "-o", str(launcher), ".", cwd=launcher_src, env=env)
            launcher_origin = "built from source snapshot"
        launcher_bytes = launcher.read_bytes()
        if len(launcher_bytes) < 100_000:
            raise ValueError("Launcher is unexpectedly small")
        source_info.update(launcherOrigin=launcher_origin, launcherSha256=digest(launcher_bytes), reportSha256=digest(report))
        files["DevSphere_AX.exe"] = launcher_bytes
        files["demo-output/DevSphere_AX_Report.html"] = report
        files["BUILD_SOURCE_INFO.json"] = (json.dumps(source_info, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        files["RELEASE_MANIFEST_SHA256.txt"] = manifest(files)
        validate_files(files)
        payload = work / "DevSphere_AX_5_0_Payload.zip"
        with zipfile.ZipFile(payload, "w") as target:
            for name in sorted(files):
                info, data = zip_entry(name, files[name])
                target.writestr(info, data)
        payload_hash = digest(payload.read_bytes())
        installer_src = work / "installer"
        materialize_module(files, "windows-installer-src/", installer_src)
        shutil.copy2(payload, installer_src / "payload.zip")
        (installer_src / "payload.sha256").write_text(payload_hash + "\n", encoding="ascii")
        run(str(go), "test", "./...", cwd=installer_src, env=env)
        setup = work / "DevSphere_AX_Setup.exe"
        run(str(go), "build", "-trimpath", "-ldflags=-s -w", "-o", str(setup), ".", cwd=installer_src, env=env)
        # These checks touch only an isolated temporary install, never user shortcuts.
        run(str(setup), "--verify-payload")
        run(str(setup), "--self-test")
        setup_hash = digest(setup.read_bytes())
        (work / "DevSphere_AX_Setup_SHA256.txt").write_text(f"{setup_hash}  DevSphere_AX_Setup.exe\n", encoding="ascii")
        (work / "BUILD_INFO.txt").write_text(
            f"Source mode: {source_info['sourceMode']}\nSource commit: {source_info['baseCommit']}\n"
            f"Working tree dirty: {source_info['workingTreeDirty']}\nSource tree SHA256: {source_info['sourceTreeSha256']}\n"
            f"Launcher: {launcher_origin}\nPayload SHA256: {payload_hash}\nSetup SHA256: {setup_hash}\n"
            f"Payload files: {len(files)}\nVerification: PAYLOAD_SHA256_OK + INSTALL_SELF_TEST_OK\n", encoding="utf-8")
        output.mkdir(parents=True, exist_ok=True)
        for name in (payload.name, setup.name, "DevSphere_AX_Setup_SHA256.txt", "BUILD_INFO.txt"):
            fd, staged = tempfile.mkstemp(prefix=".devsphere-build-", dir=output)
            os.close(fd)
            try:
                shutil.copyfile(work / name, staged)
                os.replace(staged, output / name)
            finally:
                if os.path.exists(staged):
                    os.unlink(staged)
    print(f"Built {output / setup.name} ({len(files)} payload files)")
    print(f"Source: {source_info['sourceMode']} / {source_info['sourceTreeSha256']}")
    print(f"Setup SHA256: {setup_hash}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--go", required=True, type=Path)
    parser.add_argument("--launcher", type=Path, help="External launcher; otherwise build from the same snapshot")
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--source", choices=["head", "working-tree"], help="Required when the working tree has changes")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    build(parser.parse_args())


if __name__ == "__main__":
    main()
