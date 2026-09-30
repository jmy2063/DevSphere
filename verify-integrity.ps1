$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Manifest = Join-Path $Root "RELEASE_MANIFEST_SHA256.txt"
if (-not (Test-Path $Manifest)) { throw "RELEASE_MANIFEST_SHA256.txt missing." }
$Failures = 0
foreach ($Line in Get-Content -LiteralPath $Manifest -Encoding UTF8) {
  if ([string]::IsNullOrWhiteSpace($Line)) { continue }
  if ($Line -notmatch '^([0-9a-fA-F]{64})\s{2}(.+)$') { throw "Invalid manifest line: $Line" }
  $Expected = $Matches[1].ToLowerInvariant()
  $Relative = $Matches[2].Replace('/', [IO.Path]::DirectorySeparatorChar)
  $Path = Join-Path $Root $Relative
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Write-Host "[MISSING] $Relative" -ForegroundColor Red; $Failures++; continue }
  $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) { Write-Host "[MISMATCH] $Relative" -ForegroundColor Red; $Failures++ }
}
if ($Failures -gt 0) { throw "Release integrity verification failed: $Failures file(s)." }
Write-Host "RELEASE_INTEGRITY_OK" -ForegroundColor Green
