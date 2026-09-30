#!/bin/bash
# Tally / wealth_tracker — one-click start for macOS.
# Double-click this file in Finder, or run: bash start.command
cd "$(dirname "$0")" || exit 1

echo "== Tally / wealth tracker =="
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker Desktop is not installed. It is the only prerequisite."
  echo
  echo "  1. Install it from https://www.docker.com/products/docker-desktop/"
  echo "  2. Open Docker Desktop once and wait until it says it's running"
  echo "  3. Double-click this file again"
  open "https://www.docker.com/products/docker-desktop/" 2>/dev/null
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop (this can take a minute)..."
  open -a Docker 2>/dev/null || open -a "Docker Desktop" 2>/dev/null
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo
    echo "Docker didn't start in time. Open Docker Desktop yourself,"
    echo "wait for it to finish starting, then double-click this file again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

[ -f .env ] || cp .env.example .env

# Open the app in the default browser as soon as the UI answers.
(
  for _ in $(seq 1 150); do
    curl -s -o /dev/null http://127.0.0.1:43127 && break
    sleep 2
  done
  open http://127.0.0.1:43127
) &

echo "First run downloads and builds everything — give it a few minutes."
echo "Your browser will open http://127.0.0.1:43127 when the app is ready."
echo
echo "Keep this window open while using the app. Press Ctrl+C here to stop."
echo

docker compose up --build
