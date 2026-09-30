@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%frontend" || exit /b 1
where node >nul 2>nul || (echo [ERROR] Node.js 20+ was not found.& pause& exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm was not found.& pause& exit /b 1)
for /f "delims=" %%V in ('node --version') do set "NV=%%V"
set "NV=!NV:v=!"
for /f "tokens=1 delims=." %%M in ("!NV!") do set "NMAJOR=%%M"
if not defined NMAJOR (echo [ERROR] Unable to determine Node.js version.& pause& exit /b 1)
if !NMAJOR! LSS 20 (echo [ERROR] Node.js 20+ is required. Current major: !NMAJOR!& pause& exit /b 1)
if not exist node_modules (
  echo [INFO] Installing frontend dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (echo [ERROR] npm install failed.& pause& exit /b 1)
)
call npm run typecheck
if errorlevel 1 (echo [ERROR] Frontend typecheck failed.& pause& exit /b 1)
call npm run dev
exit /b %ERRORLEVEL%
