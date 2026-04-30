"""
Prakriti — green-cover layer APIs.
Aligns platform with MOA Objects 2, 3, 5, 6, 10, 11.

GET  /api/prakriti/score/{vansha_id}         — family Prakriti Score card
GET  /api/prakriti/leaderboard               — public top-families leaderboard (no auth)
GET  /api/prakriti/leaderboard/rank/{id}     — a family's rank on the leaderboard (no auth)
POST /api/prakriti/ceremony                  — log an eco-ceremony (Paryavaran Mitra only)
GET  /api/prakriti/circles                   — list Harit Circles (public)
POST /api/prakriti/circles                   — create a Harit Circle (Paryavaran Mitra only)
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from constants import (
    ECO_CEREMONIES_TABLE,
    ECO_CEREMONY_PRICES,
    HARIT_CIRCLES_TABLE,
    PERSONS_TABLE,
    PLATFORM_FEE_PCT,
    PRAKRITI_SCORES_TABLE,
    SAMAY_REQUESTS_TABLE,
    SAMAY_TRANSACTIONS_TABLE,
    USERS_TABLE,
)
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prakriti", tags=["prakriti"])

ECO_ACTIVITY_CATEGORIES = {
    "tree_planting", "waste_segregation", "clean_up_drive",
    "water_conservation", "eco_awareness", "solar_adoption", "composting",
}
ECO_MULTIPLIER = 1.5  # eco-activity hours earn 1.5× credits in Samay Bank


# ── Prakriti Score ────────────────────────────────────────────────────────────

def _live_eco_hours(vansha_id: str, sb: Any) -> float:
    """Aggregate completed eco-activity hours from samay_transactions for all vansha members."""
    users_res = sb.table(USERS_TABLE).select("id").eq("vansha_id", vansha_id).execute()
    user_ids = [str(u["id"]) for u in (users_res.data or [])]
    if not user_ids:
        return 0.0
    txns = (
        sb.table(SAMAY_TRANSACTIONS_TABLE)
        .select(f"final_value, {SAMAY_REQUESTS_TABLE}!request_id(category)")
        .in_("helper_id", user_ids)
        .eq("status", "completed")
        .execute()
    )
    return sum(
        float(t["final_value"])
        for t in (txns.data or [])
        if t.get("final_value") is not None
        and isinstance(t.get(SAMAY_REQUESTS_TABLE), dict)
        and t[SAMAY_REQUESTS_TABLE].get("category") in ECO_ACTIVITY_CATEGORIES
    )


@router.get("/score/{vansha_id}")
def get_prakriti_score(vansha_id: str) -> dict[str, Any]:
    """Return the live Prakriti Score card for a family (vansha).

    eco_hours is computed in real-time from completed eco-category samay_transactions.
    trees_planted and pledges_completed are stored manually via the eco-activity endpoint.
    """
    sb = get_supabase()
    stored = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("trees_planted, pledges_completed")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    row = stored.data[0] if stored.data else {"trees_planted": 0, "pledges_completed": 0}

    trees   = int(row.get("trees_planted", 0))
    pledges = int(row.get("pledges_completed", 0))
    eco_hours = _live_eco_hours(vansha_id, sb)
    score = round(trees * 10 + eco_hours * 2 + pledges * 5, 2)

    return {
        "vansha_id": vansha_id,
        "trees_planted": trees,
        "eco_hours": round(eco_hours, 2),
        "pledges_completed": pledges,
        "score": score,
    }


@router.get("/leaderboard")
def get_leaderboard(
    location: str | None = Query(default=None, description="Filter by location (case-insensitive substring)"),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    """Public leaderboard — top families by Prakriti Score. No auth required."""
    sb = get_supabase()

    scores_res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("vansha_id, score, trees_planted, eco_hours, pledges_completed")
        .order("score", desc=True)
        .limit(500)
        .execute()
    )
    scores = scores_res.data or []
    if not scores:
        return []

    vansha_ids = [r["vansha_id"] for r in scores]
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("vansha_id, last_name, current_residence, node_id")
        .in_("vansha_id", vansha_ids)
        .execute()
    )
    persons = persons_res.data or []

    by_vansha: dict[str, dict] = {}
    for p in persons:
        vid = p["vansha_id"]
        if vid not in by_vansha:
            by_vansha[vid] = {"names": [], "locations": [], "nodes": set()}
        if p.get("last_name"):
            by_vansha[vid]["names"].append(p["last_name"])
        if p.get("current_residence"):
            by_vansha[vid]["locations"].append(p["current_residence"])
        if p.get("node_id"):
            by_vansha[vid]["nodes"].add(p["node_id"])

    rows: list[dict[str, Any]] = []
    global_rank = 0
    for s in scores:
        global_rank += 1
        vid = s["vansha_id"]
        info = by_vansha.get(vid, {"names": [], "locations": [], "nodes": set()})
        names = info["names"]
        locs = info["locations"]
        family_name = (max(set(names), key=names.count) + " Parivar") if names else "Harit Parivar"
        location_str = max(set(locs), key=locs.count) if locs else "Bharat"

        if location and location.lower() not in location_str.lower():
            global_rank -= 1  # filtered out, don't count in rank
            continue

        rows.append({
            "rank": len(rows) + 1 if location else global_rank,
            "vansha_id": vid,
            "family_name": family_name,
            "location": location_str,
            "score": float(s["score"]),
            "member_count": len(info["nodes"]),
        })

    return rows[offset: offset + limit]


@router.get("/leaderboard/rank/{vansha_id}")
def get_family_rank(vansha_id: str) -> dict[str, Any]:
    """Return a family's global rank on the leaderboard. No auth required."""
    sb = get_supabase()

    my_res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("score")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    if not my_res.data:
        return {"vansha_id": vansha_id, "rank": None, "score": 0.0, "location": "Bharat", "total_families": 0, "top_percentile": 0}

    my_score = float(my_res.data[0]["score"])

    higher_res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("vansha_id", count="exact")
        .gt("score", my_score)
        .execute()
    )
    higher_count = higher_res.count or 0

    total_res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("vansha_id", count="exact")
        .execute()
    )
    total = total_res.count or 1

    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("current_residence")
        .eq("vansha_id", vansha_id)
        .limit(50)
        .execute()
    )
    locs = [p["current_residence"] for p in (persons_res.data or []) if p.get("current_residence")]
    location = max(set(locs), key=locs.count) if locs else "Bharat"

    rank = higher_count + 1
    percentile = round((1 - rank / total) * 100) if total > 1 else 100

    return {
        "vansha_id": vansha_id,
        "rank": rank,
        "score": my_score,
        "location": location,
        "total_families": total,
        "top_percentile": percentile,
    }


@router.post("/score/{vansha_id}/eco-activity")
def log_eco_activity(
    vansha_id: str,
    body: dict[str, Any],
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Increment eco-activity counters and recompute Prakriti Score."""
    sb = get_supabase()
    existing = sb.table(PRAKRITI_SCORES_TABLE).select("*").eq("vansha_id", vansha_id).limit(1).execute()
    row = existing.data[0] if existing.data else {
        "vansha_id": vansha_id, "trees_planted": 0, "eco_hours": 0.0, "pledges_completed": 0,
    }

    trees  = row["trees_planted"]   + int(body.get("trees_planted", 0))
    hours  = float(row["eco_hours"]) + float(body.get("eco_hours", 0))
    pledges = row["pledges_completed"] + int(body.get("pledges_completed", 0))
    score = trees * 10 + hours * 2 + pledges * 5

    upsert_row = {
        "vansha_id": vansha_id,
        "trees_planted": trees,
        "eco_hours": hours,
        "pledges_completed": pledges,
        "score": round(score, 2),
        "updated_at": "now()",
    }
    sb.table(PRAKRITI_SCORES_TABLE).upsert(upsert_row, on_conflict="vansha_id").execute()
    return {"ok": True, "score": score}


# ── Harit Circles ─────────────────────────────────────────────────────────────

@router.get("/circles")
def list_harit_circles() -> list[dict[str, Any]]:
    sb = get_supabase()
    res = sb.table(HARIT_CIRCLES_TABLE).select("*").order("created_at", desc=True).execute()
    return res.data or []


class HaritCircleBody(BaseModel):
    name: str
    location_name: str | None = None
    location_lat: float | None = None
    location_lon: float | None = None


@router.post("/circles")
def create_harit_circle(
    body: HaritCircleBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a Harit Circle — only a Paryavaran Mitra (pandit) may do this."""
    if not current_user.get("is_paryavaran_mitra") and current_user.get("role") not in ("margdarshak", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Only a Paryavaran Mitra can create a Harit Circle.")
    sb = get_supabase()
    row = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "paryavaran_mitra_user_id": current_user["id"],
        "location_name": body.location_name,
        "location_lat": body.location_lat,
        "location_lon": body.location_lon,
    }
    sb.table(HARIT_CIRCLES_TABLE).insert(row).execute()
    return {"ok": True, **row}


# ── Eco-Ceremonies ────────────────────────────────────────────────────────────

class CeremonyBody(BaseModel):
    ceremony_type: str
    vansha_id: str | None = None
    node_id: str | None = None


@router.post("/ceremony")
def log_ceremony(
    body: CeremonyBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Log an eco-ceremony performed by a Paryavaran Mitra and record earnings."""
    if body.ceremony_type not in ECO_CEREMONY_PRICES:
        raise HTTPException(status_code=400, detail=f"Unknown ceremony_type '{body.ceremony_type}'.")
    if not current_user.get("is_paryavaran_mitra") and current_user.get("role") not in ("margdarshak", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Only a Paryavaran Mitra can log a ceremony.")

    gross = ECO_CEREMONY_PRICES[body.ceremony_type]
    net = round(gross * (1 - PLATFORM_FEE_PCT / 100), 2)
    sb = get_supabase()
    row = {
        "id": str(uuid.uuid4()),
        "ceremony_type": body.ceremony_type,
        "paryavaran_mitra_user_id": current_user["id"],
        "vansha_id": body.vansha_id,
        "node_id": body.node_id,
        "gross_amount": gross,
        "platform_fee_pct": PLATFORM_FEE_PCT,
        "net_amount": net,
        "status": "pending",
    }
    sb.table(ECO_CEREMONIES_TABLE).insert(row).execute()
    return {"ok": True, "gross_amount": gross, "net_amount": net, "ceremony_type": body.ceremony_type}


@router.get("/ceremony/my-earnings")
def my_ceremony_earnings(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Paryavaran Mitra: total earnings breakdown by ceremony type."""
    sb = get_supabase()
    res = (
        sb.table(ECO_CEREMONIES_TABLE)
        .select("ceremony_type, net_amount, status")
        .eq("paryavaran_mitra_user_id", current_user["id"])
        .execute()
    )
    rows = res.data or []
    total_net = sum(r["net_amount"] for r in rows if r["status"] == "completed")
    by_type: dict[str, float] = {}
    for r in rows:
        by_type[r["ceremony_type"]] = by_type.get(r["ceremony_type"], 0) + r["net_amount"]
    return {"total_net_earned": round(total_net, 2), "by_ceremony": by_type, "transactions": rows}
