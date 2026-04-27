"""
Eco-Panchang APIs.

GET  /api/panchang/tithis              — all 30 tithi definitions (public, cached)
GET  /api/panchang/tithis/{id}         — single tithi with full templates
GET  /api/panchang/calendar            — rolling window (?from=&to=, max 90d)
GET  /api/panchang/today               — today's tithi + eco-recommendation (?lat=&lon=)
POST /api/panchang/calendar/seed       — manual 90-day refresh trigger (admin only)
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from constants import PANCHANG_CALENDAR_TABLE, TITHIS_TABLE, UJJAIN_LAT, UJJAIN_LON
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/panchang", tags=["panchang"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "superadmin")


def _eco_recommendation(tithi: dict[str, Any]) -> dict[str, str]:
    """Build the eco_recommendation block from tithi fields."""
    return {
        "primary":   tithi.get("eco_significance", ""),
        "plant":     tithi.get("plant_action", ""),
        "water":     tithi.get("water_action", ""),
        "avoid":     tithi.get("avoid_action", ""),
        "observe":   tithi.get("nature_observation", ""),
        "community": tithi.get("community_action", ""),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/tithis")
def list_tithis() -> list[dict[str, Any]]:
    """Return all 30 tithi definitions (public). Cached heavily — content rarely changes."""
    sb = get_supabase()
    res = sb.table(TITHIS_TABLE).select("*").order("id").execute()
    return res.data or []


@router.get("/tithis/{tithi_id}")
def get_tithi(tithi_id: int) -> dict[str, Any]:
    """Return a single tithi with full content templates."""
    if not (1 <= tithi_id <= 30):
        raise HTTPException(status_code=400, detail="tithi_id must be between 1 and 30.")
    sb = get_supabase()
    res = sb.table(TITHIS_TABLE).select("*").eq("id", tithi_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Tithi not found.")
    return res.data[0]


@router.get("/calendar")
def get_calendar(
    from_date: str = Query(default=None, alias="from", description="YYYY-MM-DD"),
    to_date:   str = Query(default=None, alias="to",   description="YYYY-MM-DD"),
) -> list[dict[str, Any]]:
    """
    Return panchang_calendar rows with embedded tithi data.
    Defaults to today → today+7. Maximum window: 90 days.
    """
    today = date.today()
    try:
        start = date.fromisoformat(from_date) if from_date else today
        end   = date.fromisoformat(to_date)   if to_date   else today + timedelta(days=7)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format.")

    if (end - start).days > 90:
        raise HTTPException(status_code=400, detail="Maximum calendar window is 90 days.")
    if end < start:
        raise HTTPException(status_code=400, detail="'to' must be after 'from'.")

    sb = get_supabase()
    res = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("*, tithis(*)")
        .gte("gregorian_date", start.isoformat())
        .lte("gregorian_date", end.isoformat())
        .order("gregorian_date")
        .execute()
    )
    return res.data or []


@router.get("/today")
def get_today(
    lat: Optional[float] = Query(default=None, description="Observer latitude (Ujjain default)"),
    lon: Optional[float] = Query(default=None, description="Observer longitude (Ujjain default)"),
) -> dict[str, Any]:
    """
    Return today's tithi with eco-recommendation.
    Optionally accepts lat/lon for location-specific sunrise tithi.
    Defaults to Ujjain (23.1809°N, 75.7771°E) — traditional Hindu meridian.
    """
    sb = get_supabase()
    today_str = date.today().isoformat()

    # Try DB first (pre-seeded)
    res = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("*, tithis(*)")
        .eq("gregorian_date", today_str)
        .limit(1)
        .execute()
    )

    if res.data:
        row = res.data[0]
        tithi = row.get("tithis") or {}
    else:
        # On-demand computation if seeder hasn't run yet
        logger.warning("panchang/today: no DB row for %s — computing on-demand", today_str)
        from workers.panchang_seeder import _compute_tithi_drik, seed_panchang_window
        ref_lat = lat or UJJAIN_LAT
        ref_lon = lon or UJJAIN_LON
        try:
            data = _compute_tithi_drik(date.today(), ref_lat, ref_lon)
            # Seed the row for future requests
            seed_panchang_window(window_days=7, lat=ref_lat, lon=ref_lon)
            # Re-fetch
            res2 = (
                sb.table(PANCHANG_CALENDAR_TABLE)
                .select("*, tithis(*)")
                .eq("gregorian_date", today_str)
                .limit(1)
                .execute()
            )
            if res2.data:
                row   = res2.data[0]
                tithi = row.get("tithis") or {}
            else:
                row   = {"gregorian_date": today_str, **data}
                tithi = {}
        except Exception:
            logger.exception("panchang/today: on-demand computation failed")
            raise HTTPException(status_code=503, detail="Panchang data not yet available. Run /calendar/seed first.")

    return {
        "date":             today_str,
        "tithi":            tithi,
        "nakshatra":        row.get("nakshatra"),
        "yoga":             row.get("yoga"),
        "masa":             row.get("masa_name"),
        "samvat_year":      row.get("samvat_year"),
        "paksha":           row.get("paksha"),
        "special_flag":     row.get("special_flag"),
        "is_kshaya":        row.get("is_kshaya", False),
        "is_adhika":        row.get("is_adhika", False),
        "sunrise_ts":       row.get("sunrise_ts"),
        "ref_lat":          row.get("ref_lat", UJJAIN_LAT),
        "ref_lon":          row.get("ref_lon", UJJAIN_LON),
        "eco_recommendation": _eco_recommendation(tithi),
    }


class SeedBody(BaseModel):
    window_days: int = 90
    lat: float = UJJAIN_LAT
    lon: float = UJJAIN_LON


@router.post("/calendar/seed")
def seed_calendar(
    body: SeedBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Manually trigger a panchang_calendar refresh. Admin only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")
    if not (7 <= body.window_days <= 365):
        raise HTTPException(status_code=400, detail="window_days must be between 7 and 365.")

    from workers.panchang_seeder import seed_panchang_window
    inserted = seed_panchang_window(window_days=body.window_days, lat=body.lat, lon=body.lon)
    return {"ok": True, "rows_seeded": inserted, "window_days": body.window_days}
