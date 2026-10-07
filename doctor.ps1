$ErrorActionPreference = "SilentlyContinue"
Write-Host "=== DevSphere AX 5.0 Environment Doctor ===" -ForegroundColor Cyan

function Version-Major($Text) {
  if ($Text -match '(\d+)(?:\.\d+)*') { return [int]$Matches[1] }
  return -1
}

function Check-Cmd($Name, $VersionArgs, $MinMajor, $Required) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    $kind = if ($Required) { "MISSING" } else { "OPTIONAL" }
    $color = if ($Required) { "Red" } else { "Yellow" }
    Write-Host "[$kind] $Name" -ForegroundColor $color
    return @{ ok = -not $Required; found = $false; major = -1 }
  }
  $raw = (& $Name $VersionArgs 2>&1 | Out-String).Trim()
  $first = ($raw -split "`r?`n" | Select-Object -First 1)
  $major = Version-Major $raw
  if ($MinMajor -gt 0 -and $major -lt $MinMajor) {
    Write-Host "[OLD] $Name : $first (required major >= $MinMajor)" -ForegroundColor Red
    return @{ ok = $false; found = $true; major = $major }
  }
  Write-Host "[OK] $Name : $first" -ForegroundColor Green
  return @{ ok = $true; found = $true; major = $major }
}

$java  = Check-Cmd "java"  "-version" 17 $true
$javac = Check-Cmd "javac" "-version" 17 $true
$node  = Check-Cmd "node"  "--version" 20 $true
$npm   = Check-Cmd "npm"   "--version" 10 $true
$gradle = Check-Cmd "gradle" "--version" 8 $false
$wrapperFound = Test-Path (Join-Path $PSScriptRoot 'backend\gradlew.bat')
if ($wrapperFound) { Write-Host "[OK] Bundled Gradle Wrapper (8.10.2); first execution requires network access." -ForegroundColor Green }

Write-Host ""
$strictReady = $java.ok -and $javac.ok -and $node.ok -and $npm.ok -and ($wrapperFound -or $gradle.found)
if ($strictReady) {
  Write-Host "[READY] Strict Quality Gate prerequisites are present." -ForegroundColor Green
} else {
  Write-Host "[INFO] JDK-only core demo still works when JDK 17+ is available." -ForegroundColor Cyan
  if (-not ($wrapperFound -or $gradle.found)) { Write-Host "[INFO] Gradle Wrapper or CLI is needed for backend build verification." -ForegroundColor Yellow }
}
Write-Host "Run verify-core.bat first. Before final presentation, run verify-final-strict.ps1 after dependencies are installed." -ForegroundColor Cyan

if (-not ($java.ok -and $javac.ok -and $node.ok -and $npm.ok)) { exit 2 }
exit 0
