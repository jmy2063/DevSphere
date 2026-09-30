@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0"

where npm >nul 2>nul || (echo [ERROR] npm was not found. Install Node.js 20+ first.& pause& exit /b 1)
if not exist "%ROOT%backend\gradlew.bat" (
  where gradle >nul 2>nul || (
    echo [ERROR] Gradle CLI was not found and backend\gradlew.bat is not bundled.
    echo Open backend in IntelliJ IDEA as a Gradle project and run DevSphereAxApplication,
    echo then run run-frontend.bat separately.
    pause
    exit /b 1
  )
)

start "DevSphere AX Backend" "%ComSpec%" /k call "%ROOT%run-backend.bat"
echo [INFO] Waiting for Backend health endpoint...
set "READY=0"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { $r=Invoke-RestMethod -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8080/api/health; if($r.status -eq 'UP' -or $r.status -eq 'ok' -or $r.status -eq 'OK'){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :backend_ready
  )
  timeout /t 2 /nobreak >nul
)

:backend_ready
if "!READY!"=="0" (
  echo [ERROR] Backend did not become healthy within 60 seconds.
  echo Check the Backend console for Gradle, port, or dependency errors.
  pause
  exit /b 1
)

echo [OK] Backend is healthy.
start "DevSphere AX Frontend" "%ComSpec%" /k call "%ROOT%run-frontend.bat"
echo [OK] Backend and Frontend launch windows were opened.
exit /b 0
