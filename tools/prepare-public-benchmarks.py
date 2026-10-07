"""Fetch only pinned public sources into the task-owned ignored cache. Never rewrites dirty checkouts."""
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.benchmark-cache'
SOURCES=json.loads((ROOT/'benchmarks/public/sources.json').read_text(encoding='utf-8'))['sources']
for entry in SOURCES:
    target=CACHE/entry['name']
    if not target.exists():
        target.mkdir(parents=True)
        subprocess.run(['git','init',str(target)],check=True)
        subprocess.run(['git','-C',str(target),'remote','add','origin',entry['repository']],check=True)
    actual_remote=subprocess.check_output(['git','-C',str(target),'remote','get-url','origin'],text=True).strip()
    if actual_remote!=entry['repository']: raise RuntimeError(f'Unexpected remote for {target.name}')
    if subprocess.check_output(['git','-C',str(target),'status','--porcelain'],text=True).strip():
        raise RuntimeError(f'Cache checkout has local changes: {target}')
    present=subprocess.run(['git','-C',str(target),'cat-file','-e',entry['commit']+'^{commit}'],capture_output=True).returncode==0
    if not present: subprocess.run(['git','-C',str(target),'fetch','--depth','1','origin',entry['commit']],check=True)
    subprocess.run(['git','-C',str(target),'checkout','--detach',entry['commit']],check=True)
    # Fresh git archive avoids metadata, generated files and line-ending differences in checkout settings.
    archive=target.with_suffix('.zip')
    tree=entry['commit'] if entry['sourceRoot']=='.' else entry['commit']+':'+entry['sourceRoot']
    subprocess.run(['git','-C',str(target),'archive','--format=zip','--output='+str(archive),tree],check=True)
    print(entry['name'],entry['commit'],flush=True)
