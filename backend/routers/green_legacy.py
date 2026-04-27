"""
Green Legacy APIs — public shareable family eco-profile.

GET /api/green-legacy/{vansha_id}              — public family eco-profile (no auth)
GET /api/green-legacy/{vansha_id}/timeline     — chronological eco-event feed (no auth)
GET /api/green-legacy/{vansha_id}/generations  — generational rollup (requires auth)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from constants import (
    ECO_CEREMONIES_TABLE,
    ECO_SEWA_LOGS_TABLE,
    PERSONS_TABLE,
    PRAKRITI_SCORES_TABLE,
    SERVICE_ORDERS_TABLE,
    SERVICE_PACKAGES_TABLE,
    USERS_TABLE,
    VERIFIED_ECO_ACTIONS_TABLE,
)
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/green-legacy", tags=["green-legacy"])

_optional_bearer = HTTPBearer(auto_error=False)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_prakriti_summary(vansha_id: str, sb: Any) -> dict[str, Any]:
    res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("trees_planted, eco_hours, pledges_completed, score, updated_at")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]
    return {"trees_planted": 0, "eco_hours": 0.0, "pledges_completed": 0, "score": 0.0, "updated_at": None}


def _get_sewa_summary(vansha_id: str, sb: Any) -> dict[str, Any]:
    res = (
        sb.table(ECO_SEWA_LOGS_TABLE)
        .select("status, score_contribution")
        .eq("vansha_id", vansha_id)
        .execute()
    )
    rows = res.data or []
    total   = len(rows)
    vouched = sum(1 for r in rows if r["status"] == "vouched")
    contrib = sum(float(r["score_contribution"]) for r in rows)
    return {"total": total, "vouched": vouched, "score_contribution": round(contrib, 2)}


def _get_service_summary(vansha_id: str, sb: Any) -> dict[str, Any]:
    res = (
        sb.table(SERVICE_ORDERS_TABLE)
        .select("status, package_id")
        .eq("vansha_id", vansha_id)
        .execute()
    )
    rows = res.data or []
    completed = [r for r in rows if r["status"] == "completed"]
    trees_via_service = sum(
        10 if r["package_id"] == "dashavruksha" else (1 if r["package_id"] == "taruvara" else 0)
        for r in completed
    )
    return {
        "orders_completed": len(completed),
        "trees_via_service": trees_via_service,
    }


def _get_family_info(vansha_id: str, sb: Any) -> dict[str, Any]:
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("first_name, last_name, current_residence, node_id")
        .eq("vansha_id", vansha_id)
        .limit(100)
        .execute()
    )
    persons = persons_res.data or []
    member_count = len({p["node_id"] for p in persons if p.get("node_id")})

    names = [p["last_name"] for p in persons if p.get("last_name")]
    family_name = (max(set(names), key=names.count) + " Parivar") if names else "Harit Parivar"

    residences = [p["current_residence"] for p in persons if p.get("current_residence")]
    location = max(set(residences), key=residences.count) if residences else "Bharat"

    return {
        "family_name":    family_name,
        "location":       location,
        "member_count":   member_count,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{vansha_id}")
def get_green_legacy(vansha_id: str) -> dict[str, Any]:
    """
    Public family eco-profile — no auth required.
    Aggregates Prakriti Score + Eco-Sewa + Service Orders into one Green Legacy card.
    """
    sb = get_supabase()

    prakriti  = _get_prakriti_summary(vansha_id, sb)
    sewa      = _get_sewa_summary(vansha_id, sb)
    services  = _get_service_summary(vansha_id, sb)
    family    = _get_family_info(vansha_id, sb)

    green_legacy_score = round(
        float(prakriti.get("score", 0)) + sewa["score_contribution"], 2
    )

    return {
        "vansha_id":          vansha_id,
        "family_name":        family["family_name"],
        "location":           family["location"],
        "member_count":       family["member_count"],

        # Verified (Tier 2)
        "verified_trees":     int(prakriti["trees_planted"]),
        "verified_pledges":   int(prakriti["pledges_completed"]),
        "prakriti_score":     float(prakriti["score"]),

        # Self-reported (Tier 1)
        "sewa_actions_total": sewa["total"],
        "sewa_actions_vouched": sewa["vouched"],
        "sewa_score_contrib": sewa["score_contribution"],

        # Service orders
        "orders_completed":   services["orders_completed"],
        "trees_via_service":  services["trees_via_service"],

        # Composite
        "green_legacy_score": green_legacy_score,
        "last_activity_at":   prakriti.get("updated_at"),

        # Shareable URL hint
        "share_url":          f"/green-legacy/{vansha_id}",
    }


@router.get("/{vansha_id}/timeline")
def get_timeline(
    vansha_id: str,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    """
    Chronological eco-event feed for a vansha — no auth required.
    Merges eco_sewa_logs (vouched) + verified_eco_actions (approved) + eco_ceremonies (completed).
    """
    sb = get_supabase()
    events: list[dict[str, Any]] = []

    # Tier 1: vouched sewa actions
    sewa_res = (
        sb.table(ECO_SEWA_LOGS_TABLE)
        .select("id, action_type, action_date, notes, photo_url, score_contribution, tithi_id, created_at")
        .eq("vansha_id", vansha_id)
        .eq("status", "vouched")
        .order("action_date", desc=True)
        .execute()
    )
    for r in (sewa_res.data or []):
        events.append({
            "source":      "eco_sewa",
            "action_type": r["action_type"],
            "event_date":  r["action_date"],
            "notes":       r.get("notes"),
            "photo_url":   r.get("photo_url"),
            "points":      float(r.get("score_contribution", 0)),
            "tithi_id":    r.get("tithi_id"),
            "created_at":  r["created_at"],
        })

    # Tier 2: approved verified actions
    vea_res = (
        sb.table(VERIFIED_ECO_ACTIONS_TABLE)
        .select("action_type, proof_timestamp, vendor_notes, photo_url, trees_delta, pledges_delta, created_at")
        .eq("vansha_id", vansha_id)
        .in_("status", ["approved", "auto_approved"])
        .order("created_at", desc=True)
        .execute()
    )
    for r in (vea_res.data or []):
        points = int(r.get("trees_delta", 0)) * 10 + int(r.get("pledges_delta", 0)) * 5
        events.append({
            "source":      "verified",
            "action_type": r["action_type"],
            "event_date":  (r.get("proof_timestamp") or r["created_at"])[:10],
            "notes":       r.get("vendor_notes"),
            "photo_url":   r.get("photo_url"),
            "points":      float(points),
            "tithi_id":    None,
            "created_at":  r["created_at"],
        })

    # Eco ceremonies (completed)
    try:
        cer_res = (
            sb.table(ECO_CEREMONIES_TABLE)
            .select("ceremony_type, created_at, status")
            .eq("vansha_id", vansha_id)
            .eq("status", "completed")
            .order("created_at", desc=True)
            .execute()
        )
        for r in (cer_res.data or []):
            events.append({
                "source":      "ceremony",
                "action_type": r["ceremony_type"],
                "event_date":  r["created_at"][:10],
                "notes":       None,
                "photo_url":   None,
                "points":      5.0,
                "tithi_id":    None,
                "created_at":  r["created_at"],
            })
    except Exception:
        logger.debug("green_legacy: eco_ceremonies not available — skipping")

    # Sort all events descending by created_at, then paginate
    events.sort(key=lambda e: e["created_at"], reverse=True)
    return events[offset: offset + limit]


@router.get("/{vansha_id}/generations")
def get_generations(
    vansha_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Generational rollup — groups family members by generation and shows
    their individual eco contributions. Requires authentication.
    """
    sb = get_supabase()

    # Fetch all persons in vansha with their generation depth
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id, first_name, last_name, gender, birth_year, depth, current_residence")
        .eq("vansha_id", vansha_id)
        .order("depth")
        .execute()
    )
    persons = persons_res.data or []

    if not persons:
        return {"vansha_id": vansha_id, "generations": [], "total_members": 0}

    # Group by depth (generation)
    by_depth: dict[int, list[dict]] = {}
    for p in persons:
        depth = int(p.get("depth") or 0)
        by_depth.setdefault(depth, []).append(p)

    # For each generation, aggregate eco actions from eco_sewa_logs by reporter
    sewa_res = (
        sb.table(ECO_SEWA_LOGS_TABLE)
        .select("reported_by_uid, score_contribution, status")
        .eq("vansha_id", vansha_id)
        .in_("status", ["pending", "vouched"])
        .execute()
    )
    sewa_by_uid: dict[str, float] = {}
    for r in (sewa_res.data or []):
        uid = str(r["reported_by_uid"])
        sewa_by_uid[uid] = sewa_by_uid.get(uid, 0.0) + float(r.get("score_contribution", 0))

    # Map node_id → user_id for cross-referencing
    users_res = (
        sb.table(USERS_TABLE)
        .select("id, vansha_id")
        .eq("vansha_id", vansha_id)
        .execute()
    )
    user_ids = [str(u["id"]) for u in (users_res.data or [])]

    generations = []
    for depth in sorted(by_depth.keys()):
        gen_members = by_depth[depth]
        gen_sewa_total = 0.0
        members_data = []
        for p in gen_members:
            members_data.append({
                "node_id":   p.get("node_id"),
                "name":      f"{p.get('first_name', '')} {p.get('last_name', '')}".strip(),
                "gender":    p.get("gender"),
                "birth_year": p.get("birth_year"),
                "location":  p.get("current_residence"),
            })

        generations.append({
            "generation": depth,
            "label":      _generation_label(depth),
            "member_count": len(gen_members),
            "members":    members_data,
            "sewa_score": round(gen_sewa_total, 2),
        })

    return {
        "vansha_id":     vansha_id,
        "total_members": len(persons),
        "generations":   generations,
    }


def _generation_label(depth: int) -> str:
    labels = {0: "Patriarch/Matriarch", 1: "Parents", 2: "Children", 3: "Grandchildren", 4: "Great-Grandchildren"}
    return labels.get(depth, f"Generation {depth + 1}")
