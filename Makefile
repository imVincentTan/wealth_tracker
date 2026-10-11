# Hot-reload API + UI. Work at http://127.0.0.1:43127
# One-click start.command/start.bat is the tester path (no reload).

.PHONY: setup run dev help

help:
	@echo "make setup  install Python venv + npm deps (first time, or after a pull)"
	@echo "make run    hot-reload API (:8000) + UI (:43127). Ctrl+C stops both."

setup:
	@if ! command -v python3 >/dev/null 2>&1; then \
		echo "Python 3 is required. https://www.python.org/downloads/"; \
		exit 1; \
	fi
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "Node/npm is required for hot reload. https://nodejs.org/"; \
		exit 1; \
	fi
	@if [ ! -x backend/.venv/bin/python ]; then \
		echo "Creating backend/.venv …"; \
		python3 -m venv backend/.venv; \
	fi
	@echo "Installing Python packages …"
	@backend/.venv/bin/pip install -q -r backend/requirements-dev.txt
	@echo "Installing npm packages …"
	@npm install
	@mkdir -p backend/data
	@echo "Done. make run"

run dev:
	@if [ ! -x backend/.venv/bin/uvicorn ]; then \
		$(MAKE) setup; \
	fi
	@echo "API  http://127.0.0.1:8000"
	@echo "UI   http://127.0.0.1:43127  ← work here"
	@echo "Ctrl+C stops both."
	@trap 'kill 0' INT TERM; \
		backend/.venv/bin/uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000 & \
		NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev & \
		wait
