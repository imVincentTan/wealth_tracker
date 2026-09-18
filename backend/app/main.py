from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.routers import accounts, categories, dashboard, imports, sample, transactions
from app.services.schema import ensure_schema
from app.services.seed import seed_default_categories

app = FastAPI(title="Tally", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3847",
        "http://127.0.0.1:3847",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(imports.router)
app.include_router(transactions.router)
app.include_router(dashboard.router)
app.include_router(sample.router)


@app.on_event("startup")
def on_startup():
    ensure_schema(engine)
    db = SessionLocal()
    try:
        seed_default_categories(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
