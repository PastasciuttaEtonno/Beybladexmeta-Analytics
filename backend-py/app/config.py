from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Deliberately mirrors the names the Express backend already uses, so both
    services can be fed the exact same environment during the migration.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # postgresql+asyncpg://... — the Express side uses the postgres:// form, so
    # normalise it in db.py rather than forcing a second variable.
    database_url: str

    # Must match the Express SESSION_SECRET, or signed cookies will not verify
    # and users would appear logged out on whichever routes FastAPI serves.
    session_secret: str = ""

    port: int = 8000
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
