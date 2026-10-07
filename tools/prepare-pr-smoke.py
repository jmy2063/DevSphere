"""Prepare a pinned real PR HEAD archive without changing the benchmark checkout."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
repo = root / '.benchmark-cache' / 'spring-petclinic'
sha = 'f9df3a1ee82d5b6a8b6867a1bac1df5523bf5259'
origin = subprocess.check_output(['git', '-C', str(repo), 'remote', 'get-url', 'origin'], text=True).strip().removesuffix('.git')
if origin != 'https://github.com/spring-projects/spring-petclinic':
    raise SystemExit('Unexpected origin; run prepare-public-benchmarks.py first.')
subprocess.run(['git', '-C', str(repo), 'fetch', '--depth=1', 'origin', sha], check=True)
with (root / '.benchmark-cache' / 'petclinic-pr-2672.zip').open('wb') as output:
    subprocess.run(['git', '-C', str(repo), 'archive', '--format=zip', sha], stdout=output, check=True)
print('Prepared Petclinic PR #2672 HEAD:', sha)
base = '818c4136ea971c21674525f9053de0d9c7ad8cfe'
subprocess.run(['git', '-C', str(repo), 'fetch', '--depth=1', 'origin', base], check=True)
with (root / '.benchmark-cache' / 'petclinic-pr-2672-base.zip').open('wb') as output:
    subprocess.run(['git', '-C', str(repo), 'archive', '--format=zip', base], stdout=output, check=True)
with zipfile.ZipFile(root / '.benchmark-cache' / 'petclinic-pr-2672.zip') as source:
    with zipfile.ZipFile(root / '.benchmark-cache' / 'petclinic-pr-2672-wrapped.zip', 'w', zipfile.ZIP_DEFLATED) as wrapped:
        for entry in source.infolist():
            wrapped.writestr('spring-petclinic-head/' + entry.filename, source.read(entry))
    with zipfile.ZipFile(root / '.benchmark-cache' / 'petclinic-pr-2672-changed.zip', 'w', zipfile.ZIP_DEFLATED) as changed:
        removed = False
        for entry in source.infolist():
            if entry.filename.endswith('/package-info.java') and not removed:
                removed = True
                continue
            content = source.read(entry)
            if entry.filename.endswith('/VetController.java'):
                content += b'\n// local change verification fixture\n'
            changed.writestr(entry, content)
        if not removed:
            raise SystemExit('Expected package-info.java missing from fixture source')
        changed.writestr('src/main/java/example/LocalOnly.java', 'package example; class LocalOnly {}\n')
print('Prepared BASE, wrapped HEAD, and changed/missing/extra Java fixtures')
