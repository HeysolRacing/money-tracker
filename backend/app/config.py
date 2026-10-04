from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://moneytracker:moneytracker@localhost:5432/moneytracker"
    session_ttl_days: int = 30
    # Set to true when the app is served over HTTPS.
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
