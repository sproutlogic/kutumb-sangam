"""
Prokerala Astrology API — minimal panchang client.

Fetches ONLY: tithi, nakshatra, yoga, sunrise, festival/vrat list.
Muhurta, choghadiya, kundali and everything else is intentionally excluded.

Auth: OAuth2 client_credentials. Token cached in-process (~1 hour TTL).
Cost: 10 credits per call. Free tier = 5,000 credits/month (~500 days).
"""
from __future__ import annotations

import logging
import time
from datetime import date
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_URL    = "https://api.prokerala.com/token"
_PANCHANG_URL = "https://api.prokerala.com/v2/astrology/panchang"

# In-process token cache (reset on worker restart)
_token: str | None = None
_token_expires_at: float = 0.0


def _get_token() -> str:
    global _token, _token_expires_at
    if _token and time.time() < _token_expires_at - 60:
        return _token
    s = get_settings()
    resp = httpx.post(
        _TOKEN_URL,
        data={
            "grant_type":    "client_credentials",
            "client_id":     s.prokerala_client_id,
            "client_secret": s.prokerala_client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    _token = body["access_token"]
    _token_expires_at = time.time() + body.get("expires_in", 3600)
    logger.info("Prokerala: token refreshed")
    return _token


# Festival name keywords → our special_flag values
_FESTIVAL_FLAG: dict[str, str] = {
    "ekadashi": "ekadashi", "ekadasi": "ekadashi",
    "purnima":  "purnima",  "poornima": "purnima", "pournami": "purnima",
    "amavasya": "amavasya", "amavasai": "amavasya",
    "pradosham": "pradosh", "pradosh":  "pradosh",
    "chaturthi": "chaturthi",
    "ashtami":   "ashtami",
    "navami":    "navami",
    "sankranti": "sankranti", "sankranthi": "sankranti",
}

# Tithi_id (1-30) → special_flag fallback when festival list is empty
_TITHI_FLAG: dict[int, str] = {
    4: "chaturthi", 19: "chaturthi",
    8: "ashtami",   23: "ashtami",
    9: "navami",    24: "navami",
    11: "ekadashi", 26: "ekadashi",
    13: "pradosh",  28: "pradosh",
    15: "purnima",
    30: "amavasya",
}


def _flag_from_festivals(festivals: list[dict]) -> str | None:
    for f in festivals:
        name = (f.get("name") or "").lower()
        for keyword, flag in _FESTIVAL_FLAG.items():
            if keyword in name:
                return flag
    return None


def get_day_panchang(for_date: date, lat: float, lon: float) -> dict[str, Any]:
    """
    Fetch one day's panchang from Prokerala.

    Returns a dict aligned with panchang_calendar table columns:
      gregorian_date, tithi_id, paksha, special_flag,
      nakshatra, yoga, sunrise_ts, ref_lat, ref_lon,
      + festivals (comma-separated string, informational).
    """
    token  = _get_token()
    dt_str = f"{for_date.isoformat()}T06:00:00+05:30"   # 06:00 IST = sunrise window

    resp = httpx.get(
        _PANCHANG_URL,
        params={
            "ayanamsa":   1,                    # Lahiri — Govt of India standard
            "coordinates": f"{lat},{lon}",
            "datetime":   dt_str,
            "la":         "en",
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("data", {})

    # ── Tithi ─────────────────────────────────────────────────────────────
    # Prokerala: id 1-15 per paksha. We store 1-30 (krishna += 15).
    tithi_details = (data.get("tithi") or {}).get("details") or []
    t_rec    = tithi_details[0] if tithi_details else {}
    pk_id    = int(t_rec.get("id") or 1)
    paksha   = (t_rec.get("paksha") or "shukla").lower()
    tithi_id = pk_id if paksha == "shukla" else pk_id + 15

    # ── Nakshatra — name only ─────────────────────────────────────────────
    nak_list = (data.get("nakshatra") or {}).get("details") or []
    nakshatra = nak_list[0].get("name") if nak_list else None

    # ── Yoga — name only ──────────────────────────────────────────────────
    yoga_list = (data.get("yoga") or {}).get("details") or []
    yoga = yoga_list[0].get("name") if yoga_list else None

    # ── Sunrise ───────────────────────────────────────────────────────────
    sunrise_ts = data.get("sunrise")

    # ── Masa (lunar month) ────────────────────────────────────────────────
    # Prokerala returns hindu_maah with purnimanta (North India) + amanta (South India)
    hindu_maah = data.get("hindu_maah") or {}
    # Prefer purnimanta for North India; fall back to amanta
    masa_obj  = hindu_maah.get("purnimanta") or hindu_maah.get("amanta") or {}
    masa_name = masa_obj.get("name") or None

    # ── Vikram Samvat ─────────────────────────────────────────────────────
    # Prokerala may return vikram_samvat directly; compute as fallback.
    # VS new year = Chaitra Shukla Pratipada (late March / early April).
    # Formula: +57 after April 14, +56 before (accurate to ±1 month).
    samvat_raw  = data.get("vikram_samvat")
    samvat_year = int(samvat_raw) if samvat_raw else (
        for_date.year + 57 if (for_date.month > 4 or (for_date.month == 4 and for_date.day >= 14))
        else for_date.year + 56
    )

    # ── Festivals / vrats ─────────────────────────────────────────────────
    festivals: list[dict] = data.get("festival") or []
    special_flag = _flag_from_festivals(festivals) or _TITHI_FLAG.get(tithi_id)
    festival_str = ", ".join(f.get("name", "") for f in festivals if f.get("name"))

    return {
        "gregorian_date": for_date.isoformat(),
        "tithi_id":       tithi_id,
        "paksha":         paksha,
        "special_flag":   special_flag,
        "nakshatra":      nakshatra,
        "yoga":           yoga,
        "sunrise_ts":     sunrise_ts,
        "masa_name":      masa_name,
        "samvat_year":    samvat_year,
        "is_kshaya":      False,
        "is_adhika":      False,
        "ref_lat":        lat,
        "ref_lon":        lon,
        "festivals":      festival_str,
    }
