param([switch]$SkipNetworkAudit)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "=== DevSphere AX 4.0 STRICT QUALITY GATE ===" -ForegroundColor Cyan

function Need($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "$Name is required for strict verification." }
  Write-Host "[OK] $Name" -ForegroundColor Green
}
Need java; Need javac; Need node; Need npm

Write-Host "[0/6] Release integrity" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File "$Root\verify-integrity.ps1"; if ($LASTEXITCODE -ne 0) { throw "Release integrity failed." }

Write-Host "[1/6] Core regression" -ForegroundColor Cyan
& "$Root\verify-core.bat"; if ($LASTEXITCODE -ne 0) { throw "Core regression failed." }

Write-Host "[2/6] Semantic source checks" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File "$Root\verify-semantic.ps1"; if ($LASTEXITCODE -ne 0) { throw "Semantic checks failed." }

Write-Host "[3/6] Standalone deterministic smoke demo" -ForegroundColor Cyan
& "$Root\report-demo.bat"; if ($LASTEXITCODE -ne 0) { throw "Standalone demo failed." }
if (-not (Test-Path "$Root\demo-output\DevSphere_AX_Report.html")) { throw "Demo report was not created." }

Write-Host "[4/6] Backend dependency-resolved build" -ForegroundColor Cyan
$Gradle = Get-Command gradle -ErrorAction SilentlyContinue
$GradleRunner = Join-Path $Root 'backend\gradlew.bat'
if (-not (Test-Path $GradleRunner)) {
  if (-not $Gradle) { throw "Gradle Wrapper or Gradle CLI is required for STRICT mode." }
  $GradleRunner = $Gradle.Source
}
Push-Location "$Root\backend"
try {
  & $GradleRunner clean test bootJar --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle clean test bootJar failed." }
} finally { Pop-Location }
Write-Host "[OK] Backend test + bootJar" -ForegroundColor Green

Write-Host "[5/6] Frontend dependency-resolved build" -ForegroundColor Cyan
if (-not (Test-Path "$Root\frontend\node_modules")) { throw "frontend/node_modules missing. Run npm install first." }
Push-Location "$Root\frontend"
try {
  & npm run typecheck; if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed." }
  & npm run build; if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
  if (-not $SkipNetworkAudit) {
    & npm audit --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw "npm audit found high-or-higher vulnerabilities or could not complete." }
  }
} finally { Pop-Location }
Write-Host "[OK] Frontend typecheck + build" -ForegroundColor Green

Write-Host "[6/6] Final artifact checks" -ForegroundColor Cyan
if (-not (Test-Path "$Root\backend\build\libs")) { throw "Backend build artifact directory missing." }
if (-not (Test-Path "$Root\frontend\dist\index.html")) { throw "Frontend dist/index.html missing." }
Write-Host "=== STRICT QUALITY GATE PASSED ===" -ForegroundColor Green
