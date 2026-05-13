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
import uuid as _uuid
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import PERSONS_TABLE, RELATIONSHIPS_TABLE, VANSHAS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase
from middleware.auth import CurrentUser, OptionalUser

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


class PersonCreateV2(BaseModel):
    """Person creation for tree-v2 canvas — core identity fields only."""
    vansha_id: UUID
    first_name: str = Field(min_length=1)
    last_name: str = ""
    gender: Literal["male", "female", "other"] = "other"
    date_of_birth: str = ""
    gotra: str = ""


class ClaimBody(BaseModel):
    kutumb_id: str = Field(min_length=1)


class ProfilePatch(BaseModel):
    """Extended KutumbID Vyakti + Kul profile — all fields optional."""
    # Vyakti (individual) fields
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    common_name: Optional[str] = None
    title: Optional[str] = None
    date_of_birth: Optional[str] = None
    punyatithi: Optional[str] = None
    marital_status: Optional[str] = None
    marriage_anniversary: Optional[str] = None
    education: Optional[str] = None
    ancestral_place: Optional[str] = None
    janmasthan_village: Optional[str] = None
    janmasthan_city: Optional[str] = None
    current_residence: Optional[str] = None
    mool_niwas_village: Optional[str] = None
    mool_niwas_city: Optional[str] = None
    nanighar: Optional[str] = None
    email: Optional[str] = None
    # Relation label (how this node appears in the tree to others)
    relation: Optional[str] = None
    # Per-field privacy map: {"field_name": "public" | "private"}
    field_privacy: Optional[dict] = None
    # Kul (lineage / cultural) fields
    vansh_label: Optional[str] = None
    gotra: Optional[str] = None
    pravara: Optional[str] = None
    ved_shakha: Optional[str] = None
    ritual_sutra: Optional[str] = None
    kul_devi: Optional[str] = None
    kul_devi_sthan: Optional[str] = None
    ishta_devta: Optional[str] = None
    tirth_purohit: Optional[str] = None
    pravas_history: Optional[str] = None
    paitrik_niwas: Optional[str] = None
    gram_devta: Optional[str] = None
    pidhi_label: Optional[str] = None
    vivah_sambandh: Optional[str] = None
    kul_achara: Optional[str] = None
    manat: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

# Fields always returned regardless of privacy settings.
# Includes display identity, tree-rendering fields, and privacy map itself.
_ALWAYS_PUBLIC: frozenset[str] = frozenset({
    "node_id", "vansha_id",
    "first_name", "middle_name", "last_name", "title", "common_name",
    "gender", "relation", "generation",
    "is_deceased", "pandit_verified",
    "canvas_offset_x", "canvas_offset_y",
    "father_node_id", "mother_node_id", "spouse_node_id",
    "field_privacy",
    "created_at", "updated_at",
    # owner_id/creator_id are needed by the frontend to show claimed/unclaimed UI
    "owner_id", "creator_id",
})


def _apply_privacy_filter(person: dict[str, Any], is_editor: bool) -> dict[str, Any]:
    """Return person with non-public fields nulled out for non-editors.

    Editors (owner, or creator of unclaimed node) see everything.
    Others see: _ALWAYS_PUBLIC fields + fields set to 'public' in field_privacy.
    kutumb_id is shown only to editors (it doubles as the claim PIN).
    """
    if is_editor:
        return person
    privacy: dict[str, str] = person.get("field_privacy") or {}
    result: dict[str, Any] = {}
    for k, v in person.items():
        if k in _ALWAYS_PUBLIC:
            result[k] = v
        elif k == "kutumb_id":
            result[k] = None  # never expose claim PIN to non-editors
        elif privacy.get(k) == "public":
            result[k] = v
        else:
            result[k] = None
    return result


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
    # Fetch the edge before deletion so we can clear legacy columns.
    rel_res = sb.table(RELATIONSHIPS_TABLE).select("*").eq("id", str(rel_id)).limit(1).execute()
    rel_row = (rel_res.data or [None])[0]

    try:
        sb.table(RELATIONSHIPS_TABLE).delete().eq("id", str(rel_id)).execute()
    except Exception:
        logger.exception("Relationship delete failed id=%s", rel_id)
        raise HTTPException(status_code=502, detail="Could not delete relationship") from None

    # For parent_of edges, clear the legacy father_node_id / mother_node_id column on the
    # child so that synthetic edges derived from those columns don't ghost the deleted edge.
    if rel_row and rel_row.get("type") == "parent_of":
        child_id = rel_row.get("to_node_id")
        parent_id = rel_row.get("from_node_id")
        if child_id and parent_id:
            try:
                pg = sb.table(PERSONS_TABLE).select("gender").eq("node_id", parent_id).limit(1).execute()
                gender = ((pg.data or [{}])[0].get("gender") or "").lower()
                col = "father_node_id" if gender == "male" else "mother_node_id" if gender == "female" else None
                if col:
                    sb.table(PERSONS_TABLE).update({col: None}).eq("node_id", child_id).execute()
            except Exception:
                logger.warning("Could not clear legacy %s col after rel delete child=%s", col if col else "parent", child_id)

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


@router.get("/vanshas/by-code/{code}/public")
def get_vansha_public_tree(code: str, user: OptionalUser) -> dict[str, Any]:
    """Public read-only snapshot of a vansha tree.

    Authentication is optional. Persons are returned with privacy filtering
    applied (each person treated as a non-editor).
    Returns { vansha, persons, relationships }.
    """
    sb = get_supabase()
    clean = code.strip().upper()

    v_res = sb.table(VANSHAS_TABLE).select("*").eq("vansh_code", clean).limit(1).execute()
    if not v_res.data:
        raise HTTPException(status_code=404, detail="No tree found for this vansh code")
    vansha = v_res.data[0]
    vid = str(vansha["vansha_id"])

    p_res = sb.table(PERSONS_TABLE).select("*").eq("vansha_id", vid).execute()
    persons_raw: list[dict[str, Any]] = p_res.data or []

    # Apply privacy filter — public view treats everyone as a non-editor
    persons_filtered = [_apply_privacy_filter(p, False) for p in persons_raw]

    r_res = sb.table(RELATIONSHIPS_TABLE).select("*").eq("vansha_id", vid).execute()
    relationships: list[dict[str, Any]] = r_res.data or []

    return {"vansha": vansha, "persons": persons_filtered, "relationships": relationships}


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


# ─── Persons (v2 minimal create + profile read) ──────────────────────────────


@router.post("/persons")
def create_person_v2(body: PersonCreateV2, user: CurrentUser) -> dict[str, Any]:
    """Create a person with minimal fields (name + gender). No union/lineage logic."""
    sb = get_supabase()
    node_id = str(_uuid.uuid4())
    row: dict[str, Any] = {
        "node_id": node_id,
        VANSHA_ID_COLUMN: str(body.vansha_id),
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip() or "",
        "gender": body.gender,
        "relation": "member",
        "creator_id": str(user["id"]),
        # owner_id intentionally absent — UUID FK column, NULL = unclaimed
        "date_of_birth": body.date_of_birth.strip() or "",
        "gotra": body.gotra.strip() or "",
    }
    try:
        ins = sb.table(PERSONS_TABLE).insert(row).execute()
    except Exception:
        logger.exception("create_person_v2 insert failed vansha=%s", body.vansha_id)
        raise HTTPException(status_code=502, detail="Could not create person") from None
    return ins.data[0] if ins.data else row


@router.get("/persons/{node_id}/profile")
def get_person_profile(node_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """Return person profile. Non-editors receive only public-marked fields."""
    person = _person_or_404(str(node_id))
    return _apply_privacy_filter(person, _can_edit(person, user))


def _can_edit(person: dict[str, Any], user: dict[str, Any]) -> bool:
    """
    Edit permission rule:
      - owner is set  → only owner can edit
      - owner is unset → creator can edit (node not yet claimed)
    """
    uid = str(user["id"])
    owner_id = person.get("owner_id") or ""
    creator_id = person.get("creator_id") or ""
    if owner_id:
        return owner_id == uid
    return creator_id == uid


@router.post("/persons/claim")
def claim_node(body: ClaimBody, user: CurrentUser) -> dict[str, Any]:
    """
    Claim a node as its real person.
    The caller provides their KutumbID code (acts as the claim PIN).
    Sets owner_id = current user. Fails if node already has a different owner.
    """
    sb = get_supabase()
    clean = body.kutumb_id.strip().upper()
    res = sb.table(PERSONS_TABLE).select("*").eq("kutumb_id", clean).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="No node found for this KutumbID")
    person = res.data[0]
    existing_owner = person.get("owner_id") or ""
    uid = str(user["id"])
    if existing_owner and existing_owner != uid:
        raise HTTPException(status_code=409, detail="This node has already been claimed by another account")
    try:
        upd = sb.table(PERSONS_TABLE).update({"owner_id": uid}).eq("node_id", person["node_id"]).execute()
    except Exception:
        logger.exception("claim_node failed kutumb_id=%s", clean)
        raise HTTPException(status_code=502, detail="Could not claim node") from None
    return upd.data[0] if upd.data else {**person, "owner_id": uid}


@router.patch("/persons/{node_id}/profile")
def update_person_profile(node_id: UUID, body: ProfilePatch, user: CurrentUser) -> dict[str, Any]:
    """Update KutumbID Vyakti + Kul profile fields. Owner or creator (if unclaimed) may edit."""
    person = _person_or_404(str(node_id))
    if not _can_edit(person, user):
        raise HTTPException(status_code=403, detail="Only the node owner (or creator if unclaimed) can edit this profile")

    updates: dict[str, Any] = {
        k: v.strip() if isinstance(v, str) else v
        for k, v in body.model_dump(exclude_none=True).items()
    }
    if not updates:
        return person

    sb = get_supabase()
    try:
        res = sb.table(PERSONS_TABLE).update(updates).eq("node_id", str(node_id)).execute()
    except Exception:
        logger.exception("update_person_profile failed node_id=%s", node_id)
        raise HTTPException(status_code=502, detail="Could not update profile") from None
    return res.data[0] if res.data else {**person, **updates}


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
