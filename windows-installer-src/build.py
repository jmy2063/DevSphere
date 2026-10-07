"""Build a Windows installer from committed source and freshly built launcher."""

import argparse
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
INSTALLER = Path(__file__).resolve().parent
OUTPUT = ROOT / "release-output"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def zip_entry(name, data):
    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    return info, data


def run(*args, cwd=ROOT, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--go", required=True, type=Path)
    parser.add_argument("--launcher", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    go = args.go.resolve(strict=True)
    launcher = args.launcher.resolve(strict=True)
    report = args.report.resolve(strict=True)
    if launcher.stat().st_size < 100_000:
        raise ValueError("launcher is unexpectedly small")

    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    archive = subprocess.check_output(["git", "archive", "--format=zip", "HEAD"], cwd=ROOT)
    files = {}
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        for name in source.namelist():
            if not name.endswith("/") and name not in {"DevSphere_AX.exe", "RELEASE_MANIFEST_SHA256.txt"}:
                files[name] = source.read(name)
    files["DevSphere_AX.exe"] = launcher.read_bytes()
    files["demo-output/DevSphere_AX_Report.html"] = report.read_bytes()
    files["RELEASE_MANIFEST_SHA256.txt"] = "".join(
        f"{digest(files[name])}  {name}\n" for name in sorted(files)
    ).encode("utf-8")

    OUTPUT.mkdir(exist_ok=True)
    payload_path = OUTPUT / "DevSphere_AX_5_0_Payload.zip"
    with zipfile.ZipFile(payload_path, "w") as target:
        for name in sorted(files):
            info, data = zip_entry(name, files[name])
            target.writestr(info, data)
    payload_hash = digest(payload_path.read_bytes())

    with tempfile.TemporaryDirectory(prefix="devsphere-installer-build-") as temporary:
        work = Path(temporary)
        for source_name in ("go.mod", "main.go", "main_test.go"):
            shutil.copy2(INSTALLER / source_name, work / source_name)
        shutil.copy2(payload_path, work / "payload.zip")
        (work / "payload.sha256").write_text(payload_hash + "\n", encoding="ascii")
        env = os.environ.copy()
        env.update(GOOS="windows", GOARCH="amd64", CGO_ENABLED="0")
        run(str(go), "test", "./...", cwd=work, env=env)
        setup = OUTPUT / "DevSphere_AX_Setup.exe"
        run(str(go), "build", "-trimpath", "-ldflags=-s -w", "-o", str(setup), ".", cwd=work, env=env)

    setup_hash = digest(setup.read_bytes())
    (OUTPUT / "DevSphere_AX_Setup_SHA256.txt").write_text(
        f"{setup_hash}  DevSphere_AX_Setup.exe\n", encoding="ascii"
    )
    (OUTPUT / "BUILD_INFO.txt").write_text(
        f"Source commit: {commit}\n"
        f"Payload SHA256: {payload_hash}\n"
        f"Setup SHA256: {setup_hash}\n"
        f"Payload files: {len(files)}\n", encoding="utf-8"
    )
    print(f"Built {setup} from {commit} ({len(files)} payload files)")
    print(f"Payload SHA256: {payload_hash}")
    print(f"Setup SHA256: {setup_hash}")


if __name__ == "__main__":
    main()
