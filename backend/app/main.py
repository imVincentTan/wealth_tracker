from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import Base, engine, SessionLocal
from app.routers import accounts, categories, dashboard, imports, transactions
from app.services.seed import seed_default_categories

app = FastAPI(title="Wealth Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:43127",
        "http://127.0.0.1:43127",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (accounts.router, categories.router, imports.router, transactions.router, dashboard.router):
    app.include_router(router, prefix="/api")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_default_categories(db)
    finally:
        db.close()


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}


class SPAStaticFiles(StaticFiles):
    """Serve the exported Next.js UI; client-side routes fall back to index.html.

    Starlette's html=True mode serves 404.html itself instead of raising, so
    both the raised and the served 404 must be intercepted. Only navigation
    requests (Accept: text/html) get the SPA shell; missing assets keep 404.
    """

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            response = None
        if response is not None and response.status_code != 404:
            return response
        wants_html = b"text/html" in dict(scope["headers"]).get(b"accept", b"")
        if wants_html:
            return await super().get_response("index.html", scope)
        if response is not None:
            return response
        raise StarletteHTTPException(status_code=404)


# Mounted last so /api routes and /docs take precedence. The bundle is built
# with TALLY_STATIC_EXPORT=1 (see README); absent in dev checkouts, where the
# UI is served by `next dev` instead.
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True), name="ui")
