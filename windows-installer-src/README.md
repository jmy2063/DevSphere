# Windows installer source

Build on Windows from a recorded source snapshot and a freshly generated standalone
HTML demo. Python 3.10+ and Go 1.23+ are required. The launcher is built from the
same snapshot by default; `--launcher` accepts an explicitly supplied external binary.

```powershell
python windows-installer-src/build.py --go C:\path\to\go.exe --report demo-output\DevSphere_AX_Report.html --source head
```

The script creates `release-output/DevSphere_AX_5_0_Payload.zip`,
`DevSphere_AX_Setup.exe`, a SHA-256 file, and `BUILD_INFO.txt`. It generates the
payload manifest, embeds the payload with its hash, runs Go tests, and checks the
finished EXE with `--verify-payload` and `--self-test` before publishing build artifacts.
Go installer and launcher sources are read from the selected snapshot, including
when `--source head` intentionally excludes local edits. Tests or verification
failures leave existing output artifacts intact.

With local changes, choose the source explicitly. Omitting `--source` fails in a
dirty repository rather than silently dropping those changes. A clean repository
defaults to HEAD. `head` uses `git archive HEAD`; `working-tree` reads current
tracked files and non-ignored untracked files, including staged/unstaged changes
and deletions, without changing the index or creating a commit. Check the file
list before sharing a working-tree build; non-ignored local files are included.

```powershell
python windows-installer-src/build.py --go C:\path\to\go.exe --report demo-output\DevSphere_AX_Report.html --source working-tree --output release-output\working-tree-preview
python windows-installer-src/test_build.py -v
```

Working-tree builds are review candidates, not a frozen committed release.
`BUILD_SOURCE_INFO.json` inside the payload records the mode, base commit, dirty
state, source tree hash, Go version, and launcher/demo hashes. `BUILD_INFO.txt` records mode,
tree/payload/setup hashes and successful verification. The source tree hash uses
the sorted SHA-256 manifest of selected source bytes before generated launcher,
demo and build metadata are added. The release manifest covers packaged bytes.
Source links/submodules, Windows-unsafe paths, case-insensitive duplicate paths,
and installer file-count/size limit violations fail the build.

Run `DevSphere_AX_Setup.exe --verify-payload` to check the embedded payload.
Run `DevSphere_AX_Setup.exe --self-test` to install twice into an isolated
temporary directory and verify every manifest entry. Neither mode changes the
user's installed copy or shortcuts.
