"""
Verification request APIs.

POST /api/verification/request        — queue a node for Paryavaran Mitra / Trust review
POST /api/verification/family-endorse — living family member endorses an ancestor node
                                        (auto-promotes to family-endorsed tier)
"""

from __future__ import annotations

import logging
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import PERSONS_TABLE, VERIFICATION_REQUESTS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/verification", tags=["verification"])


class VerificationRequestBody(BaseModel):
    vansha_id: UUID
    node_id: UUID
    requested_by: UUID | None = Field(
        default=None,
        description="Current signed-in user node id (best-effort until auth user_id wiring is added).",
    )


@router.post("/request")
def create_verification_request(body: VerificationRequestBody) -> dict[str, Any]:
    sb = get_supabase()
    vid = str(body.vansha_id)
    nid = str(body.node_id)
    requested_by = str(body.requested_by) if body.requested_by is not None else nid

    person = (
        sb.table(PERSONS_TABLE)
        .select("node_id")
        .eq("node_id", nid)
        .eq(VANSHA_ID_COLUMN, vid)
        .limit(1)
        .execute()
    )
    if not person.data:
        raise HTTPException(status_code=404, detail="Node not found in this vansha.")

    existing = (
        sb.table(VERIFICATION_REQUESTS_TABLE)
        .select("id,status")
        .eq(VANSHA_ID_COLUMN, vid)
        .eq("node_id", nid)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing.data:
        return {"ok": True, "already_pending": True, "request_id": existing.data[0].get("id")}

    row = {
        "id": str(uuid.uuid4()),
        VANSHA_ID_COLUMN: vid,
        "node_id": nid,
        "requested_by": requested_by,
        "status": "pending",
    }
    try:
        sb.table(VERIFICATION_REQUESTS_TABLE).insert(row).execute()
    except Exception:
        logger.exception("Verification request insert failed for vansha_id=%s node_id=%s", vid, nid)
        raise HTTPException(status_code=502, detail="Failed to save verification request") from None

    return {"ok": True, "already_pending": False, "request_id": row["id"]}


class FamilyEndorseBody(BaseModel):
    vansha_id: UUID
    node_id: UUID    # the ancestor node to endorse


@router.post("/family-endorse")
def family_endorse(body: FamilyEndorseBody, user: CurrentUser) -> dict[str, Any]:
    """
    A living family member (must own a claimed node in the vansha) endorses an
    ancestor node. Immediately promotes that node to 'family-endorsed' tier.
    """
    sb = get_supabase()
    vid = str(body.vansha_id)
    nid = str(body.node_id)
    endorser_id = str(user["id"])

    # Endorser must own a claimed node in this vansha
    owned = (
        sb.table(PERSONS_TABLE)
        .select("node_id")
        .eq(VANSHA_ID_COLUMN, vid)
        .eq("owner_id", endorser_id)
        .limit(1)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=403, detail="You must be a claimed member of this vansha to endorse.")

    # Target node must exist and be self-declared
    target = (
        sb.table(PERSONS_TABLE)
        .select("node_id,verification_tier,owner_id")
        .eq("node_id", nid)
        .eq(VANSHA_ID_COLUMN, vid)
        .limit(1)
        .execute()
    )
    if not target.data:
        raise HTTPException(status_code=404, detail="Node not found in this vansha.")

    node = target.data[0]
    if node.get("verification_tier") not in (None, "self-declared"):
        return {"ok": True, "already_endorsed": True, "tier": node["verification_tier"]}

    # Cannot endorse your own node via this route
    if node.get("owner_id") == endorser_id:
        raise HTTPException(status_code=400, detail="Use self-declaration for your own node.")

    # Promote
    sb.table(PERSONS_TABLE).update({"verification_tier": "family-endorsed"}).eq("node_id", nid).execute()

    # Audit row in verification_requests
    try:
        sb.table(VERIFICATION_REQUESTS_TABLE).insert({
            "id": str(uuid.uuid4()),
            VANSHA_ID_COLUMN: vid,
            "node_id": nid,
            "requested_by": endorser_id,
            "status": "approved",
            "method": "family-endorsed",
        }).execute()
    except Exception:
        logger.warning("Audit insert failed for family-endorse node_id=%s (non-fatal)", nid)

    logger.info("Family endorse: node=%s endorsed by user=%s", nid, endorser_id)
    return {"ok": True, "tier": "family-endorsed"}
