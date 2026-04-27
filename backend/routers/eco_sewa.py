"""
Eco-Sewa APIs — Tier 1 Self-Reported trust model.

POST  /api/eco-sewa/log                   — log an Eco-Sewa action (user)
GET   /api/eco-sewa/logs                  — vansha feed (?vansha_id=&limit=50)
PATCH /api/eco-sewa/logs/{id}/vouch       — vouch for a log (different uid, same vansha)
PATCH /api/eco-sewa/logs/{id}/dispute     — dispute a log (different uid, same vansha)
GET   /api/eco-sewa/stats/{vansha_id}     — Tier 1 summary for a vansha
"""

from __future__ import annotations

import logging
from datetime import datetime, date, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from constants import (
    ECO_SEWA_HOUR_WEIGHTS,
    ECO_SEWA_LOGS_TABLE,
    PANCHANG_CALENDAR_TABLE,
    PRAKRITI_SCORES_TABLE,
    USERS_TABLE,
)
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/eco-sewa", tags=["eco-sewa"])

VALID_ACTION_TYPES = set(ECO_SEWA_HOUR_WEIGHTS.keys())


# ── Pydantic models ───────────────────────────────────────────────────────────

class LogSewaBody(BaseModel):
    action_type:    str   = Field(..., description="One of the recognised eco-sewa action types.")
    action_date:    str   = Field(default_factory=lambda: date.today().isoformat(), description="YYYY-MM-DD")
    location_text:  Optional[str] = None
    notes:          Optional[str] = None
    photo_url:      Optional[str] = None


class DisputeBody(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_vansha(uid: str, sb: Any) -> str | None:
    res = sb.table(USERS_TABLE).select("vansha_id").eq("id", uid).limit(1).execute()
    if res.data and res.data[0].get("vansha_id"):
        return str(res.data[0]["vansha_id"])
    return None


def _today_tithi_id(sb: Any) -> int | None:
    today_str = date.today().isoformat()
    res = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("tithi_id")
        .eq("gregorian_date", today_str)
        .limit(1)
        .execute()
    )
    return res.data[0]["tithi_id"] if res.data else None


def _upsert_prakriti_hours(vansha_id: str, delta_hours: float, sb: Any) -> None:
    """Add delta_hours to prakriti_scores.eco_hours and recompute score."""
    if delta_hours <= 0:
        return
    existing = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("trees_planted, eco_hours, pledges_completed")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    row = existing.data[0] if existing.data else {
        "trees_planted": 0, "eco_hours": 0.0, "pledges_completed": 0
    }
    trees   = int(row["trees_planted"])
    hours   = float(row["eco_hours"]) + delta_hours
    pledges = int(row["pledges_completed"])
    score   = round(trees * 10 + hours * 2 + pledges * 5, 2)

    sb.table(PRAKRITI_SCORES_TABLE).upsert({
        "vansha_id":         vansha_id,
        "trees_planted":     trees,
        "eco_hours":         round(hours, 4),
        "pledges_completed": pledges,
        "score":             score,
        "updated_at":        datetime.now(timezone.utc).isoformat(),
    }, on_conflict="vansha_id").execute()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/log")
def log_sewa(
    body: LogSewaBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Log a self-reported Eco-Sewa action. Starts as 'pending' (0.5× credit)."""
    if body.action_type not in VALID_ACTION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action_type. Valid types: {sorted(VALID_ACTION_TYPES)}"
        )
    try:
        date.fromisoformat(body.action_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="action_date must be YYYY-MM-DD.")

    uid = str(current_user["id"])
    sb  = get_supabase()

    vansha_id = _get_user_vansha(uid, sb)
    if not vansha_id:
        raise HTTPException(status_code=400, detail="User has no vansha_id. Complete onboarding first.")

    # Pending weight = 0.5× action hour weight
    hour_weight = ECO_SEWA_HOUR_WEIGHTS.get(body.action_type, 0.5)
    pending_score = round(hour_weight * 0.5, 4)

    # Link to today's tithi if action_date is today
    tithi_id = None
    if body.action_date == date.today().isoformat():
        tithi_id = _today_tithi_id(sb)

    row = {
        "vansha_id":        vansha_id,
        "reported_by_uid":  uid,
        "action_type":      body.action_type,
        "action_date":      body.action_date,
        "location_text":    body.location_text,
        "notes":            body.notes,
        "photo_url":        body.photo_url,
        "tithi_id":         tithi_id,
        "status":           "pending",
        "score_contribution": pending_score,
    }
    res = sb.table(ECO_SEWA_LOGS_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=502, detail="Failed to save Eco-Sewa log.")

    log = res.data[0]

    # Apply pending (0.5×) contribution to eco_hours
    _upsert_prakriti_hours(vansha_id, pending_score, sb)

    return {
        "ok":               True,
        "log_id":           log["id"],
        "status":           "pending",
        "score_contribution": pending_score,
        "message":          "Action logged. Ask a family member in your vansha to vouch for 1× credit.",
    }


@router.get("/logs")
def get_logs(
    vansha_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return Eco-Sewa logs for the user's vansha (or specified vansha)."""
    uid = str(current_user["id"])
    sb  = get_supabase()

    if vansha_id:
        vid = vansha_id
    else:
        vid = _get_user_vansha(uid, sb)
        if not vid:
            return []

    res = (
        sb.table(ECO_SEWA_LOGS_TABLE)
        .select("*")
        .eq("vansha_id", vid)
        .order("action_date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


@router.patch("/logs/{log_id}/vouch")
def vouch_log(
    log_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Vouch for an Eco-Sewa log entry.
    Voucher must be in the same vansha as the reporter, and cannot vouch for their own log.
    On vouching: score_contribution doubles (0.5× → 1.0× weight).
    """
    uid = str(current_user["id"])
    sb  = get_supabase()

    log_res = sb.table(ECO_SEWA_LOGS_TABLE).select("*").eq("id", log_id).limit(1).execute()
    if not log_res.data:
        raise HTTPException(status_code=404, detail="Eco-Sewa log not found.")
    log = log_res.data[0]

    if log["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Log is already '{log['status']}' — cannot vouch.")
    if str(log["reported_by_uid"]) == uid:
        raise HTTPException(status_code=403, detail="You cannot vouch for your own log.")

    # Verify voucher is in same vansha
    voucher_vansha = _get_user_vansha(uid, sb)
    if not voucher_vansha or voucher_vansha != log["vansha_id"]:
        raise HTTPException(status_code=403, detail="You must be in the same vansha to vouch.")

    # Delta: upgrade from 0.5× to 1.0× weight
    action_weight = ECO_SEWA_HOUR_WEIGHTS.get(log["action_type"], 0.5)
    old_contribution = float(log["score_contribution"])
    new_contribution = round(action_weight * 1.0, 4)
    delta = new_contribution - old_contribution

    now = datetime.now(timezone.utc).isoformat()
    sb.table(ECO_SEWA_LOGS_TABLE).update({
        "status":           "vouched",
        "vouched_by_uid":   uid,
        "vouched_at":       now,
        "score_contribution": new_contribution,
        "updated_at":       now,
    }).eq("id", log_id).execute()

    # Apply the delta to prakriti_scores.eco_hours
    if delta > 0:
        _upsert_prakriti_hours(log["vansha_id"], delta, sb)

    return {
        "ok":                   True,
        "log_id":               log_id,
        "new_status":           "vouched",
        "score_contribution":   new_contribution,
        "eco_hours_delta":      round(delta, 4),
    }


@router.patch("/logs/{log_id}/dispute")
def dispute_log(
    log_id: str,
    body: DisputeBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Dispute an Eco-Sewa log. Must be in same vansha, cannot dispute own log."""
    uid = str(current_user["id"])
    sb  = get_supabase()

    log_res = sb.table(ECO_SEWA_LOGS_TABLE).select("*").eq("id", log_id).limit(1).execute()
    if not log_res.data:
        raise HTTPException(status_code=404, detail="Eco-Sewa log not found.")
    log = log_res.data[0]

    if log["status"] not in ("pending", "vouched"):
        raise HTTPException(status_code=409, detail=f"Cannot dispute a log with status '{log['status']}'.")
    if str(log["reported_by_uid"]) == uid:
        raise HTTPException(status_code=403, detail="You cannot dispute your own log.")

    disputer_vansha = _get_user_vansha(uid, sb)
    if not disputer_vansha or disputer_vansha != log["vansha_id"]:
        raise HTTPException(status_code=403, detail="You must be in the same vansha to dispute.")

    # Reverse the score contribution
    old_contribution = float(log["score_contribution"])
    now = datetime.now(timezone.utc).isoformat()
    sb.table(ECO_SEWA_LOGS_TABLE).update({
        "status":             "disputed",
        "dispute_reason":     body.reason,
        "score_contribution": 0,
        "updated_at":         now,
    }).eq("id", log_id).execute()

    # Remove the contribution from eco_hours (negative delta)
    if old_contribution > 0:
        _upsert_prakriti_hours(log["vansha_id"], -old_contribution, sb)

    return {
        "ok":       True,
        "log_id":   log_id,
        "new_status": "disputed",
    }


@router.get("/stats/{vansha_id}")
def get_sewa_stats(vansha_id: str) -> dict[str, Any]:
    """Return Tier 1 Eco-Sewa summary for a vansha."""
    sb = get_supabase()
    res = (
        sb.table(ECO_SEWA_LOGS_TABLE)
        .select("action_type, status, score_contribution")
        .eq("vansha_id", vansha_id)
        .execute()
    )
    rows = res.data or []

    total    = len(rows)
    vouched  = sum(1 for r in rows if r["status"] == "vouched")
    pending  = sum(1 for r in rows if r["status"] == "pending")
    disputed = sum(1 for r in rows if r["status"] == "disputed")
    total_score = sum(float(r["score_contribution"]) for r in rows)

    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["action_type"]] = by_type.get(r["action_type"], 0) + 1

    return {
        "vansha_id":        vansha_id,
        "total_actions":    total,
        "vouched":          vouched,
        "pending":          pending,
        "disputed":         disputed,
        "total_score_contrib": round(total_score, 2),
        "by_action_type":   by_type,
    }
