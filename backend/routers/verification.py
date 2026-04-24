"""
Verification request APIs (Pandit review queue).
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
