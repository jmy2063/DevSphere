@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0"

where java >nul 2>nul || (echo [ERROR] java was not found. Install JDK 17+ first.& pause& exit /b 1)
where javac >nul 2>nul || (echo [ERROR] javac was not found. Install a JDK, not only a JRE.& pause& exit /b 1)
for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JV=%%~V"
for /f "tokens=1 delims=." %%M in ("!JV!") do set "JMAJOR=%%M"
if "!JMAJOR!"=="1" for /f "tokens=2 delims=." %%M in ("!JV!") do set "JMAJOR=%%M"
if not defined JMAJOR (echo [ERROR] Unable to determine Java version.& pause& exit /b 1)
if !JMAJOR! LSS 17 (echo [ERROR] JDK 17+ is required. Current major: !JMAJOR!& pause& exit /b 1)

cd /d "%ROOT%backend" || exit /b 1
if exist gradlew.bat (
  call gradlew.bat bootRun --no-daemon
  exit /b !ERRORLEVEL!
)
where gradle >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Gradle CLI was not found and gradlew.bat is not bundled.
  echo Open the backend folder in IntelliJ IDEA as a Gradle project and run DevSphereAxApplication.
  echo The JDK-only core can still be verified with ..\verify-core.bat.
  pause
  exit /b 1
)
gradle bootRun --no-daemon
exit /b %ERRORLEVEL%
