from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Zero-setup default: a SQLite file next to the backend. Real deployments set
# DATABASE_URL (compose does) to Postgres.
DEFAULT_SQLITE_URL = f"sqlite:///{Path(__file__).resolve().parents[1] / 'data' / 'tally.db'}"


class Settings(BaseSettings):
    database_url: str = DEFAULT_SQLITE_URL

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
