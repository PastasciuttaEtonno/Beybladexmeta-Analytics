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

    # --- ChallengerMode ---
    # Read through Settings, never os.environ: configuration comes from a .env
    # file that pydantic-settings parses itself and does NOT export to the
    # process environment, so os.environ.get would silently see nothing.
    challengermode_refresh_key: str = ""
    challengermode_api_key: str = ""
    challengermode_auth_url: str = ""
    challengermode_graphql_url: str = ""
    challengermode_token_cache_path: str = ""

    # How long a cached API response stays usable. Set this very high locally so
    # both backends read the same external_api_cache rows and neither calls the
    # live API, which is what makes the parity checks deterministic.
    challengermode_cache_ttl_minutes: float = 1440.0

    # Separate OAuth client credentials, used only to verify that a user
    # really placed top-four before letting them register combos.
    cm_client_id: str = ""
    cm_client_secret: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
