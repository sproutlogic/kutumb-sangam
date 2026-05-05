"""
Pandit review queue APIs.

GET  /api/pandit/queue            — list pending verification requests (Pandit/admin only)
POST /api/pandit/review           — approve or reject a request, write audit row,
                                    update persons.verification_tier, push notification
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from constants import (
    NOTIFICATIONS_TABLE,
    PERSONS_TABLE,
    USERS_TABLE,
    VERIFICATION_AUDIT_TABLE,
    VERIFICATION_REQUESTS_TABLE,
    VANSHA_ID_COLUMN,
)
from db import get_supabase
from middleware.auth import CurrentUser, MargdarshakUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/margdarshak", tags=["margdarshak"])


class ReviewBody(BaseModel):
    request_id: str
    action: str          # "approved" | "rejected"
    notes: str | None = None


@router.get("/family")
def get_family_margdarshaks(user: CurrentUser) -> list[dict[str, Any]]:
    """Return margdarshaks linked to the current user's family tree."""
    sb = get_supabase()
    vid = user.get("vansha_id")
    if not vid:
        return []

    reqs = (
        sb.table(VERIFICATION_REQUESTS_TABLE)
        .select("id")
        .eq(VANSHA_ID_COLUMN, vid)
        .execute()
    )
    if not reqs.data:
        return []

    req_ids = [r["id"] for r in reqs.data]
    audits = (
        sb.table(VERIFICATION_AUDIT_TABLE)
        .select("pandit_user_id,action")
        .in_("verification_request_id", req_ids)
        .execute()
    )
    if not audits.data:
        return []

    pandit_ids = list({a["pandit_user_id"] for a in audits.data})
    status_map: dict[str, str] = {}
    for a in audits.data:
        pid = a["pandit_user_id"]
        status_map[pid] = "active" if a["action"] == "approved" else "verifying"

    users_res = (
        sb.table(USERS_TABLE)
        .select("id,full_name,role")
        .in_("id", pandit_ids)
        .execute()
    )
    return [
        {"id": u["id"], "full_name": u["full_name"], "status": status_map.get(u["id"], "verifying")}
        for u in (users_res.data or [])
    ]


@router.get("/verified")
def get_verified_families(pandit: MargdarshakUser) -> list[dict[str, Any]]:
    """Return all vanshas/persons this Margdarshak has approved."""
    sb = get_supabase()
    audits = (
        sb.table(VERIFICATION_AUDIT_TABLE)
        .select("verification_request_id,action,created_at")
        .eq("pandit_user_id", pandit["id"])
        .eq("action", "approved")
        .execute()
    )
    if not audits.data:
        return []

    req_ids = [a["verification_request_id"] for a in audits.data]
    reqs = (
        sb.table(VERIFICATION_REQUESTS_TABLE)
        .select("id,node_id,vansha_id,created_at")
        .in_("id", req_ids)
        .execute()
    )
    if not reqs.data:
        return []

    node_ids = list({r["node_id"] for r in reqs.data})
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id,first_name,last_name,gotra,verification_tier,vansha_id")
        .in_("node_id", node_ids)
        .execute()
    )
    person_map: dict[str, dict[str, Any]] = {p["node_id"]: p for p in (persons_res.data or [])}

    audit_ts: dict[str, str] = {a["verification_request_id"]: a["created_at"] for a in audits.data}

    return [
        {
            **req,
            "person": person_map.get(req["node_id"]),
            "approved_at": audit_ts.get(req["id"]),
        }
        for req in reqs.data
    ]


@router.get("/queue")
def get_queue(pandit: MargdarshakUser) -> list[dict[str, Any]]:
    """Return all pending verification requests with person snapshot."""
    sb = get_supabase()
    reqs = (
        sb.table(VERIFICATION_REQUESTS_TABLE)
        .select("*")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .execute()
    )
    if not reqs.data:
        return []

    node_ids = list({r["node_id"] for r in reqs.data})
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id,first_name,last_name,gender,gotra,date_of_birth,verification_tier,vansha_id")
        .in_("node_id", node_ids)
        .execute()
    )
    person_map: dict[str, dict[str, Any]] = {p["node_id"]: p for p in (persons_res.data or [])}

    return [
        {
            **req,
            "person": person_map.get(req["node_id"]),
        }
        for req in reqs.data
    ]


@router.post("/review")
def review_request(body: ReviewBody, pandit: MargdarshakUser) -> dict[str, Any]:
    """Approve or reject a verification request."""
    if body.action not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="action must be 'approved' or 'rejected'.")

    sb = get_supabase()
    req_res = (
        sb.table(VERIFICATION_REQUESTS_TABLE)
        .select("*")
        .eq("id", body.request_id)
        .limit(1)
        .execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Verification request not found.")

    req = req_res.data[0]
    if req["status"] != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Request already resolved (status={req['status']}).",
        )

    try:
        sb.table(VERIFICATION_REQUESTS_TABLE).update({"status": body.action}).eq("id", body.request_id).execute()
    except Exception:
        logger.exception("Failed to update verification request id=%s", body.request_id)
        raise HTTPException(status_code=502, detail="Failed to update request status.")

    audit_row = {
        "id": str(uuid.uuid4()),
        "verification_request_id": body.request_id,
        "pandit_user_id": pandit["id"],
        "action": body.action,
        "notes": body.notes,
    }
    try:
        sb.table(VERIFICATION_AUDIT_TABLE).insert(audit_row).execute()
    except Exception:
        logger.exception("Audit insert failed for request_id=%s", body.request_id)

    if body.action == "approved":
        try:
            sb.table(PERSONS_TABLE).update({"verification_tier": "expert-verified"}).eq("node_id", req["node_id"]).execute()
        except Exception:
            logger.exception("Failed to promote verification_tier for node_id=%s", req["node_id"])

    _send_notification(
        sb=sb,
        vansha_id=req.get(VANSHA_ID_COLUMN),
        node_id=req["node_id"],
        action=body.action,
        notes=body.notes,
    )

    return {"ok": True, "action": body.action, "request_id": body.request_id}


def _send_notification(
    *,
    sb: Any,
    vansha_id: str | None,
    node_id: str,
    action: str,
    notes: str | None,
) -> None:
    """Find the user who owns this vansha and create a notification row."""
    if not vansha_id:
        return

    user_res = (
        sb.table(USERS_TABLE)
        .select("id")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    if not user_res.data:
        return

    recipient_id = user_res.data[0]["id"]
    approved = action == "approved"

    notif = {
        "id": str(uuid.uuid4()),
        "user_id": recipient_id,
        "type": f"verification_{action}",
        "title": "Verification Approved ✓" if approved else "Verification Rejected",
        "body": (
            "A member in your Harit Vanshavali has been verified by a Paryavaran Mitra."
            if approved
            else f"Verification was not approved.{' Reason: ' + notes if notes else ''}"
        ),
        "metadata": {"node_id": node_id, "action": action},
    }
    try:
        sb.table(NOTIFICATIONS_TABLE).insert(notif).execute()
    except Exception:
        logger.exception("Failed to insert notification for user_id=%s", recipient_id)
