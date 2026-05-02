"""
Personal relation labels — each user's own name for every node they can see.
e.g. "पिताजी", "बप्पा", "Chachu" — stored per (user_id, node_id) pair.

Routes
------
GET  /api/node-relation-labels/{vansha_id}          → all labels for this user in this vansha
POST /api/node-relation-labels                       → upsert one label
DELETE /api/node-relation-labels/{node_id}           → remove label for one node
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import NODE_RELATION_LABELS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/node-relation-labels", tags=["node-relation-labels"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class LabelUpsertBody(BaseModel):
    vansha_id: uuid.UUID
    node_id:   uuid.UUID
    label:     str = Field(..., min_length=1, max_length=120, strip_whitespace=True)


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/{vansha_id}")
def get_labels(vansha_id: uuid.UUID, user: CurrentUser) -> dict[str, Any]:
    """Return all personal labels set by this user for nodes in the given vansha."""
    sb  = get_supabase()
    uid = str(user["id"])
    vid = str(vansha_id)

    try:
        resp = (
            sb.table(NODE_RELATION_LABELS_TABLE)
            .select("node_id, label, updated_at")
            .eq("user_id",   uid)
            .eq("vansha_id", vid)
            .execute()
        )
    except Exception:
        logger.exception("node_relation_labels GET failed user=%s vansha=%s", uid, vid)
        raise HTTPException(status_code=502, detail="Failed to load relation labels") from None

    rows = resp.data or []
    # Return as { node_id: label } map — frontend only needs this shape
    labels: dict[str, str] = {r["node_id"]: r["label"] for r in rows}
    return {"vansha_id": vid, "labels": labels}


@router.post("")
def upsert_label(body: LabelUpsertBody, user: CurrentUser) -> dict[str, Any]:
    """Create or update the personal label for one node."""
    sb  = get_supabase()
    uid = str(user["id"])

    row: dict[str, Any] = {
        "user_id":   uid,
        "node_id":   str(body.node_id),
        "vansha_id": str(body.vansha_id),
        "label":     body.label,
    }

    try:
        sb.table(NODE_RELATION_LABELS_TABLE).upsert(
            row,
            on_conflict="user_id,node_id",
        ).execute()
    except Exception:
        logger.exception("node_relation_labels POST failed user=%s node=%s", uid, body.node_id)
        raise HTTPException(status_code=502, detail="Failed to save label") from None

    return {"ok": True, "node_id": str(body.node_id), "label": body.label}


@router.delete("/{node_id}")
def delete_label(node_id: uuid.UUID, user: CurrentUser) -> dict[str, Any]:
    """Remove the personal label for one node (user reverts to prompt state)."""
    sb  = get_supabase()
    uid = str(user["id"])

    try:
        sb.table(NODE_RELATION_LABELS_TABLE).delete().eq("user_id", uid).eq("node_id", str(node_id)).execute()
    except Exception:
        logger.exception("node_relation_labels DELETE failed user=%s node=%s", uid, node_id)
        raise HTTPException(status_code=502, detail="Failed to delete label") from None

    return {"ok": True, "node_id": str(node_id)}
