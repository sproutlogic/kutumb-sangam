"""
Link existing persons as a marital union (male_node_id + female_node_id).

Reuses helpers from person router; aligns with Vanshavali union model (.cursorrules).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import PERSONS_TABLE, UNIONS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase
from routers.person import _anchor_generation, _insert_union, _normalize_gender

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/union", tags=["union"])


class LinkSpouseBody(BaseModel):
    vansha_id: uuid.UUID
    anchor_node_id: uuid.UUID = Field(description="Person whose profile is being edited (generation source).")
    spouse_node_id: uuid.UUID = Field(description="The other person to link as spouse.")


def _fetch_person(sb: Any, vid: str, node_id: str) -> Optional[dict[str, Any]]:
    res = (
        sb.table(PERSONS_TABLE)
        .select("*")
        .eq("node_id", node_id)
        .eq(VANSHA_ID_COLUMN, vid)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]


def _union_pair_exists(sb: Any, vid: str, male_id: str, female_id: str) -> bool:
    q = (
        sb.table(UNIONS_TABLE)
        .select("union_id")
        .eq(VANSHA_ID_COLUMN, vid)
        .eq("male_node_id", male_id)
        .eq("female_node_id", female_id)
        .limit(1)
        .execute()
    )
    return bool(q.data)


@router.post("/spouse")
def link_existing_spouses(body: LinkSpouseBody) -> dict[str, Any]:
    """Create a marital union row between two existing persons (one male, one female)."""
    sb = get_supabase()
    vid = str(body.vansha_id)
    aid = str(body.anchor_node_id)
    sid = str(body.spouse_node_id)

    if aid == sid:
        raise HTTPException(status_code=400, detail="Anchor and spouse must be different people.")

    a = _fetch_person(sb, vid, aid)
    b = _fetch_person(sb, vid, sid)
    if not a:
        raise HTTPException(status_code=404, detail="Anchor person not found in this vansha.")
    if not b:
        raise HTTPException(status_code=404, detail="Spouse person not found in this vansha.")

    ga = _normalize_gender(a.get("gender"))
    gb = _normalize_gender(b.get("gender"))
    if ga not in ("male", "female") or gb not in ("male", "female"):
        raise HTTPException(
            status_code=400,
            detail="Both persons must have gender male or female to form a marriage union.",
        )
    if ga == gb:
        raise HTTPException(
            status_code=400,
            detail="Marriage union requires one male and one female (set gender on both profiles).",
        )

    male_id, female_id = (aid, sid) if ga == "male" else (sid, aid)

    if _union_pair_exists(sb, vid, male_id, female_id):
        return {"ok": True, "already_linked": True, "vansha_id": vid}

    rel_idx = _anchor_generation(a)

    uid = _insert_union(sb, vid, male_id, female_id, rel_idx)
    if not uid:
        raise HTTPException(status_code=502, detail="Failed to create marriage union.")

    return {"ok": True, "already_linked": False, "union_id": uid, "vansha_id": vid}
