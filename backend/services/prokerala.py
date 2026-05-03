"""
Prokerala Astrology API — minimal panchang client.

Extracts from Prokerala: tithi name+paksha, vikram_samvat, festival/vrat, sunrise, sunset.
Everything else (tithi_id, masa, special_flag, samvat fallback) computed locally.

Auth: OAuth2 client_credentials. Token cached in-process (~1 hour TTL).
Cost: 10 credits per call. Free tier = 5,000 credits/month.
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
_PANCHANG_URL = "https://api.prokerala.com/v2/astrology/panchang/advanced"

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


# ── Local lookup tables ───────────────────────────────────────────────────────

# Tithi name → position within paksha (1-15)
_TITHI_NAME_NUM: dict[str, int] = {
    "pratipada": 1, "prathama": 1,
    "dwitiya": 2,   "dvitiya": 2,
    "tritiya": 3,
    "chaturthi": 4,
    "panchami": 5,
    "shashthi": 6,  "shashti": 6,
    "saptami": 7,
    "ashtami": 8,
    "navami": 9,
    "dashami": 10,
    "ekadashi": 11, "ekadasi": 11,
    "dwadashi": 12, "dvadashi": 12,
    "trayodashi": 13,
    "chaturdashi": 14,
    "purnima": 15,  "poornima": 15, "pournami": 15,
    "amavasya": 15, "amavasai": 15,
}

# Tithi_id (1-30) → special_flag
_TITHI_FLAG: dict[int, str] = {
    4: "chaturthi", 19: "chaturthi",
    8: "ashtami",   23: "ashtami",
    9: "navami",    24: "navami",
    11: "ekadashi", 26: "ekadashi",
    13: "pradosh",  28: "pradosh",
    15: "purnima",
    30: "amavasya",
}

# Festival name keywords → special_flag (overrides tithi-based flag)
_FESTIVAL_FLAG: dict[str, str] = {
    "ekadashi": "ekadashi", "ekadasi": "ekadashi",
    "purnima": "purnima",   "poornima": "purnima",
    "amavasya": "amavasya",
    "pradosham": "pradosh", "pradosh": "pradosh",
    "chaturthi": "chaturthi",
    "ashtami": "ashtami",
    "navami": "navami",
    "sankranti": "sankranti", "sankranthi": "sankranti",
}

# Approximate masa from Gregorian month+day (based on Sankranti dates, ±7 days)
# Purnimanta (North India) — starts from Shukla Pratipada after full moon
_MASA_BOUNDARIES: list[tuple[int, int, str]] = [
    # (month, day-from, masa_name)
    (1,  14, "Magha"),
    (2,  13, "Phalguna"),
    (3,  15, "Chaitra"),
    (4,  14, "Vaishakha"),
    (5,  15, "Jyeshtha"),
    (6,  15, "Ashadha"),
    (7,  17, "Shravana"),
    (8,  17, "Bhadrapada"),
    (9,  17, "Ashwin"),
    (10, 18, "Kartika"),
    (11, 17, "Margashirsha"),
    (12, 16, "Pausha"),
]


def _compute_masa(d: date) -> str:
    """Approximate lunar month from Gregorian date (accurate ±7 days around Sankranti)."""
    masa = "Pausha"  # default (Dec-Jan boundary)
    for month, day_from, name in _MASA_BOUNDARIES:
        if d.month > month or (d.month == month and d.day >= day_from):
            masa = name
    return masa


def _compute_samvat(d: date, raw: Any) -> int:
    """Vikram Samvat: use Prokerala value if present, else compute."""
    if raw:
        try:
            return int(raw)
        except (ValueError, TypeError):
            pass
    # New year = Chaitra Shukla Pratipada ≈ April 14
    return d.year + 57 if (d.month > 4 or (d.month == 4 and d.day >= 14)) else d.year + 56


def _flag_from_festivals(festivals: list[dict]) -> str | None:
    for f in festivals:
        name = (f.get("name") or "").lower()
        for keyword, flag in _FESTIVAL_FLAG.items():
            if keyword in name:
                return flag
    return None


# ── Main entry point ──────────────────────────────────────────────────────────

def get_day_panchang(for_date: date, lat: float, lon: float) -> dict[str, Any]:
    """
    Fetch panchang from Prokerala. Extracts: tithi, vikram_samvat,
    festival/vrat, sunrise, sunset. Masa, tithi_id, special_flag computed locally.
    """
    token  = _get_token()
    dt_str = f"{for_date.isoformat()}T06:00:00+05:30"

    resp = httpx.get(
        _PANCHANG_URL,
        params={
            "ayanamsa":    1,
            "coordinates": f"{lat},{lon}",
            "datetime":    dt_str,
            "la":          "en",
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("data", {})

    # ── Extract from Prokerala ────────────────────────────────────────────

    # Tithi: name + paksha
    tithi_raw = data.get("tithi") or []
    if isinstance(tithi_raw, dict):
        tithi_raw = tithi_raw.get("details") or []
    t_rec = tithi_raw[0] if tithi_raw else {}

    paksha_val = t_rec.get("paksha") or "shukla"
    if isinstance(paksha_val, dict):
        paksha_val = paksha_val.get("name") or "shukla"
    paksha = "shukla" if "shukla" in paksha_val.lower() else "krishna"

    tithi_name = (t_rec.get("name") or "").lower()

    # Nakshatra + Yoga
    nak_raw = data.get("nakshatra") or []
    if isinstance(nak_raw, dict):
        nak_raw = nak_raw.get("details") or []
    nakshatra = nak_raw[0].get("name") if nak_raw else None

    yoga_raw = data.get("yoga") or []
    if isinstance(yoga_raw, dict):
        yoga_raw = yoga_raw.get("details") or []
    yoga = yoga_raw[0].get("name") if yoga_raw else None

    # Sunrise + Sunset
    sunrise_ts = data.get("sunrise")
    sunset_ts  = data.get("sunset")

    # Festivals / vrats
    festivals: list[dict] = data.get("festival") or []
    festival_str = ", ".join(f.get("name", "") for f in festivals if f.get("name"))

    # Vikram Samvat (from Prokerala or computed)
    samvat_year = _compute_samvat(for_date, data.get("vikram_samvat"))

    # ── Compute locally ───────────────────────────────────────────────────

    # tithi_id 1-30
    pk_id = 1
    for key, num in _TITHI_NAME_NUM.items():
        if key in tithi_name:
            pk_id = num
            break
    tithi_id = pk_id if paksha == "shukla" else pk_id + 15

    # masa from Prokerala (advanced endpoint returns hindu_maah)
    hindu_maah = data.get("hindu_maah") or {}
    masa_obj   = hindu_maah.get("purnimanta") or hindu_maah.get("amanta") or {}
    masa_name  = masa_obj.get("name") or _compute_masa(for_date)  # local fallback

    # special_flag from festivals first, tithi_id fallback
    special_flag = _flag_from_festivals(festivals) or _TITHI_FLAG.get(tithi_id)

    return {
        "gregorian_date": for_date.isoformat(),
        "tithi_id":       tithi_id,
        "paksha":         paksha,
        "special_flag":   special_flag,
        "nakshatra":      nakshatra,
        "yoga":           yoga,
        "sunrise_ts":     sunrise_ts,
        "sunset_ts":      sunset_ts,
        "masa_name":      masa_name,
        "samvat_year":    samvat_year,
        "is_kshaya":      False,
        "is_adhika":      False,
        "ref_lat":        lat,
        "ref_lon":        lon,
        "festivals":      festival_str,
    }
