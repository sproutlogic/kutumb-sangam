"""
Create persons in the current vansha (Supabase `persons` table).

Vanshavali model: a Union is the couple (male_node_id + female_node_id). Children link to
that Union via parent_union_id — not to a single parent person (.cursorrules).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from constants import (
    PERSONS_TABLE,
    PARENT_UNION_ID_COLUMN,
    UNIONS_TABLE,
    VANSHA_ID_COLUMN,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["person"])

# Exact labels from the Add Member relation dropdown (must match frontend).
CHILD_RELATIONS = frozenset({"Son", "Daughter", "Adopted Son", "Adopted Daughter"})
PARENT_RELATIONS = frozenset({"Father", "Mother"})
SIBLING_RELATIONS = frozenset({"Brother", "Sister"})
SPOUSE_RELATIONS = frozenset({"Wife", "Husband", "Spouse"})

class PersonCreateBody(BaseModel):
    """Person row for Postgres `persons` table. Identity fields are required for every new member."""

    vansha_id: uuid.UUID
    first_name: str = Field(min_length=1, description="Given / first name")
    middle_name: Optional[str] = Field(default=None, description="Middle name (optional; separate from given name)")
    last_name: str = Field(min_length=1, description="Surname / family name")
    date_of_birth: str = Field(
        min_length=1,
        description="Date of birth (ISO YYYY-MM-DD)",
    )
    ancestral_place: str = Field(min_length=1, description="Ancestral / native place")
    current_residence: str = Field(default="", description="Current place of residence (optional)")
    gender: str = Field(default="other", description="male | female | other")
    relation: str = Field(default="member", description="UI relation label (exact dropdown string)")
    relative_gen_index: int = Field(default=0, description="Signed lineage: used when anchor_node_id is omitted")
    branch: str = "main"
    gotra: str = ""
    mool_niwas: str = ""
    title: str = Field(default="", description="Honorific title (Shri / Smt. / Dr. / Prof. etc.)")
    parent_node_id: Optional[uuid.UUID] = None
    maiden_vansha_id: Optional[uuid.UUID] = None
    anchor_node_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Selected tree node: enables Vruksha linking (generation + parents / union).",
    )
    father_name: Optional[str] = Field(
        default=None,
        description="When inferring a missing father placeholder, preferred given name (optional).",
    )
    mother_name: Optional[str] = Field(
        default=None,
        description="When inferring a missing mother placeholder, preferred given name (optional).",
    )


class PersonUpdateBody(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    ancestral_place: Optional[str] = None
    current_residence: Optional[str] = None
    gender: Optional[str] = None
    relation: Optional[str] = None
    branch: Optional[str] = None
    gotra: Optional[str] = None
    mool_niwas: Optional[str] = None
    title: Optional[str] = None
    parent_union_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Restore/set parental union: links this child to the couple's union row.",
    )


def _normalize_gender(raw: Any) -> str:
    s = str(raw or "").lower()
    if s in ("male", "m"):
        return "male"
    if s in ("female", "f"):
        return "female"
    return "other"


def _anchor_generation(anchor: dict[str, Any]) -> int:
    v = anchor.get("relative_gen_index")
    if v is None:
        v = anchor.get("generation")
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _str_id(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    return s if s else None


def _union_row_id(u: dict[str, Any]) -> Optional[str]:
    return _str_id(u.get("union_id") or u.get("id"))


def _list_unions(sb: Any, vid: str) -> list[dict[str, Any]]:
    resp = sb.table(UNIONS_TABLE).select("*").eq(VANSHA_ID_COLUMN, vid).execute()
    return list(resp.data or [])


def _find_union_containing_node(
    unions: list[dict[str, Any]], node_id: str
) -> Optional[dict[str, Any]]:
    for u in unions:
        m = _str_id(u.get("male_node_id"))
        f = _str_id(u.get("female_node_id"))
        if m == node_id or f == node_id:
            return u
    return None


def _placeholder_name(raw: Optional[str], fallback: str = "\u2014") -> str:
    s = (raw or "").strip()
    return s if s else fallback


def _uuid_to_ltree_label(node_id: str) -> str:
    return node_id.replace("-", "_")


def _compute_lineage_path(sb: Any, node_id: str, father_node_id: Optional[str]) -> str:
    own_label = _uuid_to_ltree_label(node_id)
    if not father_node_id:
        return own_label
    res = (
        sb.table(PERSONS_TABLE)
        .select("lineage_path")
        .eq("node_id", father_node_id)
        .limit(1)
        .execute()
    )
    if res.data and res.data[0].get("lineage_path"):
        return f"{res.data[0]['lineage_path']}.{own_label}"
    return own_label


def _insert_placeholder_parent(
    sb: Any,
    vid: str,
    anchor: dict[str, Any],
    gender: str,
    first_name: str,
    last_name: str,
    gen_idx: int,
) -> str:
    """Minimal person row for an unknown parent so a union can be formed (children link to union, not one person)."""
    nid = str(uuid.uuid4())
    ap = str(anchor.get("ancestral_place") or "").strip() or "Unknown"
    cr = str(anchor.get("current_residence") or "").strip() or "Unknown"
    dob = str(anchor.get("date_of_birth") or "").strip() or "1900-01-01"
    row: dict[str, Any] = {
        "node_id": nid,
        VANSHA_ID_COLUMN: vid,
        "first_name": first_name,
        "last_name": last_name or " ",
        "date_of_birth": dob,
        "ancestral_place": ap,
        "current_residence": cr,
        "gender": gender,
        "branch": str(anchor.get("branch") or "main"),
        "gotra": str(anchor.get("gotra") or ""),
        "mool_niwas": str(anchor.get("mool_niwas") or "").strip() or ap,
        "relative_gen_index": gen_idx,
        "generation": gen_idx,
        "relation": "member",
    }
    sb.table(PERSONS_TABLE).insert(row).execute()
    return nid


def _insert_union(
    sb: Any, vid: str, male_id: str, female_id: str, relative_gen_index: int
) -> Optional[str]:
    row = {
        VANSHA_ID_COLUMN: vid,
        "male_node_id": male_id,
        "female_node_id": female_id,
        "relative_gen_index": relative_gen_index,
    }
    ins = sb.table(UNIONS_TABLE).insert(row).execute()
    data = ins.data
    if isinstance(data, list) and data:
        uid = _union_row_id(data[0])
        if uid:
            return uid
    if isinstance(data, dict):
        uid = _union_row_id(data)
        if uid:
            return uid
    # PostgREST may omit returning the row; fetch the union we just created.
    q = (
        sb.table(UNIONS_TABLE)
        .select("*")
        .eq(VANSHA_ID_COLUMN, vid)
        .eq("male_node_id", male_id)
        .eq("female_node_id", female_id)
        .limit(1)
        .execute()
    )
    if q.data:
        return _union_row_id(q.data[0])
    return None


@router.post("/person")
def create_person(body: PersonCreateBody) -> dict[str, Any]:
    """
    Insert a new person scoped to `vansha_id`.

    Children reference the parental Union (parent_union_id), not a single parent node.
    """
    sb = get_supabase()
    node_id = str(uuid.uuid4())
    vid = str(body.vansha_id)
    relation_label = (body.relation or "").strip()

    row: dict[str, Any] = {
        "node_id": node_id,
        VANSHA_ID_COLUMN: vid,
        "first_name": body.first_name.strip(),
        "middle_name": (body.middle_name or "").strip() or None,
        "last_name": body.last_name.strip(),
        "date_of_birth": body.date_of_birth.strip(),
        "ancestral_place": body.ancestral_place.strip(),
        "current_residence": body.current_residence.strip(),
        "title": (body.title or "").strip(),
        "gender": body.gender.lower() if body.gender else "other",
        "branch": body.branch or "main",
        "gotra": body.gotra or "",
        # Legacy column: keep in sync with ancestral when not set separately.
        "mool_niwas": (body.mool_niwas or "").strip() or body.ancestral_place.strip(),
        "maiden_vansha_id": (
            str(mv)
            if (mv := getattr(body, "maiden_vansha_id", None)) is not None
            else None
        ),
    }

    anchor_id_str: Optional[str] = None
    update_anchor: Optional[dict[str, Any]] = None
    insert_union: Optional[dict[str, Any]] = None
    unions_cache: Optional[list[dict[str, Any]]] = None
    post_insert_parental: Optional[tuple[str, str, str, int]] = None
    # (union_id, column_name, new_value) — update an existing union row after insert
    post_insert_union_update: Optional[tuple[str, str, str]] = None

    def unions() -> list[dict[str, Any]]:
        nonlocal unions_cache
        if unions_cache is None:
            unions_cache = _list_unions(sb, vid)
        return unions_cache

    if body.anchor_node_id is not None:
        anchor_id_str = str(body.anchor_node_id)
        res = (
            sb.table(PERSONS_TABLE)
            .select("*")
            .eq("node_id", anchor_id_str)
            .eq(VANSHA_ID_COLUMN, vid)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=400,
                detail="Anchor node not found in this vansha",
            )
        anchor = res.data[0]
        anchor_gen = _anchor_generation(anchor)

        if relation_label in SIBLING_RELATIONS:
            raise HTTPException(
                status_code=400,
                detail="Adding siblings directly is not supported. Add them as children of the shared parents.",
            )

        if relation_label in PARENT_RELATIONS:
            is_father = relation_label == "Father"
            rel_idx = anchor_gen - 1
            row["relative_gen_index"] = rel_idx
            row["generation"] = rel_idx
            row["gender"] = "male" if is_father else "female"
            row[PARENT_UNION_ID_COLUMN] = None
            last_sur = str(anchor.get("last_name") or "").strip() or " "
            existing_puid = _str_id(anchor.get(PARENT_UNION_ID_COLUMN))
            if existing_puid:
                # Union already exists — update its male/female slot and anchor link
                col = "male_node_id" if is_father else "female_node_id"
                post_insert_union_update = (existing_puid, col, node_id)
                update_anchor = {
                    "father_node_id" if is_father else "mother_node_id": node_id
                }
            else:
                # No union yet — create placeholder of opposite gender, union after insert
                if is_father:
                    ph_id = _insert_placeholder_parent(sb, vid, anchor, "female", "—", last_sur, rel_idx)
                    post_insert_parental = ("father", anchor_id_str, ph_id, rel_idx)
                    update_anchor = {"father_node_id": node_id, "mother_node_id": ph_id}
                else:
                    ph_id = _insert_placeholder_parent(sb, vid, anchor, "male", "—", last_sur, rel_idx)
                    post_insert_parental = ("mother", anchor_id_str, ph_id, rel_idx)
                    update_anchor = {"father_node_id": ph_id, "mother_node_id": node_id}

        elif relation_label in CHILD_RELATIONS:
            rel_idx = anchor_gen + 1
            row["relative_gen_index"] = rel_idx
            row["generation"] = rel_idx
            parental = _find_union_containing_node(unions(), anchor_id_str)
            if not parental:
                anc_g = _normalize_gender(anchor.get("gender"))
                last_sur = str(anchor.get("last_name") or "").strip() or " "
                if anc_g == "male":
                    mf = _placeholder_name(getattr(body, "mother_name", None))
                    ph_id = _insert_placeholder_parent(
                        sb, vid, anchor, "female", mf, last_sur, anchor_gen
                    )
                    u_id = _insert_union(sb, vid, anchor_id_str, ph_id, anchor_gen)
                    unions_cache = None
                    if not u_id:
                        raise HTTPException(
                            status_code=502,
                            detail="Failed to create parental union with placeholder parent.",
                        )
                    parental = {
                        "union_id": u_id,
                        "male_node_id": anchor_id_str,
                        "female_node_id": ph_id,
                    }
                elif anc_g == "female":
                    ff = _placeholder_name(getattr(body, "father_name", None))
                    ph_id = _insert_placeholder_parent(
                        sb, vid, anchor, "male", ff, last_sur, anchor_gen
                    )
                    u_id = _insert_union(sb, vid, ph_id, anchor_id_str, anchor_gen)
                    unions_cache = None
                    if not u_id:
                        raise HTTPException(
                            status_code=502,
                            detail="Failed to create parental union with placeholder parent.",
                        )
                    parental = {
                        "union_id": u_id,
                        "male_node_id": ph_id,
                        "female_node_id": anchor_id_str,
                    }
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Children link to a parental couple. Add a spouse first, or set the anchor "
                            "person's gender to male or female so a missing parent can be created as a placeholder."
                        ),
                    )
            puid = _union_row_id(parental)
            if not puid:
                raise HTTPException(
                    status_code=502,
                    detail="Parental union row is missing a union id.",
                )
            row[PARENT_UNION_ID_COLUMN] = puid
            row["father_node_id"] = _str_id(parental.get("male_node_id"))
            row["mother_node_id"] = _str_id(parental.get("female_node_id"))
        elif relation_label in SPOUSE_RELATIONS:
            rel_idx = anchor_gen
            row["relative_gen_index"] = rel_idx
            row["generation"] = rel_idx
            row[PARENT_UNION_ID_COLUMN] = None
            ng = _normalize_gender(body.gender)
            anc_g = _normalize_gender(anchor.get("gender"))
            if ng == "male" and anc_g == "female":
                male_id, female_id = node_id, anchor_id_str
            elif ng == "female" and anc_g == "male":
                male_id, female_id = anchor_id_str, node_id
            else:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Marriage union requires one male and one female "
                        "(set gender on the new member and on the anchor)."
                    ),
                )
            insert_union = {
                VANSHA_ID_COLUMN: vid,
                "male_node_id": male_id,
                "female_node_id": female_id,
                "relative_gen_index": rel_idx,
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown relation for anchored add: {relation_label!r}",
            )
    else:
        row["relative_gen_index"] = int(body.relative_gen_index)
        row["generation"] = int(body.relative_gen_index)
        row[PARENT_UNION_ID_COLUMN] = None

    if relation_label:
        row["relation"] = relation_label

    try:
        sb.table(PERSONS_TABLE).insert(row).execute()
    except Exception:
        logger.exception("Failed to insert person into %s", PERSONS_TABLE)
        raise HTTPException(status_code=502, detail="Failed to insert person") from None

    try:
        lineage_path = _compute_lineage_path(sb, node_id, _str_id(row.get("father_node_id")))
        sb.table(PERSONS_TABLE).update({"lineage_path": lineage_path}).eq("node_id", node_id).execute()
    except Exception:
        logger.warning("lineage_path update failed for node_id=%s (non-fatal)", node_id)

    if body.anchor_node_id is not None and update_anchor is not None and anchor_id_str:
        try:
            sb.table(PERSONS_TABLE).update(update_anchor).eq("node_id", anchor_id_str).execute()
        except Exception:
            logger.exception(
                "Person inserted but failed to update anchor %s",
                anchor_id_str,
            )
            raise HTTPException(
                status_code=502,
                detail="Person created but failed to link parent to anchor",
            ) from None

    if post_insert_parental is not None:
        role, anchor_nid, other_id, rel_idx = post_insert_parental
        try:
            if role == "father":
                u_id = _insert_union(sb, vid, node_id, other_id, rel_idx)
            else:
                u_id = _insert_union(sb, vid, other_id, node_id, rel_idx)
            if u_id:
                sb.table(PERSONS_TABLE).update({PARENT_UNION_ID_COLUMN: u_id}).eq(
                    "node_id", anchor_nid
                ).execute()
        except Exception:
            logger.exception("Failed to create parental union after adding Father/Mother")
            raise HTTPException(
                status_code=502,
                detail="Person created but failed to form the parental union (couple) link.",
            ) from None

    if post_insert_union_update is not None:
        u_id, col, val = post_insert_union_update
        try:
            sb.table(UNIONS_TABLE).update({col: val}).eq("union_id", u_id).execute()
        except Exception:
            logger.exception("Failed to update union %s col %s", u_id, col)
            raise HTTPException(
                status_code=502,
                detail="Person created but failed to update parental union.",
            ) from None

    if insert_union is not None:
        try:
            sb.table(UNIONS_TABLE).insert(insert_union).execute()
        except Exception:
            logger.exception("Failed to insert union row for spouse link")
            raise HTTPException(
                status_code=502,
                detail="Person created but marriage link failed.",
            ) from None

    return {"ok": True, "node_id": node_id, "vansha_id": vid}


@router.patch("/person/{node_id}")
def update_person(node_id: uuid.UUID, body: PersonUpdateBody, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    nid = str(node_id)
    existing = (
        sb.table(PERSONS_TABLE)
        .select("node_id,owner_id")
        .eq("node_id", nid)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Person not found.")

    owner_id = _str_id(existing.data[0].get("owner_id"))
    user_id = str(user["id"])
    if owner_id and owner_id != user_id:
        raise HTTPException(status_code=403, detail="Only the node owner can edit this member.")

    updates: dict[str, Any] = {}
    if body.first_name is not None:
        updates["first_name"] = body.first_name.strip()
    if body.middle_name is not None:
        updates["middle_name"] = body.middle_name.strip() or None
    if body.last_name is not None:
        updates["last_name"] = body.last_name.strip()
    if body.date_of_birth is not None:
        updates["date_of_birth"] = body.date_of_birth.strip()
    if body.ancestral_place is not None:
        updates["ancestral_place"] = body.ancestral_place.strip()
    if body.current_residence is not None:
        updates["current_residence"] = body.current_residence.strip()
    if body.gender is not None:
        updates["gender"] = _normalize_gender(body.gender)
    if body.relation is not None:
        updates["relation"] = body.relation.strip() or "member"
    if body.branch is not None:
        updates["branch"] = body.branch.strip() or "main"
    if body.gotra is not None:
        updates["gotra"] = body.gotra.strip()
    if body.mool_niwas is not None:
        updates["mool_niwas"] = body.mool_niwas.strip()
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.parent_union_id is not None:
        updates[PARENT_UNION_ID_COLUMN] = str(body.parent_union_id)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    try:
        sb.table(PERSONS_TABLE).update(updates).eq("node_id", nid).execute()
    except Exception:
        logger.exception("Failed to update person node_id=%s", nid)
        raise HTTPException(status_code=502, detail="Failed to update person.") from None

    return {"ok": True}


class LinkPersonBody(BaseModel):
    vansha_id: uuid.UUID
    person_id: uuid.UUID
    target_person_id: uuid.UUID
    relation: str = Field(min_length=2)


@router.post("/person/link")
def link_persons(body: LinkPersonBody) -> dict[str, Any]:
    """Structurally link two existing persons (parent-child or spouse)."""
    sb = get_supabase()
    vid = str(body.vansha_id)
    pid = str(body.person_id)
    tid = str(body.target_person_id)
    rel = body.relation.strip()

    if pid == tid:
        raise HTTPException(status_code=400, detail="Cannot link a person to themselves.")

    if rel in SPOUSE_RELATIONS or rel == "Spouse":
        rows = (
            sb.table(PERSONS_TABLE)
            .select("node_id,gender,relative_gen_index")
            .in_("node_id", [pid, tid])
            .eq(VANSHA_ID_COLUMN, vid)
            .execute()
        ).data or []
        p_row = next((r for r in rows if _str_id(r.get("node_id")) == pid), None)
        t_row = next((r for r in rows if _str_id(r.get("node_id")) == tid), None)
        if not p_row or not t_row:
            raise HTTPException(status_code=404, detail="One or both persons not found in this vansha.")
        gp = _normalize_gender(p_row.get("gender"))
        gt = _normalize_gender(t_row.get("gender"))
        if gp == "male" and gt == "female":
            male_id, female_id = pid, tid
        elif gp == "female" and gt == "male":
            male_id, female_id = tid, pid
        else:
            raise HTTPException(status_code=400, detail="Spouse link requires one male and one female person.")
        gen = p_row.get("relative_gen_index", 0) or 0
        u_id = _insert_union(sb, vid, male_id, female_id, int(gen))
        if not u_id:
            raise HTTPException(status_code=500, detail="Failed to create union.")
        return {"ok": True, "union_id": u_id}

    if rel in CHILD_RELATIONS:
        parent_id, child_id = pid, tid
    elif rel in PARENT_RELATIONS:
        parent_id, child_id = tid, pid
    else:
        raise HTTPException(status_code=400, detail=f"Unknown relation '{rel}'.")

    unions = (
        sb.table(UNIONS_TABLE).select("*").eq(VANSHA_ID_COLUMN, vid).execute()
    ).data or []
    parent_union = _find_union_for_node(unions, parent_id)
    if not parent_union:
        raise HTTPException(
            status_code=400,
            detail="Parent has no union yet — add a spouse first, then reconnect.",
        )
    union_id = _str_id(parent_union.get("union_id") or parent_union.get("id"))
    if not union_id:
        raise HTTPException(status_code=500, detail="Could not resolve union ID.")

    try:
        sb.table(PERSONS_TABLE).update({PARENT_UNION_ID_COLUMN: union_id}).eq("node_id", child_id).eq(VANSHA_ID_COLUMN, vid).execute()
    except Exception:
        logger.exception("Failed to set parent_union_id for node_id=%s", child_id)
        raise HTTPException(status_code=502, detail="Failed to update parent link.") from None

    return {"ok": True, "union_id": union_id}


@router.delete("/person/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(node_id: uuid.UUID, user: CurrentUser) -> Response:
    sb = get_supabase()
    nid = str(node_id)
    existing = (
        sb.table(PERSONS_TABLE)
        .select("node_id,owner_id")
        .eq("node_id", nid)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Person not found.")

    owner_id = _str_id(existing.data[0].get("owner_id"))
    user_id = str(user["id"])
    if owner_id and owner_id != user_id:
        raise HTTPException(status_code=403, detail="Only the node owner can delete this member.")

    try:
        sb.table(PERSONS_TABLE).delete().eq("node_id", nid).execute()
    except Exception:
        logger.exception("Failed to delete person node_id=%s", nid)
        raise HTTPException(status_code=502, detail="Failed to delete person.") from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)
