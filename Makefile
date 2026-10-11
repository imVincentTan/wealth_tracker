# Hot-reload API + UI. Work at http://127.0.0.1:43127
# One-click start.command/start.bat is the tester path (no reload).

.PHONY: run dev help

help:
	@echo "make run   hot-reload API (:8000) + UI (:43127). Ctrl+C stops both."

run dev:
	@if [ ! -x backend/.venv/bin/uvicorn ]; then \
		echo "No backend/.venv yet. Run ./start.command once, or:"; \
		echo "  python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt"; \
		exit 1; \
	fi
	@echo "API  http://127.0.0.1:8000"
	@echo "UI   http://127.0.0.1:43127  ← work here"
	@echo "Ctrl+C stops both."
	@trap 'kill 0' INT TERM; \
		backend/.venv/bin/uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000 & \
		NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev & \
		wait
