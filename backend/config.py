"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Prefer backend/.env; fall back to repo-root .env when uvicorn is run from `backend/`.
_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            _ROOT / ".env",
            _REPO_ROOT / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str
    supabase_service_role_key: str

    matcher_cron_minute: int = 30
    matcher_cron_hour: int = 2

    # Comma-separated list of allowed CORS origins.
    # Dev default allows Vite dev server; override in production.
    allowed_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
