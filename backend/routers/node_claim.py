"""
Node ownership claim pipeline.

POST /api/person/{node_id}/claim
    Authenticated user submits a claim on a person node.
    Returns { ok, status: "pending", claim_id }.

GET /api/person/claims/pending?vansha_id=<uuid>
    Tree creator lists pending claims for nodes in their vansha.

POST /api/person/claim/{claim_id}/approve
    Tree creator approves — transfers owner_id to claimant, marks claim approved.

POST /api/person/claim/{claim_id}/reject
    Tree creator rejects with optional reason.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from constants import NODE_CLAIMS_TABLE, PERSONS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/person", tags=["node-claim"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_token(user: dict[str, Any]) -> str:
    return str(user.get("id", ""))


class RejectBody(BaseModel):
    reason: Optional[str] = None


# ── Submit claim ───────────────────────────────────────────────────────────────

@router.post("/{node_id}/claim")
def claim_node(node_id: str, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    claimant_id = str(user["id"])

    # Verify node exists
    node_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id,vansha_id,owner_id")
        .eq("node_id", node_id)
        .limit(1)
        .execute()
    )
    if not node_res.data:
        raise HTTPException(status_code=404, detail="Person node not found.")

    node = node_res.data[0]
    vansha_id = str(node.get(VANSHA_ID_COLUMN) or node.get("vansha_id") or "")

    # Already owned by claimant
    if node.get("owner_id") == claimant_id:
        raise HTTPException(status_code=409, detail="You already own this node.")

    # Check for existing pending/approved claim by this user
    existing = (
        sb.table(NODE_CLAIMS_TABLE)
        .select("id,status")
        .eq("node_id", node_id)
        .eq("claimant_id", claimant_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        ex = existing.data[0]
        if ex["status"] == "approved":
            raise HTTPException(status_code=409, detail="Your claim was already approved.")
        if ex["status"] == "pending":
            return {"ok": True, "status": "pending", "claim_id": ex["id"]}
        # rejected — allow re-claim by deleting old row
        sb.table(NODE_CLAIMS_TABLE).delete().eq("id", ex["id"]).execute()

    claim_id = str(uuid.uuid4())
    sb.table(NODE_CLAIMS_TABLE).insert({
        "id": claim_id,
        "node_id": node_id,
        "vansha_id": vansha_id,
        "claimant_id": claimant_id,
        "status": "pending",
    }).execute()

    logger.info("Node claim submitted claim_id=%s node=%s claimant=%s", claim_id, node_id, claimant_id)
    return {"ok": True, "status": "pending", "claim_id": claim_id}


# ── List pending claims (for vansha creator) ───────────────────────────────────

@router.get("/claims/pending")
def list_pending_claims(vansha_id: str, user: CurrentUser) -> list[dict[str, Any]]:
    sb = get_supabase()
    user_id = str(user["id"])

    # Verify caller is a member of this vansha (owns at least one node)
    member_check = (
        sb.table(PERSONS_TABLE)
        .select("node_id")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .eq("owner_id", user_id)
        .limit(1)
        .execute()
    )
    if not member_check.data and user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Only vansha members can view claims.")

    claims_res = (
        sb.table(NODE_CLAIMS_TABLE)
        .select("*")
        .eq("vansha_id", vansha_id)
        .eq("status", "pending")
        .order("created_at", desc=False)
        .execute()
    )
    return claims_res.data or []


# ── Approve claim ──────────────────────────────────────────────────────────────

@router.post("/claim/{claim_id}/approve")
def approve_claim(claim_id: str, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    reviewer_id = str(user["id"])

    claim_res = (
        sb.table(NODE_CLAIMS_TABLE)
        .select("*")
        .eq("id", claim_id)
        .limit(1)
        .execute()
    )
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    if claim["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Claim already resolved: {claim['status']}.")

    vansha_id = str(claim["vansha_id"])

    # Caller must own a node in this vansha (i.e. is a member/creator)
    member_check = (
        sb.table(PERSONS_TABLE)
        .select("node_id")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .eq("owner_id", reviewer_id)
        .limit(1)
        .execute()
    )
    if not member_check.data and user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Only vansha members can approve claims.")

    now = _now()
    # Transfer ownership
    sb.table(PERSONS_TABLE).update({"owner_id": claim["claimant_id"]}).eq("node_id", claim["node_id"]).execute()
    # Mark claim approved
    sb.table(NODE_CLAIMS_TABLE).update({
        "status": "approved",
        "reviewed_by": reviewer_id,
        "reviewed_at": now,
    }).eq("id", claim_id).execute()

    logger.info("Node claim approved claim_id=%s node=%s by=%s", claim_id, claim["node_id"], reviewer_id)
    return {"ok": True, "claim_id": claim_id, "node_id": claim["node_id"]}


# ── Reject claim ───────────────────────────────────────────────────────────────

@router.post("/claim/{claim_id}/reject")
def reject_claim(claim_id: str, body: RejectBody, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    reviewer_id = str(user["id"])

    claim_res = (
        sb.table(NODE_CLAIMS_TABLE)
        .select("*")
        .eq("id", claim_id)
        .limit(1)
        .execute()
    )
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found.")
    claim = claim_res.data[0]

    if claim["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Claim already resolved: {claim['status']}.")

    vansha_id = str(claim["vansha_id"])
    member_check = (
        sb.table(PERSONS_TABLE)
        .select("node_id")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .eq("owner_id", reviewer_id)
        .limit(1)
        .execute()
    )
    if not member_check.data and user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Only vansha members can reject claims.")

    sb.table(NODE_CLAIMS_TABLE).update({
        "status": "rejected",
        "reviewed_by": reviewer_id,
        "reviewed_at": _now(),
        "reject_reason": body.reason,
    }).eq("id", claim_id).execute()

    logger.info("Node claim rejected claim_id=%s node=%s by=%s", claim_id, claim["node_id"], reviewer_id)
    return {"ok": True, "claim_id": claim_id}
