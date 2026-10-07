# Windows installer source

Build from the committed Git source plus a newly built `DevSphere_AX.exe` launcher
and standalone HTML demo. Python 3 and Go 1.23 or newer are required.

```powershell
python windows-installer-src/build.py --go C:\path\to\go.exe --launcher C:\path\to\DevSphere_AX.exe --report demo-output\DevSphere_AX_Report.html
```

The script creates `release-output/DevSphere_AX_5_0_Payload.zip`,
`DevSphere_AX_Setup.exe`, a SHA-256 file, and `BUILD_INFO.txt`. It generates the
payload manifest, embeds the payload with its hash, and runs Go tests before
building. The payload uses `git archive HEAD`, so commit source changes first.

Run `DevSphere_AX_Setup.exe --verify-payload` to check the embedded payload.
Run `DevSphere_AX_Setup.exe --self-test` to install twice into an isolated
temporary directory and verify every manifest entry. Neither mode changes the
user's installed copy or shortcuts.
