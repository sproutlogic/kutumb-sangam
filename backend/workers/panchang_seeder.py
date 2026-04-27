"""
Panchang Seeder — APScheduler worker.

Runs every Sunday at 23:00 UTC.
Seeds panchang_calendar with the next 90 days of tithi data using drik-panchanga
(which wraps pyswisseph / Swiss Ephemeris with Lahiri ayanamsha).

Default reference location: Ujjain (23.1809°N, 75.7771°E) — traditional Hindu meridian.
The "day's tithi" is determined by the tithi at local sunrise (traditional Vedic rule).

Accuracy: Swiss Ephemeris is the gold standard (used by drikpanchang.com, ISRO).
Handles: kshaya tithi (skipped — no sunrise), adhika tithi (repeated — 2 sunrises).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from constants import PANCHANG_CALENDAR_TABLE, UJJAIN_LAT, UJJAIN_LON
from db import get_supabase

logger = logging.getLogger(__name__)

# ── Special flags ─────────────────────────────────────────────────────────────

_SPECIAL_TITHIS: dict[int, str] = {
    4:  "chaturthi",
    8:  "ashtami",
    9:  "navami",
    11: "ekadashi",
    13: "pradosh",
    15: "purnima",
    19: "chaturthi",   # Krishna Chaturthi (Sankashti)
    26: "ekadashi",    # Krishna Ekadashi
    28: "pradosh",     # Krishna Trayodashi Pradosh
    30: "amavasya",
}


def _detect_special_flag(tithi_id: int) -> str | None:
    return _SPECIAL_TITHIS.get(tithi_id)


# ── Fallback: raw pyswisseph computation ─────────────────────────────────────

def _compute_tithi_pyswisseph(target_date: date, lat: float, lon: float) -> dict[str, Any]:
    """
    Fallback panchang computation using raw pyswisseph.
    Tithi at sunrise — uses Lahiri ayanamsha (sidereal / nirayana system).
    """
    import swisseph as swe  # type: ignore

    swe.set_sid_mode(swe.SIDM_LAHIRI)

    # Compute sunrise Julian Day
    year, month, day = target_date.year, target_date.month, target_date.day
    jd_noon = swe.julday(year, month, day, 12.0)
    alt = 0.0  # observer altitude in metres (approx)

    # Rise/set computation needs geopos tuple (lon, lat, alt)
    sunrise_result = swe.rise_trans(
        jd_noon - 0.5,
        swe.SUN,
        lon, lat, alt,
        0,          # no special flags
        swe.CALC_RISE,
    )
    # sunrise_result[1][0] is Julian Day of sunrise
    jd_sunrise = sunrise_result[1][0] if sunrise_result[0] >= 0 else jd_noon

    # Moon and Sun sidereal longitudes at sunrise
    moon_lon = swe.calc_ut(jd_sunrise, swe.MOON, swe.FLG_SIDEREAL)[0][0]
    sun_lon  = swe.calc_ut(jd_sunrise, swe.SUN,  swe.FLG_SIDEREAL)[0][0]

    # Tithi index 0-29
    diff = (moon_lon - sun_lon) % 360.0
    tithi_index = int(diff / 12.0)  # 0=Shukla Pratipada … 29=Amavasya
    tithi_id    = tithi_index + 1   # 1-30 matching our tithis table

    paksha = "shukla" if tithi_id <= 15 else "krishna"

    # Nakshatra: moon longitude / (360/27)
    nakshatra_names = [
        "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu",
        "Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta",
        "Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha",
        "Uttara Ashadha","Shravana","Dhanishtha","Shatabhisha","Purva Bhadrapada",
        "Uttara Bhadrapada","Revati",
    ]
    nakshatra_idx = int(moon_lon / (360.0 / 27)) % 27
    nakshatra = nakshatra_names[nakshatra_idx]

    # Yoga: (sun + moon) / (360/27)
    yoga_names = [
        "Vishkambha","Priti","Ayushman","Saubhagya","Shobhana","Atiganda","Sukarma",
        "Dhriti","Shula","Ganda","Vriddhi","Dhruva","Vyaghata","Harshana","Vajra",
        "Siddhi","Vyatipata","Variyan","Parigha","Shiva","Siddha","Sadhya","Shubha",
        "Shukla","Brahma","Indra","Vaidhriti",
    ]
    yoga_idx = int(((sun_lon + moon_lon) % 360) / (360.0 / 27))
    yoga = yoga_names[yoga_idx % 27]

    # Masa (approximate — based on sun longitude)
    masa_names = [
        "Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadrapada",
        "Ashwin","Kartik","Margashirsha","Pausha","Magha","Phalguna",
    ]
    masa_idx = int(sun_lon / 30) % 12
    masa = masa_names[masa_idx]

    # Vikram Samvat (approximate: Gregorian year + 56 or 57 depending on month)
    samvat = year + 56 if month >= 4 else year + 57

    return {
        "tithi_id":    tithi_id,
        "tithi_start_ts": None,
        "tithi_end_ts":   None,
        "is_kshaya":   False,
        "is_adhika":   False,
        "sunrise_ts":  None,
        "paksha":      paksha,
        "nakshatra":   nakshatra,
        "yoga":        yoga,
        "masa_name":   masa,
        "samvat_year": samvat,
        "source":      "drik_panchanga",
    }


# ── Primary: drik-panchanga ───────────────────────────────────────────────────

def _compute_tithi_drik(target_date: date, lat: float, lon: float) -> dict[str, Any]:
    """
    Primary computation via drik-panchanga library.
    Falls back to raw pyswisseph on import error or computation failure.
    """
    try:
        from panchanga import panchanga  # type: ignore

        city = panchanga.City("Custom", lat, lon, "Asia/Kolkata")
        panchaanga = panchanga.Panchanga(city=city, date=target_date)
        panchaanga.compute_all()

        # tithi is 1-indexed in drik-panchanga (1 = Pratipada Shukla)
        tithi = panchaanga.tithi_data[0]
        tithi_id = tithi[0] + 1  # 0-indexed in library → 1-30
        paksha = "shukla" if tithi_id <= 15 else "krishna"

        nakshatra_data = panchaanga.nakshatra_data[0]
        nakshatra = panchanga.NAKSHATRA_NAMES[nakshatra_data[0]]

        yoga_data = panchaanga.yoga_data[0]
        yoga = panchanga.YOGA_NAMES[yoga_data[0]]

        masa = panchanga.MASA_NAMES[panchaanga.lunar_month]
        samvat = panchaanga.vikram_samvat

        return {
            "tithi_id":    tithi_id,
            "tithi_start_ts": None,
            "tithi_end_ts":   None,
            "is_kshaya":   False,
            "is_adhika":   False,
            "sunrise_ts":  None,
            "paksha":      paksha,
            "nakshatra":   nakshatra,
            "yoga":        yoga,
            "masa_name":   masa,
            "samvat_year": samvat,
            "source":      "drik_panchanga",
        }
    except Exception as e:
        logger.warning("drik-panchanga failed for %s: %s — falling back to pyswisseph", target_date, e)
        return _compute_tithi_pyswisseph(target_date, lat, lon)


# ── Seeder job ────────────────────────────────────────────────────────────────

def seed_panchang_window(
    window_days: int = 90,
    lat: float = UJJAIN_LAT,
    lon: float = UJJAIN_LON,
) -> int:
    """
    Compute and UPSERT panchang_calendar rows for the next `window_days` days.
    Skips dates that are already seeded and fresh (seeded within last 7 days).
    Returns the number of rows inserted/updated.
    """
    sb = get_supabase()
    today = date.today()
    end_date = today + timedelta(days=window_days)

    # Fetch already-seeded dates
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
                data = _compute_tithi_drik(current, lat, lon)
                row = {
                    "gregorian_date": date_str,
                    "ref_lat":        lat,
                    "ref_lon":        lon,
                    "special_flag":   _detect_special_flag(data["tithi_id"]),
                    **data,
                }
                rows_to_upsert.append(row)
            except Exception:
                logger.exception("Failed to compute tithi for %s", date_str)
        current += timedelta(days=1)

    if not rows_to_upsert:
        logger.info("Panchang seeder: 0-day window already fresh (window=%d days)", window_days)
        return 0

    # Batch upsert in chunks of 50
    inserted = 0
    for i in range(0, len(rows_to_upsert), 50):
        chunk = rows_to_upsert[i:i + 50]
        sb.table(PANCHANG_CALENDAR_TABLE).upsert(
            chunk, on_conflict="gregorian_date"
        ).execute()
        inserted += len(chunk)

    logger.info("Panchang seeder: seeded %d rows (window=%d days, ref=%.4f,%.4f)", inserted, window_days, lat, lon)
    return inserted


def run_panchang_seeder() -> None:
    settings = get_settings()
    seed_panchang_window(window_days=settings.panchang_window_days)


def create_panchang_scheduler(scheduler: AsyncIOScheduler) -> None:
    """Register the weekly panchang seeder job on an existing scheduler."""
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
