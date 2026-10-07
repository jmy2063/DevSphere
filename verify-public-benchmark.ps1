$ErrorActionPreference = 'Stop'
& python (Join-Path $PSScriptRoot 'tools/prepare-public-benchmarks.py')
if ($LASTEXITCODE -ne 0) { throw 'Pinned source preparation failed' }
& (Join-Path $PSScriptRoot 'verify-benchmark.ps1')
$publicBuild = Join-Path $PSScriptRoot '.benchmark-build'
& javac --release 17 -encoding UTF-8 -cp $publicBuild -d $publicBuild (Join-Path $PSScriptRoot 'tools/PublicSourceBenchmark.java')
if ($LASTEXITCODE -ne 0) { throw 'Public benchmark compilation failed' }
& java '-Dfile.encoding=UTF-8' -cp $publicBuild PublicSourceBenchmark $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Public source benchmark failed' }
