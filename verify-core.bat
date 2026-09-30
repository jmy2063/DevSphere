@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "ROOT=%~dp0"
set "OUT=%ROOT%.verify-build"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%" || goto :fail

javac --release 17 -encoding UTF-8 -d "%OUT%" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\AnalysisScope.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\AnalysisSummary.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\ApiMapping.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\ClassInfo.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\EvaluationResult.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\GraphEdge.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\GraphNode.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\ImpactResult.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\NodeType.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\model\RiskAssessment.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\analyzer\JavaStaticAnalyzer.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\graph\SoftwareGraph.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\graph\GraphBuilder.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\risk\RiskScoreCalculator.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\evaluation\GroundTruthEvaluator.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\impact\ImpactAnalyzer.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\impact\ChangedNodeLocator.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\util\SafeZip.java" ^
 "%ROOT%backend\src\main\java\com\devsphere\ax\util\UnifiedDiffParser.java" ^
 "%ROOT%tools\CoreTestSuite.java"
if errorlevel 1 goto :fail

java -Dfile.encoding=UTF-8 -cp "%OUT%" CoreTestSuite "%ROOT%sample-project"
if errorlevel 1 goto :fail

rmdir /s /q "%OUT%" >nul 2>nul
echo.
echo [OK] DevSphere AX 5.0 core verification passed.
exit /b 0

:fail
if exist "%OUT%" rmdir /s /q "%OUT%" >nul 2>nul
echo.
echo [FAILED] Core verification failed.
exit /b 1
