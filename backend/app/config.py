from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]

# Zero-setup default: a SQLite file next to the backend. Real deployments set
# DATABASE_URL (compose does) to Postgres.
DEFAULT_SQLITE_URL = f"sqlite:///{BACKEND_DIR / 'data' / 'tally.db'}"


class Settings(BaseSettings):
    database_url: str = DEFAULT_SQLITE_URL
    # Where import artifacts (raw CSV archives, the SQLite file) live. Raw CSVs
    # are written here on commit so they survive database resets.
    data_dir: str = str(BACKEND_DIR / "data")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
