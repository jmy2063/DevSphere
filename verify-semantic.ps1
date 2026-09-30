$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tmp = Join-Path $Root ".semantic-check"
if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
New-Item -ItemType Directory -Force -Path (Join-Path $Tmp "backend-out") | Out-Null
try {
  if (-not (Get-Command javac -ErrorAction SilentlyContinue)) { throw "javac (JDK 17+) is required." }
  $JavaFiles = @(
    Get-ChildItem -Recurse -File (Join-Path $Root "tools\compile-stubs\src") -Filter *.java
    Get-ChildItem -Recurse -File (Join-Path $Root "backend\src\main\java") -Filter *.java
  ) | Sort-Object FullName | ForEach-Object { $_.FullName }
  & javac --release 17 -encoding UTF-8 '-Xlint:all,-serial' -d (Join-Path $Tmp "backend-out") $JavaFiles
  if ($LASTEXITCODE -ne 0) { throw "Backend semantic compile failed." }
  Write-Host "SEMANTIC_BACKEND_COMPILE_OK" -ForegroundColor Green

  $LocalTsc = Join-Path $Root "frontend\node_modules\.bin\tsc.cmd"
  if (Test-Path $LocalTsc) { $Tsc = $LocalTsc }
  elseif (Get-Command tsc -ErrorAction SilentlyContinue) { $Tsc = (Get-Command tsc).Source }
  else { throw "TypeScript compiler not found. Run npm install in frontend first." }
  Push-Location (Join-Path $Root "tools")
  try { & $Tsc -p tsconfig.semantic.json; if ($LASTEXITCODE -ne 0) { throw "Frontend semantic typecheck failed." } }
  finally { Pop-Location }
  Write-Host "SEMANTIC_FRONTEND_TYPECHECK_OK" -ForegroundColor Green
}
finally {
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
}
