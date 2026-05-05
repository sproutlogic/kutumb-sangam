"""
Tree v2 router — relationships edge model + vanshas metadata + canvas offsets.

Endpoints:
  GET    /api/tree-v2/{vansha_id}/relationships   — list all edges in a tree
  POST   /api/tree-v2/relationships               — create edge (parent_of | spouse_of)
  PATCH  /api/tree-v2/relationships/{id}          — update edge subtype
  DELETE /api/tree-v2/relationships/{id}          — remove edge

  GET    /api/tree-v2/vanshas/{vansha_id}         — fetch tree metadata
  PATCH  /api/tree-v2/vanshas/{vansha_id}         — update name / founder
  GET    /api/tree-v2/vanshas/by-code/{code}      — lookup by VS code

  PATCH  /api/tree-v2/persons/{node_id}/offset    — save canvas drag offset
  DELETE /api/tree-v2/persons/{node_id}/offset    — clear offset (revert to auto)

  GET    /api/tree-v2/persons/{node_id}/integrity — relationship integrity report
"""

from __future__ import annotations

import logging
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import PERSONS_TABLE, RELATIONSHIPS_TABLE, VANSHAS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tree-v2", tags=["tree-v2"])


# ─── Models ──────────────────────────────────────────────────────────────────

EdgeType = Literal["parent_of", "spouse_of"]
EdgeSubtype = Literal["biological", "adopted", "step"]


class RelationshipCreate(BaseModel):
    vansha_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    type: EdgeType
    subtype: EdgeSubtype = "biological"


class RelationshipPatch(BaseModel):
    subtype: EdgeSubtype


class VanshaPatch(BaseModel):
    vansh_name: Optional[str] = None
    founder_node_id: Optional[UUID] = None


class OffsetBody(BaseModel):
    canvas_offset_x: float = Field(..., ge=-100000, le=100000)
    canvas_offset_y: float = Field(..., ge=-100000, le=100000)


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _person_or_404(node_id: str) -> dict[str, Any]:
    sb = get_supabase()
    res = sb.table(PERSONS_TABLE).select("*").eq("node_id", node_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Person not found")
    return res.data[0]


# ─── Relationships ───────────────────────────────────────────────────────────


@router.get("/{vansha_id}/relationships")
def list_relationships(vansha_id: UUID, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    res = (
        sb.table(RELATIONSHIPS_TABLE)
        .select("*")
        .eq(VANSHA_ID_COLUMN, str(vansha_id))
        .execute()
    )
    return {"vansha_id": str(vansha_id), "relationships": list(res.data or [])}


@router.post("/relationships")
def create_relationship(body: RelationshipCreate, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()

    if body.from_node_id == body.to_node_id:
        raise HTTPException(status_code=400, detail="from_node_id and to_node_id must differ")

    # Both endpoints must exist and live in the same vansha.
    pa = sb.table(PERSONS_TABLE).select("node_id, vansha_id, gender").eq("node_id", str(body.from_node_id)).limit(1).execute()
    pb = sb.table(PERSONS_TABLE).select("node_id, vansha_id, gender").eq("node_id", str(body.to_node_id)).limit(1).execute()
    if not pa.data or not pb.data:
        raise HTTPException(status_code=404, detail="One or both persons not found")
    if pa.data[0]["vansha_id"] != str(body.vansha_id) or pb.data[0]["vansha_id"] != str(body.vansha_id):
        raise HTTPException(status_code=400, detail="Both persons must belong to the same vansha")

    # parent_of validation: child can have ≤1 father and ≤1 mother (per subtype family).
    if body.type == "parent_of":
        parent_gender = (pa.data[0].get("gender") or "").lower()
        existing = (
            sb.table(RELATIONSHIPS_TABLE)
            .select("id, from_node_id, subtype")
            .eq("to_node_id", str(body.to_node_id))
            .eq("type", "parent_of")
            .execute()
        )
        for row in existing.data or []:
            other = (
                sb.table(PERSONS_TABLE)
                .select("gender")
                .eq("node_id", row["from_node_id"])
                .limit(1)
                .execute()
            )
            other_gender = ((other.data or [{}])[0].get("gender") or "").lower()
            if other_gender == parent_gender and row["subtype"] == body.subtype:
                raise HTTPException(
                    status_code=409,
                    detail=f"Child already has a {body.subtype} {parent_gender} parent",
                )

    # spouse_of: prevent reverse duplicate (a→b and b→a are the same couple).
    if body.type == "spouse_of":
        reverse = (
            sb.table(RELATIONSHIPS_TABLE)
            .select("id")
            .eq("from_node_id", str(body.to_node_id))
            .eq("to_node_id", str(body.from_node_id))
            .eq("type", "spouse_of")
            .execute()
        )
        if reverse.data:
            raise HTTPException(status_code=409, detail="Spouse edge already exists (reverse direction)")

    payload = {
        "vansha_id": str(body.vansha_id),
        "from_node_id": str(body.from_node_id),
        "to_node_id": str(body.to_node_id),
        "type": body.type,
        "subtype": body.subtype,
    }
    try:
        ins = sb.table(RELATIONSHIPS_TABLE).insert(payload).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "duplicate" in msg or "uq_relationships_edge" in msg:
            raise HTTPException(status_code=409, detail="Edge already exists") from None
        logger.exception("Relationship insert failed: %s", payload)
        raise HTTPException(status_code=502, detail="Could not create relationship") from None

    return ins.data[0] if ins.data else payload


@router.patch("/relationships/{rel_id}")
def patch_relationship(rel_id: UUID, body: RelationshipPatch, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    try:
        res = (
            sb.table(RELATIONSHIPS_TABLE)
            .update({"subtype": body.subtype})
            .eq("id", str(rel_id))
            .execute()
        )
    except Exception:
        logger.exception("Relationship patch failed id=%s", rel_id)
        raise HTTPException(status_code=502, detail="Could not update relationship") from None
    if not res.data:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return res.data[0]


@router.delete("/relationships/{rel_id}")
def delete_relationship(rel_id: UUID, user: CurrentUser) -> dict[str, bool]:
    sb = get_supabase()
    try:
        sb.table(RELATIONSHIPS_TABLE).delete().eq("id", str(rel_id)).execute()
    except Exception:
        logger.exception("Relationship delete failed id=%s", rel_id)
        raise HTTPException(status_code=502, detail="Could not delete relationship") from None
    return {"ok": True}


# ─── Vanshas ─────────────────────────────────────────────────────────────────


@router.get("/vanshas/{vansha_id}")
def get_vansha(vansha_id: UUID, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    res = sb.table(VANSHAS_TABLE).select("*").eq("vansha_id", str(vansha_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Vansha not found")
    return res.data[0]


@router.get("/vanshas/by-code/{code}")
def get_vansha_by_code(code: str, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    clean = code.strip().upper()
    res = sb.table(VANSHAS_TABLE).select("*").eq("vansh_code", clean).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="No tree found for this vansh code")
    return res.data[0]


@router.patch("/vanshas/{vansha_id}")
def patch_vansha(vansha_id: UUID, body: VanshaPatch, user: CurrentUser) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if body.vansh_name is not None:
        updates["vansh_name"] = body.vansh_name.strip()
    if body.founder_node_id is not None:
        updates["founder_node_id"] = str(body.founder_node_id)
    if not updates:
        return get_vansha(vansha_id, user)  # type: ignore[arg-type]

    sb = get_supabase()
    try:
        sb.table(VANSHAS_TABLE).update(updates).eq("vansha_id", str(vansha_id)).execute()
    except Exception:
        logger.exception("Vansha patch failed id=%s", vansha_id)
        raise HTTPException(status_code=502, detail="Could not update vansha") from None
    return get_vansha(vansha_id, user)  # type: ignore[arg-type]


# ─── Canvas offsets ──────────────────────────────────────────────────────────


@router.patch("/persons/{node_id}/offset")
def set_offset(node_id: UUID, body: OffsetBody, user: CurrentUser) -> dict[str, Any]:
    _person_or_404(str(node_id))
    sb = get_supabase()
    try:
        sb.table(PERSONS_TABLE).update(
            {"canvas_offset_x": body.canvas_offset_x, "canvas_offset_y": body.canvas_offset_y}
        ).eq("node_id", str(node_id)).execute()
    except Exception:
        logger.exception("Set offset failed node_id=%s", node_id)
        raise HTTPException(status_code=502, detail="Could not save offset") from None
    return {"node_id": str(node_id), "canvas_offset_x": body.canvas_offset_x, "canvas_offset_y": body.canvas_offset_y}


@router.delete("/persons/{node_id}/offset")
def clear_offset(node_id: UUID, user: CurrentUser) -> dict[str, bool]:
    _person_or_404(str(node_id))
    sb = get_supabase()
    try:
        sb.table(PERSONS_TABLE).update(
            {"canvas_offset_x": None, "canvas_offset_y": None}
        ).eq("node_id", str(node_id)).execute()
    except Exception:
        logger.exception("Clear offset failed node_id=%s", node_id)
        raise HTTPException(status_code=502, detail="Could not clear offset") from None
    return {"ok": True}


# ─── Integrity report ────────────────────────────────────────────────────────


@router.get("/persons/{node_id}/integrity")
def integrity_report(node_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """List all incoming/outgoing edges for a person and flag obvious conflicts."""
    sb = get_supabase()
    person = _person_or_404(str(node_id))
    nid = str(node_id)

    incoming = sb.table(RELATIONSHIPS_TABLE).select("*").eq("to_node_id", nid).execute().data or []
    outgoing = sb.table(RELATIONSHIPS_TABLE).select("*").eq("from_node_id", nid).execute().data or []

    issues: list[str] = []

    # Multiple biological fathers / mothers.
    bio_parents = [r for r in incoming if r["type"] == "parent_of" and r["subtype"] == "biological"]
    parent_ids = [r["from_node_id"] for r in bio_parents]
    if parent_ids:
        parents = (
            sb.table(PERSONS_TABLE).select("node_id, gender").in_("node_id", parent_ids).execute().data or []
        )
        fathers = [p for p in parents if (p.get("gender") or "").lower() == "male"]
        mothers = [p for p in parents if (p.get("gender") or "").lower() == "female"]
        if len(fathers) > 1:
            issues.append(f"Multiple biological fathers ({len(fathers)})")
        if len(mothers) > 1:
            issues.append(f"Multiple biological mothers ({len(mothers)})")

    # Spouse symmetry: every outgoing spouse must not have a reverse (we store one direction).
    # Cycle: person can't be ancestor of self (basic 1-hop check).
    self_loops = [r for r in incoming + outgoing if r["from_node_id"] == r["to_node_id"]]
    if self_loops:
        issues.append("Self-referencing relationship detected")

    return {
        "node_id": nid,
        "person": {
            "kutumb_id": person.get("kutumb_id"),
            "name": f"{person.get('first_name', '')} {person.get('last_name', '')}".strip(),
            "gender": person.get("gender"),
        },
        "incoming": incoming,
        "outgoing": outgoing,
        "issues": issues,
    }
