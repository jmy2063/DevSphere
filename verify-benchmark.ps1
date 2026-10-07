$ErrorActionPreference = 'Stop'
$benchmarkRoot = $PSScriptRoot
$benchmarkBuild = Join-Path $benchmarkRoot '.benchmark-build'
New-Item -ItemType Directory -Force -Path $benchmarkBuild | Out-Null
$benchmarkSources = @(Get-ChildItem (Join-Path $benchmarkRoot 'backend/src/main/java/com/devsphere/ax/model/*.java') | ForEach-Object FullName)
foreach ($relative in @('analyzer/JavaStaticAnalyzer.java','graph/SoftwareGraph.java','graph/GraphBuilder.java','impact/ImpactAnalyzer.java','risk/RiskScoreCalculator.java','evaluation/GroundTruthEvaluator.java')) {
    $benchmarkSources += Join-Path $benchmarkRoot "backend/src/main/java/com/devsphere/ax/$relative"
}
$benchmarkSources += Join-Path $benchmarkRoot 'tools/ImpactBenchmark.java'
$benchmarkSources += Join-Path $benchmarkRoot 'tools/EvaluationRegression.java'
& javac --release 17 -encoding UTF-8 -d $benchmarkBuild @benchmarkSources
if ($LASTEXITCODE -ne 0) { throw 'Benchmark compilation failed' }
& java '-Dfile.encoding=UTF-8' -cp $benchmarkBuild EvaluationRegression
if ($LASTEXITCODE -ne 0) { throw 'Evaluation regression failed' }
& java '-Dfile.encoding=UTF-8' -cp $benchmarkBuild ImpactBenchmark $benchmarkRoot
if ($LASTEXITCODE -ne 0) { throw 'Impact benchmark failed' }
