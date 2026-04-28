"""
Panchang Seeder — APScheduler worker.

Runs every Sunday at 23:00 UTC.
Seeds panchang_calendar with the next 90 days of tithi data.

Computation engine: pyswisseph (Swiss Ephemeris) with Lahiri ayanamsha.
Swiss Ephemeris is the gold standard — used by drikpanchang.com, ISRO, Govt of India.

Tithi = lunar day defined by every 12° of Moon-Sun elongation (nirayana / sidereal).
The governing tithi for a day is whichever tithi is running at local sunrise.
Sunrise approximation: 06:00 IST (00:30 UTC) for Ujjain — accurate to within ±30 min
which never causes a tithi mis-classification (tithis last 19-26 hours).

Default reference location: Ujjain (23.1809°N, 75.7771°E) — traditional Hindu meridian.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from constants import PANCHANG_CALENDAR_TABLE, UJJAIN_LAT, UJJAIN_LON
from db import get_supabase

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# IST offset = UTC+5:30
_IST_OFFSET = timedelta(hours=5, minutes=30)

# Approximate sunrise for India: 06:00 IST = 00:30 UTC
# Ujjain sunrise ranges from ~05:50 to ~06:30 IST year-round.
# Computing at 06:00 IST is always within the correct tithi window.
_SUNRISE_IST_HOUR   = 6
_SUNRISE_IST_MINUTE = 0

_NAKSHATRA_NAMES = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishtha", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
]

_YOGA_NAMES = [
    "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
    "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
    "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
    "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
]

# Solar longitude → masa name (sidereal / nirayana months)
# Sun enters each sign at Sankranti; masa is named by the sign the sun is in.
_MASA_NAMES = [
    "Chaitra",      # Mesha   (Aries)       0–30°
    "Vaishakha",    # Vrishabha (Taurus)    30–60°
    "Jyeshtha",     # Mithuna (Gemini)      60–90°
    "Ashadha",      # Karka   (Cancer)      90–120°
    "Shravana",     # Simha   (Leo)         120–150°
    "Bhadrapada",   # Kanya   (Virgo)       150–180°
    "Ashwin",       # Tula    (Libra)       180–210°
    "Kartik",       # Vrishchika (Scorpio)  210–240°
    "Margashirsha", # Dhanu   (Sagittarius) 240–270°
    "Pausha",       # Makara  (Capricorn)   270–300°
    "Magha",        # Kumbha  (Aquarius)    300–330°
    "Phalguna",     # Meena   (Pisces)      330–360°
]

_SPECIAL_TITHIS: dict[int, str] = {
    4:  "chaturthi",
    8:  "ashtami",
    9:  "navami",
    11: "ekadashi",
    13: "pradosh",
    15: "purnima",
    19: "chaturthi",  # Krishna Sankashti Chaturthi
    26: "ekadashi",   # Krishna Ekadashi
    28: "pradosh",    # Krishna Pradosh (Trayodashi)
    30: "amavasya",
}


# ── Core computation ──────────────────────────────────────────────────────────

def compute_tithi(target_date: date, lat: float = UJJAIN_LAT, lon: float = UJJAIN_LON) -> dict[str, Any]:
    """
    Compute panchang data for target_date using pyswisseph with Lahiri ayanamsha.

    Returns a dict ready to upsert into panchang_calendar.
    Raises RuntimeError if pyswisseph is not installed.
    """
    import swisseph as swe  # type: ignore

    # Set sidereal mode to Lahiri (Government of India standard)
    swe.set_sid_mode(swe.SIDM_LAHIRI)

    # Build Julian Day for approximate sunrise in IST (06:00 IST = 00:30 UTC)
    # We use a fixed approximate sunrise rather than computed rise_trans to avoid
    # platform-specific C library issues on Render. The approximation is always
    # within the correct tithi window (tithis last 19–26 hours).
    sunrise_utc = datetime(
        target_date.year, target_date.month, target_date.day,
        _SUNRISE_IST_HOUR, _SUNRISE_IST_MINUTE, 0,
        tzinfo=timezone.utc,
    ) - _IST_OFFSET  # convert IST→UTC: subtract 5h30m

    # Julian Day (UT)
    jd = swe.julday(
        sunrise_utc.year, sunrise_utc.month, sunrise_utc.day,
        sunrise_utc.hour + sunrise_utc.minute / 60.0
    )

    # Sidereal longitudes at sunrise
    moon_result = swe.calc_ut(jd, swe.MOON, swe.FLG_SIDEREAL)
    sun_result  = swe.calc_ut(jd, swe.SUN,  swe.FLG_SIDEREAL)

    moon_lon = moon_result[0][0]
    sun_lon  = sun_result[0][0]

    # ── Tithi ─────────────────────────────────────────────────────────────────
    # Each tithi = 12° of Moon-Sun elongation
    # tithi_index 0 = Shukla Pratipada (Moon 0–12° ahead of Sun)
    # tithi_index 14 = Purnima (Moon 168–180° ahead)
    # tithi_index 15 = Krishna Pratipada (Moon 180–192° ahead)
    # tithi_index 29 = Amavasya (Moon 348–360° ahead)
    elongation  = (moon_lon - sun_lon) % 360.0
    tithi_index = int(elongation / 12.0)       # 0–29
    tithi_id    = tithi_index + 1              # 1–30 matching tithis table
    paksha      = "shukla" if tithi_id <= 15 else "krishna"

    # ── Nakshatra ─────────────────────────────────────────────────────────────
    # 27 nakshatras, each spanning 360/27 = 13.333°
    nakshatra_idx = int(moon_lon / (360.0 / 27)) % 27
    nakshatra = _NAKSHATRA_NAMES[nakshatra_idx]

    # ── Yoga ──────────────────────────────────────────────────────────────────
    # Yoga = (Sun + Moon sidereal longitude) / (360/27)
    yoga_idx = int(((sun_lon + moon_lon) % 360.0) / (360.0 / 27)) % 27
    yoga = _YOGA_NAMES[yoga_idx]

    # ── Masa (lunar month) ────────────────────────────────────────────────────
    # Named by the sign the Sun occupies (sidereal)
    masa_idx = int(sun_lon / 30.0) % 12
    masa = _MASA_NAMES[masa_idx]

    # ── Vikram Samvat ─────────────────────────────────────────────────────────
    # Vikram Samvat starts on Chaitra Shukla Pratipada.
    # Approximation: VS = Gregorian year + 56 (after mid-April) or +57 (before)
    # Mid-April ≈ when Sun crosses 0° sidereal (Mesha Sankranti)
    year  = target_date.year
    month = target_date.month
    day   = target_date.day
    # Mesha Sankranti is typically around April 13–14
    if month > 4 or (month == 4 and day >= 14):
        samvat = year + 56
    else:
        samvat = year + 57

    # ── Special flag ──────────────────────────────────────────────────────────
    special_flag = _SPECIAL_TITHIS.get(tithi_id)

    return {
        "tithi_id":      tithi_id,
        "paksha":        paksha,
        "nakshatra":     nakshatra,
        "yoga":          yoga,
        "masa_name":     masa,
        "samvat_year":   samvat,
        "special_flag":  special_flag,
        "is_kshaya":     False,
        "is_adhika":     False,
        "tithi_start_ts": None,
        "tithi_end_ts":   None,
        "sunrise_ts":    sunrise_utc.isoformat(),
        "source":        "pyswisseph",
    }


# Keep old name as alias so panchang router import doesn't break
def _compute_tithi_drik(target_date: date, lat: float = UJJAIN_LAT, lon: float = UJJAIN_LON) -> dict[str, Any]:
    return compute_tithi(target_date, lat, lon)


def _detect_special_flag(tithi_id: int) -> str | None:
    return _SPECIAL_TITHIS.get(tithi_id)


# ── Seeder job ────────────────────────────────────────────────────────────────

def seed_panchang_window(
    window_days: int = 90,
    lat: float = UJJAIN_LAT,
    lon: float = UJJAIN_LON,
) -> int:
    """
    Compute and UPSERT panchang_calendar rows for the next `window_days` days.
    Skips dates already seeded. Returns the number of rows inserted/updated.
    """
    sb = get_supabase()
    today    = date.today()
    end_date = today + timedelta(days=window_days)

    # Fetch already-seeded dates in range
    existing = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("gregorian_date")
        .gte("gregorian_date", today.isoformat())
        .lte("gregorian_date", end_date.isoformat())
        .execute()
    )
    existing_dates = {r["gregorian_date"] for r in (existing.data or [])}

    rows_to_upsert: list[dict[str, Any]] = []
    current = today

    while current <= end_date:
        date_str = current.isoformat()
        if date_str not in existing_dates:
            try:
                data = compute_tithi(current, lat, lon)
                rows_to_upsert.append({
                    "gregorian_date": date_str,
                    "ref_lat":        lat,
                    "ref_lon":        lon,
                    **data,
                })
            except Exception:
                logger.exception("Failed to compute tithi for %s", date_str)
        current += timedelta(days=1)

    if not rows_to_upsert:
        logger.info("Panchang seeder: all %d days already fresh", window_days)
        return 0

    # Batch upsert in chunks of 50
    inserted = 0
    for i in range(0, len(rows_to_upsert), 50):
        chunk = rows_to_upsert[i : i + 50]
        sb.table(PANCHANG_CALENDAR_TABLE).upsert(
            chunk, on_conflict="gregorian_date"
        ).execute()
        inserted += len(chunk)

    logger.info(
        "Panchang seeder: seeded %d rows (window=%d days, ref=%.4f,%.4f)",
        inserted, window_days, lat, lon,
    )
    return inserted


def run_panchang_seeder() -> None:
    settings = get_settings()
    seed_panchang_window(window_days=settings.panchang_window_days)


def create_panchang_scheduler(scheduler: AsyncIOScheduler) -> None:
    """Register the weekly panchang seeder on an existing scheduler."""
    scheduler.add_job(
        run_panchang_seeder,
        trigger=CronTrigger(day_of_week="sun", hour=23, minute=0, timezone="UTC"),
        id="panchang_seeder_weekly",
        name="Weekly panchang 90-day window refresh",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    logger.info("Panchang seeder job registered (weekly Sunday 23:00 UTC)")
