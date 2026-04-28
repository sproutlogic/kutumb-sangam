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
    # Keep production domains in default so critical APIs still work even when env is missing.
    allowed_origins: str = (
        "http://localhost:5173,"
        "http://localhost:8080,"
        "https://prakriti.ecotech.co.in,"
        "https://www.prakriti.ecotech.co.in"
    )

    # ── Razorpay ──────────────────────────────────────────────────────────────
    # Set these in .env once you have live credentials from Razorpay dashboard.
    razorpay_key_id:        str = ""
    razorpay_key_secret:    str = ""
    razorpay_webhook_secret: str = ""

    # ── SMTP (vendor + user email notifications) ──────────────────────────────
    smtp_host:  str = ""
    smtp_port:  int = 587
    smtp_user:  str = ""
    smtp_pass:  str = ""
    smtp_from:  str = "noreply@prakriti.ecotech.co.in"

    # ── Panchang seeder ───────────────────────────────────────────────────────
    # Optional: AstroAPI.com key for richer panchang data (nakshatra, yoga).
    # Leave blank to use the offline pyswisseph / drik-panchanga library only.
    panchang_api_key: str = ""

    # Panchang rolling window in days (seeder fills this many days ahead)
    panchang_window_days: int = 90

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def razorpay_enabled(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
