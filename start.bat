@echo off
rem Tally / wealth_tracker - one-click start for Windows. No Docker required.
rem Double-click this file in Explorer.
cd /d "%~dp0"

echo == Tally / wealth tracker ==
echo.

rem Python is the only prerequisite.
set PY=
where py >nul 2>nul && set PY=py
if not defined PY (
  where python >nul 2>nul && set PY=python
)
if not defined PY (
  echo Python 3 is not installed. It is the only prerequisite.
  echo.
  echo   1. Install it from https://www.python.org/downloads/
  echo      ^(tick "Add python.exe to PATH" during setup^)
  echo   2. Double-click this file again
  start https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)

rem Backend dependencies in a local virtualenv (created once).
if not exist backend\.venv\Scripts\python.exe (
  echo Setting up the Python environment ^(first run only^)...
  %PY% -m venv backend\.venv
  if errorlevel 1 (
    echo Could not create the Python environment.
    pause
    exit /b 1
  )
)
backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt

rem The prebuilt UI bundle ships in the repo; rebuild only if it's missing.
if not exist backend\app\static\index.html (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo The UI bundle ^(backend\app\static^) is missing and Node.js isn't installed to rebuild it.
    echo Re-download the full repo, or install Node from https://nodejs.org/ and run this again.
    pause
    exit /b 1
  )
  echo Building the UI ^(first run only^)...
  call npm ci
  set TALLY_STATIC_EXPORT=1
  set NEXT_PUBLIC_API_URL=
  set NEXT_TELEMETRY_DISABLED=1
  call npm run build
  rmdir /s /q backend\app\static
  xcopy /e /i /q out backend\app\static >nul
)

rem Zero-setup database: a SQLite file at backend\data\tally.db. Set explicitly
rem so a stray .env from the Docker path can't redirect the app at Postgres.
if not exist backend\data mkdir backend\data
set DATABASE_URL=sqlite:///%CD%\backend\data\tally.db

rem Open the app in the default browser as soon as the server answers.
start "" /min powershell -WindowStyle Hidden -Command "for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/ | Out-Null; break } catch { Start-Sleep 1 } }; Start-Process http://127.0.0.1:8000"

echo Starting Tally - your browser will open http://127.0.0.1:8000
echo Keep this window open while using the app. Close the window to stop.
echo.
backend\.venv\Scripts\uvicorn.exe app.main:app --app-dir backend --host 127.0.0.1 --port 8000

echo.
echo The app has stopped.
pause
