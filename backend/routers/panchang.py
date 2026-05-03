"""
Eco-Panchang APIs.

GET  /api/panchang/tithis              — all 30 tithi definitions (public, cached)
GET  /api/panchang/tithis/{id}         — single tithi with full templates
GET  /api/panchang/calendar            — any date range (?from=&to=, max 90d);
                                         on-demand Prokerala fetch + permanent cache
                                         for missing dates — works for past centuries
                                         and decades ahead.
GET  /api/panchang/today               — today's tithi + eco-recommendation (?lat=&lon=)
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from constants import PANCHANG_ARTICLES_TABLE, PANCHANG_CALENDAR_TABLE, TITHIS_TABLE, UJJAIN_LAT, UJJAIN_LON
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/panchang", tags=["panchang"])

# In-process cache for all 30 tithis (static content, never changes)
_tithis_map: dict[int, dict] | None = None

def _load_tithis(sb) -> dict[int, dict]:
    global _tithis_map
    if _tithis_map:
        return _tithis_map
    res = sb.table(TITHIS_TABLE).select("*").execute()
    _tithis_map = {int(t["id"]): t for t in (res.data or [])}
    return _tithis_map


def _fetch_missing_from_prokerala(
    sb,
    missing_dates: list[date],
    lat: float,
    lon: float,
) -> list[dict[str, Any]]:
    """
    Parallel-fetch missing dates from Prokerala, upsert to DB, return enriched rows.
    HTTP calls are parallel (fast). DB writes are sequential (safe).
    Dates that fail are silently skipped — frontend uses Meeus fallback.
    """
    from services.prokerala import get_day_panchang

    tithis = _load_tithis(sb)

    # ── Parallel Prokerala HTTP calls ─────────────────────────────────────
    pk_results: dict[date, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(get_day_panchang, d, lat, lon): d for d in missing_dates}
        for f in as_completed(futures, timeout=45):
            d = futures[f]
            try:
                pk_results[d] = f.result()
            except Exception as exc:
                logger.warning("Prokerala: failed for %s — %s", d.isoformat(), exc)

    # ── Sequential DB upserts (thread-safe) ───────────────────────────────
    rows: list[dict] = []
    for d, pk in sorted(pk_results.items()):
        tithi = tithis.get(pk["tithi_id"], {})
        db_row = {k: v for k, v in pk.items() if k != "festivals"}
        try:
            sb.table(PANCHANG_CALENDAR_TABLE).upsert(
                db_row, on_conflict="gregorian_date"
            ).execute()
        except Exception:
            logger.warning("Prokerala: DB upsert failed for %s", d.isoformat())
        rows.append({**db_row, "tithis": tithi})

    return rows


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
    lat: Optional[float] = Query(default=None, description="Observer latitude"),
    lon: Optional[float] = Query(default=None, description="Observer longitude"),
) -> list[dict[str, Any]]:
    """
    Return panchang for any date range — past centuries or decades ahead.
    Maximum 90-day window per request.

    On-demand caching: dates not yet in DB are fetched from Prokerala in
    parallel, stored permanently, and returned alongside cached rows.
    Subsequent requests for the same dates are served from DB (0 API cost).
    """
    today_val = date.today()
    try:
        start = date.fromisoformat(from_date) if from_date else today_val
        end   = date.fromisoformat(to_date)   if to_date   else today_val + timedelta(days=7)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format.")

    if (end - start).days > 90:
        raise HTTPException(status_code=400, detail="Maximum window is 90 days.")
    if end < start:
        raise HTTPException(status_code=400, detail="'to' must be after 'from'.")

    ref_lat = lat or UJJAIN_LAT
    ref_lon = lon or UJJAIN_LON
    sb = get_supabase()

    # ── 1. Query DB cache ─────────────────────────────────────────────────
    res = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("*, tithis(*)")
        .gte("gregorian_date", start.isoformat())
        .lte("gregorian_date", end.isoformat())
        .order("gregorian_date")
        .execute()
    )
    cached_rows  = res.data or []
    cached_dates = {r["gregorian_date"] for r in cached_rows}

    # ── 2. Find missing dates ─────────────────────────────────────────────
    span        = (end - start).days + 1
    all_dates   = [start + timedelta(days=i) for i in range(span)]
    missing     = [d for d in all_dates if d.isoformat() not in cached_dates]

    # ── 3. On-demand fetch for missing dates via Prokerala ────────────────
    if missing:
        logger.info("calendar: %d missing dates — fetching from Prokerala", len(missing))
        new_rows = _fetch_missing_from_prokerala(sb, missing, ref_lat, ref_lon)
        cached_rows.extend(new_rows)

    return sorted(cached_rows, key=lambda r: r.get("gregorian_date", ""))


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

    # 3. Look up tithis (in-process cache — no extra DB round-trip)
    tithi = _load_tithis(sb).get(pk["tithi_id"], {})

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
