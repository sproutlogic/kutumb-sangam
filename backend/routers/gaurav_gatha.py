"""
Gaurav Gatha — community achievement wall.

GET  /api/gaurav-gatha           — list approved entries (optionally filtered by vansha_id)
POST /api/gaurav-gatha           — submit a new achievement (auth required)
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gaurav-gatha", tags=["gaurav-gatha"])

GAURAV_GATHA_TABLE = "gaurav_gatha"

KIND_OPTIONS = {
    "Achievement", "Service", "Ecology", "Wisdom", "Craft", "Community",
}
KIND_ICONS: dict[str, str] = {
    "Achievement": "🏆",
    "Service":     "🏫",
    "Ecology":     "🌳",
    "Wisdom":      "🪔",
    "Craft":       "📕",
    "Community":   "🩺",
}
KIND_TONES: dict[str, str] = {
    "Achievement": "var(--ds-saffron)",
    "Service":     "#a64a8e",
    "Ecology":     "#2a8068",
    "Wisdom":      "var(--ds-plum-rose)",
    "Craft":       "#a64a8e",
    "Community":   "var(--ds-saffron)",
}


class SubmitGauravGathaBody(BaseModel):
    title: str = Field(..., min_length=5, max_length=300)
    who: str   = Field(..., min_length=2, max_length=100)
    kind: str  = Field(default="Achievement")
    img: Optional[str]  = Field(default=None)
    vansha_id: Optional[str] = Field(default=None)


@router.get("")
def list_gaurav_gatha(
    vansha_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    """Return approved Gaurav Gatha entries, newest first."""
    sb = get_supabase()
    q = (
        sb.table(GAURAV_GATHA_TABLE)
        .select("id, kind, title, who, img, tone, created_at")
        .eq("approved", True)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if vansha_id:
        q = q.eq("vansha_id", vansha_id)
    res = q.execute()
    return res.data or []


@router.post("", status_code=201)
def submit_gaurav_gatha(
    body: SubmitGauravGathaBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Submit a new achievement. Auto-approved; visible immediately."""
    kind = body.kind if body.kind in KIND_OPTIONS else "Achievement"
    img  = body.img or KIND_ICONS.get(kind, "🏆")
    tone = KIND_TONES.get(kind, "var(--ds-saffron)")

    row: dict[str, Any] = {
        "kind":         kind,
        "title":        body.title.strip(),
        "who":          body.who.strip(),
        "img":          img,
        "tone":         tone,
        "approved":     True,
        "submitted_by": str(user["id"]),
    }
    if body.vansha_id:
        row["vansha_id"] = body.vansha_id

    sb = get_supabase()
    res = sb.table(GAURAV_GATHA_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save entry")
    return res.data[0]
