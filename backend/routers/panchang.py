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
from datetime import date, timedelta, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from constants import PANCHANG_ARTICLES_TABLE, PANCHANG_CALENDAR_TABLE, TITHIS_TABLE, UJJAIN_LAT, UJJAIN_LON
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
    Return today's tithi, vrat and festival data via Prokerala API.
    Checks DB cache first — calls Prokerala only on cache miss, then stores result.
    Optionally accepts lat/lon for location-specific sunrise. Defaults to Ujjain.
    """
    sb        = get_supabase()
    today_str = date.today().isoformat()
    ref_lat   = lat or UJJAIN_LAT
    ref_lon   = lon or UJJAIN_LON

    # 1. DB cache hit
    cached = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("*, tithis(*)")
        .eq("gregorian_date", today_str)
        .limit(1)
        .execute()
    )
    if cached.data:
        row   = cached.data[0]
        tithi = row.get("tithis") or {}
        return _build_response(row, tithi)

    # 2. Cache miss → call Prokerala
    logger.info("panchang/today: cache miss for %s — calling Prokerala", today_str)
    from services.prokerala import get_day_panchang
    try:
        pk = get_day_panchang(date.today(), ref_lat, ref_lon)
    except Exception:
        logger.exception("Prokerala call failed for %s", today_str)
        raise HTTPException(status_code=503, detail="Panchang data unavailable — Prokerala API error.")

    # 3. Look up tithis table for eco_recommendation (by tithi_id)
    tithi_res = (
        sb.table(TITHIS_TABLE)
        .select("*")
        .eq("id", pk["tithi_id"])
        .limit(1)
        .execute()
    )
    tithi = tithi_res.data[0] if tithi_res.data else {}

    # 4. Upsert to DB so next request is served from cache
    db_row = {k: v for k, v in pk.items() if k != "festivals"}   # festivals not a DB column
    try:
        sb.table(PANCHANG_CALENDAR_TABLE).upsert(db_row, on_conflict="gregorian_date").execute()
    except Exception:
        logger.warning("panchang/today: DB upsert failed — serving uncached response")

    return _build_response({**db_row, "tithis": tithi}, tithi)


def _build_response(row: dict, tithi: dict) -> dict[str, Any]:
    return {
        "date":             row.get("gregorian_date"),
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
    """
    Pre-fill panchang_calendar for window_days ahead using Prokerala API.
    Admin only. Costs 10 Prokerala credits per day.
    """
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")
    if not (7 <= body.window_days <= 365):
        raise HTTPException(status_code=400, detail="window_days must be between 7 and 365.")

    from services.prokerala import get_day_panchang
    sb      = get_supabase()
    today   = date.today()
    seeded  = 0
    errors  = 0

    for i in range(body.window_days):
        d = today + timedelta(days=i)
        try:
            pk = get_day_panchang(d, body.lat, body.lon)
            db_row = {k: v for k, v in pk.items() if k != "festivals"}
            sb.table(PANCHANG_CALENDAR_TABLE).upsert(db_row, on_conflict="gregorian_date").execute()
            seeded += 1
        except Exception:
            logger.warning("seed: failed for %s", d.isoformat())
            errors += 1

    return {"ok": True, "rows_seeded": seeded, "errors": errors, "window_days": body.window_days}


# ── Prakriti Insights (panchang_articles) ─────────────────────────────────────

class ArticleCreate(BaseModel):
    title: str
    body: str
    related_date: Optional[str] = None   # YYYY-MM-DD or null


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    related_date: Optional[str] = None
    author_name: Optional[str] = None
    published: Optional[bool] = None


@router.get("/articles")
def list_articles(
    month: Optional[str] = Query(default=None, description="YYYY-MM — filter by calendar month"),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    List Prakriti Insights.
    Regular users: published only. Admins: all (drafts included).
    ?month=YYYY-MM filters by related_date within that month.
    """
    sb = get_supabase()
    q = sb.table(PANCHANG_ARTICLES_TABLE).select("*").order("related_date", desc=True).order("created_at", desc=True)

    if not _is_admin(current_user):
        q = q.eq("published", True)

    if month:
        try:
            from datetime import date as _date
            year, mon = int(month[:4]), int(month[5:7])
            first = _date(year, mon, 1).isoformat()
            import calendar as _cal
            last_day = _cal.monthrange(year, mon)[1]
            last = _date(year, mon, last_day).isoformat()
            q = q.gte("related_date", first).lte("related_date", last)
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="month must be in YYYY-MM format.")

    res = q.execute()
    return res.data or []


@router.post("/articles")
def create_article(
    body: ArticleCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a draft Prakriti Insight. Admin only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    payload: dict[str, Any] = {
        "title": body.title.strip(),
        "body": body.body.strip(),
        "published": False,
        "created_by": current_user.get("id"),
    }
    if body.related_date:
        try:
            date.fromisoformat(body.related_date)
            payload["related_date"] = body.related_date
        except ValueError:
            raise HTTPException(status_code=400, detail="related_date must be YYYY-MM-DD.")

    sb = get_supabase()
    res = sb.table(PANCHANG_ARTICLES_TABLE).insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create article.")
    return res.data[0]


@router.patch("/articles/{article_id}")
def update_article(
    article_id: str,
    body: ArticleUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Update a Prakriti Insight (including publishing). Admin only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    sb = get_supabase()
    existing = sb.table(PANCHANG_ARTICLES_TABLE).select("id").eq("id", article_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Article not found.")

    patch: dict[str, Any] = {}
    if body.title is not None:
        patch["title"] = body.title.strip()
    if body.body is not None:
        patch["body"] = body.body.strip()
    if body.related_date is not None:
        try:
            date.fromisoformat(body.related_date)
            patch["related_date"] = body.related_date
        except ValueError:
            raise HTTPException(status_code=400, detail="related_date must be YYYY-MM-DD.")
    if body.author_name is not None:
        patch["author_name"] = body.author_name.strip()
    if body.published is not None:
        patch["published"] = body.published

    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update.")

    res = sb.table(PANCHANG_ARTICLES_TABLE).update(patch).eq("id", article_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Update failed.")
    return res.data[0]


@router.delete("/articles/{article_id}")
def delete_article(
    article_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Hard-delete a Prakriti Insight. Admin only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    sb = get_supabase()
    existing = sb.table(PANCHANG_ARTICLES_TABLE).select("id").eq("id", article_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Article not found.")

    sb.table(PANCHANG_ARTICLES_TABLE).delete().eq("id", article_id).execute()
    return {"ok": True}
