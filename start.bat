@echo off
rem Tally / wealth_tracker - one-click start for Windows.
rem Double-click this file in Explorer.
cd /d "%~dp0"

echo == Tally / wealth tracker ==
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not installed. It is the only prerequisite.
  echo.
  echo   1. Install it from https://www.docker.com/products/docker-desktop/
  echo   2. Open Docker Desktop once and wait until it says it's running
  echo   3. Double-click this file again
  start https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Starting Docker Desktop ^(this can take a minute^)...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  set /a tries=0
  :waitdocker
  timeout /t 2 >nul
  docker info >nul 2>nul
  if not errorlevel 1 goto dockerup
  set /a tries+=1
  if %tries% lss 60 goto waitdocker
  echo.
  echo Docker didn't start in time. Open Docker Desktop yourself,
  echo wait for it to finish starting, then double-click this file again.
  pause
  exit /b 1
)
:dockerup

if not exist .env copy .env.example .env >nul

rem Open the app in the default browser as soon as the UI answers.
start "" /min powershell -WindowStyle Hidden -Command "for ($i=0; $i -lt 150; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43127 | Out-Null; break } catch { Start-Sleep 2 } }; Start-Process http://127.0.0.1:43127"

echo First run downloads and builds everything - give it a few minutes.
echo Your browser will open http://127.0.0.1:43127 when the app is ready.
echo.
echo Keep this window open while using the app. Close it to stop the app.
echo.

docker compose up --build

echo.
echo The app has stopped.
pause
