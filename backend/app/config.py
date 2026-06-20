from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://wealth:wealth@localhost:5432/wealth_tracker"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
