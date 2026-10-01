#!/bin/bash
# Tally / wealth_tracker — one-click start for macOS. No Docker required.
# Double-click this file in Finder, or run: bash start.command
cd "$(dirname "$0")" || exit 1

echo "== Tally / wealth tracker =="
echo

# Python is the only prerequisite.
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. It is the only prerequisite."
  echo
  echo "  1. Install it from https://www.python.org/downloads/ (or: brew install python)"
  echo "  2. Double-click this file again"
  open "https://www.python.org/downloads/" 2>/dev/null
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

# Backend dependencies in a local virtualenv (created once).
if [ ! -x backend/.venv/bin/python ]; then
  echo "Setting up the Python environment (first run only)..."
  python3 -m venv backend/.venv || { echo "Could not create the Python environment."; read -r -p "Press Enter to close..."; exit 1; }
fi
backend/.venv/bin/pip install -q -r backend/requirements.txt

# The prebuilt UI bundle ships in the repo; rebuild only if it's missing.
if [ ! -f backend/app/static/index.html ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "Building the UI (first run only)..."
    npm ci && NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="" TALLY_STATIC_EXPORT=1 npm run build && rm -rf backend/app/static && cp -r out backend/app/static
  else
    echo "The UI bundle (backend/app/static) is missing and Node.js isn't installed to rebuild it."
    echo "Re-download the full repo, or install Node from https://nodejs.org/ and run this again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

# Zero-setup database: a SQLite file at backend/data/tally.db. Set explicitly
# so a stray .env from the Docker path can't redirect the app at Postgres.
mkdir -p backend/data
export DATABASE_URL="sqlite:///$(pwd)/backend/data/tally.db"

# Open the app in the default browser as soon as the server answers.
(
  for _ in $(seq 1 30); do
    curl -s -o /dev/null http://127.0.0.1:8000/ && break
    sleep 1
  done
  open http://127.0.0.1:8000
) &

echo "Starting Tally — your browser will open http://127.0.0.1:8000"
echo "Keep this window open while using the app. Press Ctrl+C here to stop."
echo
exec backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
