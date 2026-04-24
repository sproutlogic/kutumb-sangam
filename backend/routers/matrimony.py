"""
Matrimony preferences per Vansha (family tree cluster), persisted as JSON in Supabase.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import MATRIMONY_PROFILES_TABLE, VANSHA_ID_COLUMN
from db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matrimony", tags=["matrimony"])


class MatrimonyPutBody(BaseModel):
    """Full profile object as stored from the client (same shape as frontend MatrimonyProfile)."""

    profile: dict[str, Any] = Field(..., description="MatrimonyProfile JSON")


@router.get("/{vansha_id}")
def get_matrimony(vansha_id: UUID) -> dict[str, Any]:
    """Return saved matrimony profile for this vansha, or profile: null if none."""
    sb = get_supabase()
    vid = str(vansha_id)
    try:
        resp = (
            sb.table(MATRIMONY_PROFILES_TABLE)
            .select("profile")
            .eq(VANSHA_ID_COLUMN, vid)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("Matrimony GET failed for vansha_id=%s", vid)
        raise HTTPException(status_code=502, detail="Failed to load matrimony profile") from None

    rows = list(resp.data or [])
    if not rows:
        return {"vansha_id": vid, "profile": None}
    prof = rows[0].get("profile")
    return {"vansha_id": vid, "profile": prof}


@router.put("/{vansha_id}")
def put_matrimony(vansha_id: UUID, body: MatrimonyPutBody) -> dict[str, Any]:
    """Create or replace matrimony profile JSON for this vansha."""
    sb = get_supabase()
    vid = str(vansha_id)
    row: dict[str, Any] = {
        VANSHA_ID_COLUMN: vid,
        "profile": body.profile,
    }
    try:
        sb.table(MATRIMONY_PROFILES_TABLE).upsert(row).execute()
    except Exception:
        logger.exception("Matrimony PUT failed for vansha_id=%s", vid)
        raise HTTPException(status_code=502, detail="Failed to save matrimony profile") from None

    return {"ok": True, "vansha_id": vid}
