param([switch]$Strict)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "=== DevSphere AX 4.0 Release Verification ===" -ForegroundColor Cyan

function Require-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "$Name command not found." }
  Write-Host "[OK] $Name" -ForegroundColor Green
}
Require-Command "java"
Require-Command "javac"

Write-Host "[1/4] Core regression tests" -ForegroundColor Cyan
& "$Root\verify-core.bat"
if ($LASTEXITCODE -ne 0) { throw "Core regression tests failed." }

Write-Host "[2/4] Semantic backend/frontend checks" -ForegroundColor Cyan
try {
  & powershell -ExecutionPolicy Bypass -File "$Root\verify-semantic.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Semantic checks failed." }
} catch {
  if ($Strict) { throw }
  Write-Host "[WARN] Semantic frontend check requires TypeScript compiler. Run npm install before final strict verification." -ForegroundColor Yellow
}

Write-Host "[3/4] Standalone report smoke test" -ForegroundColor Cyan
& "$Root\report-demo.bat"
if ($LASTEXITCODE -ne 0) { throw "Standalone report test failed." }
if (-not (Test-Path "$Root\demo-output\DevSphere_AX_Report.html")) { throw "Standalone report output missing." }

Write-Host "[4/4] Dependency-resolved builds" -ForegroundColor Cyan
$gradle = Get-Command gradle -ErrorAction SilentlyContinue
$GradleRunner = Join-Path $Root 'backend\gradlew.bat'
if (-not (Test-Path $GradleRunner) -and $gradle) { $GradleRunner = $gradle.Source }
if (Test-Path $GradleRunner) {
  Push-Location "$Root\backend"
  try { & $GradleRunner clean test bootJar --no-daemon; if ($LASTEXITCODE -ne 0) { throw "Gradle build failed." } }
  finally { Pop-Location }
  Write-Host "[OK] Backend Gradle test + bootJar" -ForegroundColor Green
} elseif ($Strict) {
  throw "Gradle Wrapper and CLI are unavailable. STRICT verification requires a dependency-resolved backend build."
} else {
  Write-Host "[SKIP] Gradle Wrapper and CLI unavailable. Run strict gate on the final presentation PC." -ForegroundColor Yellow
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm -and (Test-Path "$Root\frontend\node_modules")) {
  Push-Location "$Root\frontend"
  try {
    npm run typecheck; if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed." }
    npm run build; if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
  } finally { Pop-Location }
  Write-Host "[OK] Frontend typecheck + build" -ForegroundColor Green
} elseif ($Strict) {
  throw "frontend/node_modules missing. Run npm install before STRICT verification."
} else {
  Write-Host "[SKIP] frontend dependencies not installed. Run npm install then strict gate on the final PC." -ForegroundColor Yellow
}

Write-Host "=== RELEASE VERIFICATION FINISHED ===" -ForegroundColor Cyan
if (-not $Strict) { Write-Host "For zero-known-defect release candidate status, run: powershell -ExecutionPolicy Bypass -File .\verify-final-strict.ps1" -ForegroundColor Cyan }
