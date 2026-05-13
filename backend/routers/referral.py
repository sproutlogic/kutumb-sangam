"""
Referral / Invite code management.

Privileged users (margdarshak, admin, superadmin) can generate one-time
KMI-XXXXXXXX invite codes and share them as invite links.

Admin and superadmin additionally get full cross-user stats and per-node history.
Regular users have no access to any endpoint here.
"""

from __future__ import annotations

import logging
import random
import string
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_supabase
from middleware.auth import CurrentUser

router = APIRouter(prefix="/api/referral", tags=["referral"])
logger = logging.getLogger(__name__)

_PRIVILEGED = {"margdarshak", "admin", "superadmin"}
_ADMIN      = {"admin", "superadmin"}


def _privileged(user: dict[str, Any]) -> dict[str, Any]:
    if user.get("role") not in _PRIVILEGED:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")
    return user


def _admin(user: dict[str, Any]) -> dict[str, Any]:
    if user.get("role") not in _ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required.")
    return user


def _gen_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "KMI-" + "".join(random.choices(chars, k=8))


# ── Privileged endpoints (margdarshak / admin / superadmin) ──────────

class GenerateBody(BaseModel):
    created_for: str | None = None  # optional label — name of invitee


@router.post("/generate")
def generate_invite_code(body: GenerateBody, user: CurrentUser) -> dict[str, Any]:
    """Generate a new one-time invite code."""
    _privileged(user)
    sb = get_supabase()
    for _ in range(5):
        code = _gen_code()
        try:
            res = sb.table("invite_codes").insert({
                "code": code,
                "created_by": user["id"],
                "created_for": body.created_for or None,
            }).execute()
            return res.data[0]
        except Exception as e:
            if "unique" in str(e).lower():
                continue
            logger.exception("Failed to insert invite code")
            raise HTTPException(status_code=500, detail="Failed to generate code.")
    raise HTTPException(status_code=500, detail="Could not generate a unique code — please retry.")


@router.get("/mine")
def my_codes(user: CurrentUser) -> list[dict[str, Any]]:
    """Return all invite codes created by the current user."""
    _privileged(user)
    sb = get_supabase()
    res = sb.table("invite_codes").select("*").eq("created_by", user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/revoke/{code_id}")
def revoke_code(code_id: str, user: CurrentUser) -> dict[str, Any]:
    """Revoke an active code. Only the creator or an admin can revoke."""
    _privileged(user)
    sb = get_supabase()
    row = sb.table("invite_codes").select("created_by, status").eq("id", code_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Code not found.")
    rec = row.data[0]
    if rec["created_by"] != user["id"] and user.get("role") not in _ADMIN:
        raise HTTPException(status_code=403, detail="Not your code.")
    if rec["status"] == "used":
        raise HTTPException(status_code=400, detail="Cannot revoke a used code.")
    res = sb.table("invite_codes").update({"status": "revoked"}).eq("id", code_id).execute()
    return res.data[0]


@router.post("/use")
def use_invite_code(body: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    """
    Mark an invite code as used by the authenticated user.
    Called right after registration when a new user signs up via an invite link.
    """
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="code is required.")
    sb = get_supabase()
    row = sb.table("invite_codes").select("*").eq("code", code).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Invalid invite code.")
    rec = row.data[0]
    if rec["status"] != "active":
        raise HTTPException(status_code=400, detail=f"Code is {rec['status']}.")
    if rec["created_by"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot use your own invite code.")

    # Mark used
    sb.table("invite_codes").update({
        "status": "used",
        "used_by": user["id"],
        "used_at": "now()",
    }).eq("id", rec["id"]).execute()

    # Mirror into referral_events for cross-system visibility
    try:
        sb.table("referral_events").insert({
            "kutumb_id_used": code,
            "referrer_id": rec["created_by"],
            "referred_id": user["id"],
            "event_type": "invite_accepted",
            "metadata": {"source": "invite_code", "code_id": rec["id"]},
        }).execute()
    except Exception:
        logger.warning("Could not write referral_event for code %s", code)

    return {"ok": True, "code": code}


# ── Admin / superadmin endpoints ──────────────────────────────────────

@router.get("/admin/stats")
def admin_stats(user: CurrentUser) -> dict[str, Any]:
    """Aggregate counts across all invite codes."""
    _admin(user)
    sb = get_supabase()
    codes = sb.table("invite_codes").select("status, created_by").execute().data or []
    by_creator: dict[str, int] = {}
    for c in codes:
        by_creator[c["created_by"]] = by_creator.get(c["created_by"], 0) + 1
    return {
        "total":             len(codes),
        "used":              sum(1 for c in codes if c["status"] == "used"),
        "active":            sum(1 for c in codes if c["status"] == "active"),
        "revoked":           sum(1 for c in codes if c["status"] == "revoked"),
        "unique_generators": len(by_creator),
    }


@router.get("/admin/all")
def admin_all_codes(user: CurrentUser, limit: int = 200, offset: int = 0) -> dict[str, Any]:
    """Paginated list of all invite codes with creator and user info."""
    _admin(user)
    sb = get_supabase()
    res = (
        sb.table("invite_codes")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    codes = res.data or []

    # Enrich with public.users profile for creators and recipients
    user_ids = list(
        {c["created_by"] for c in codes}
        | {c["used_by"] for c in codes if c.get("used_by")}
    )
    users_map: dict[str, dict[str, Any]] = {}
    if user_ids:
        u_res = sb.table("users").select("id, full_name, role, phone, kutumb_id").in_("id", user_ids).execute()
        users_map = {u["id"]: u for u in (u_res.data or [])}

    for c in codes:
        c["creator"]   = users_map.get(c["created_by"], {})
        c["user_info"] = users_map.get(c["used_by"], {}) if c.get("used_by") else None

    return {"codes": codes, "total": len(codes)}


@router.get("/admin/user/{user_id}")
def admin_user_history(user_id: str, user: CurrentUser) -> dict[str, Any]:
    """Full invite and referral history for a specific user node."""
    _admin(user)
    sb = get_supabase()

    profile_res = sb.table("users").select("id, full_name, role, phone, kutumb_id, created_at").eq("id", user_id).limit(1).execute()
    created_res = sb.table("invite_codes").select("*").eq("created_by", user_id).order("created_at", desc=True).execute()
    joined_via  = sb.table("invite_codes").select("*").eq("used_by", user_id).limit(1).execute()
    ref_events  = sb.table("referral_events").select("*").eq("referrer_id", user_id).order("created_at", desc=True).execute()

    return {
        "profile":         profile_res.data[0] if profile_res.data else None,
        "codes_created":   created_res.data or [],
        "joined_via":      joined_via.data[0] if joined_via.data else None,
        "referral_events": ref_events.data or [],
    }
