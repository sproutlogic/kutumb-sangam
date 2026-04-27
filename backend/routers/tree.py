"""
Tree API: full vansha payload and matrimonial bridge (paternal vansha load).

Table/column names follow the Vanshavali model (see project .cursorrules).
If your Lovable migration uses different names, update the constants below.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import PERSONS_TABLE, UNIONS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tree", tags=["tree"])


def _combined_person_name(row: dict[str, Any]) -> str:
    first = str(row.get("first_name") or "").strip()
    last = str(row.get("last_name") or "").strip()
    return f"{first} {last}".strip()


def _enrich_persons_with_name(persons_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure each person includes `name` from first_name + last_name when possible."""
    out: list[dict[str, Any]] = []
    for p in persons_raw:
        row = dict(p)
        combined = _combined_person_name(row)
        if combined:
            row["name"] = combined
        else:
            fallback = str(row.get("full_name") or row.get("display_name") or row.get("name") or "").strip()
            if fallback:
                row["name"] = fallback
        # Birth vansha (wife's portal); always present in API JSON for clients
        maiden = row.get("maiden_vansha_id") or row.get("maidenVanshaId")
        row["maiden_vansha_id"] = str(maiden).strip() if maiden else None
        out.append(row)
    return out


def _filter_rows_for_vansha(
    rows: list[dict[str, Any]], vansha_id: str, table_label: str
) -> list[dict[str, Any]]:
    """Drop any row that does not belong to the requested vansha (defense in depth)."""
    vid = str(vansha_id).strip()
    kept: list[dict[str, Any]] = []
    for row in rows:
        rv = row.get(VANSHA_ID_COLUMN)
        if rv is None or str(rv).strip() != vid:
            logger.warning(
                "%s row filtered out: expected %s=%s, got %s",
                table_label,
                VANSHA_ID_COLUMN,
                vid,
                rv,
            )
            continue
        kept.append(row)
    return kept


class BridgeBody(BaseModel):
    """Female node's paternal tree pointer (`origin_vansha_id` on persons)."""

    origin_vansha_id: UUID = Field(
        ...,
        description="UUID of the father's vansha to load for the matrimonial bridge.",
    )


class OnboardingIdentity(BaseModel):
    given_name: str = Field(min_length=1)
    middle_name: str = Field(default="")
    surname: str = Field(min_length=1)
    date_of_birth: str = Field(min_length=1)
    ancestral_place: str = Field(min_length=1)
    current_residence: str = Field(min_length=1)
    gender: str = Field(default="male")


class OnboardingBootstrapBody(BaseModel):
    tree_name: str = Field(min_length=1)
    gotra: str = ""
    father_name: str = ""
    mother_name: str = ""
    spouse_name: str = ""
    vansha_id: UUID | None = None
    identity: OnboardingIdentity


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in full_name.strip().split() if p]
    if not parts:
        return "Unknown", " "
    if len(parts) == 1:
        return parts[0], " "
    return parts[0], " ".join(parts[1:])


def _fetch_tree_for_vansha(vansha_id: str) -> dict[str, Any]:
    sb = get_supabase()

    unions_resp = (
        sb.table(UNIONS_TABLE)
        .select("*")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .order("relative_gen_index", desc=False)
        .execute()
    )
    persons_resp = (
        sb.table(PERSONS_TABLE).select("*").eq(VANSHA_ID_COLUMN, vansha_id).execute()
    )

    unions = _filter_rows_for_vansha(
        list(unions_resp.data or []), vansha_id, UNIONS_TABLE
    )
    persons = _enrich_persons_with_name(
        _filter_rows_for_vansha(list(persons_resp.data or []), vansha_id, PERSONS_TABLE)
    )

    # Defensive sort if API order is not applied
    try:
        unions.sort(key=lambda u: (u.get("relative_gen_index") is None, u.get("relative_gen_index", 0)))
    except (TypeError, ValueError):
        logger.exception("Failed to sort unions for vansha_id=%s", vansha_id)

    return {
        "vansha_id": vansha_id,
        "unions": unions,
        "persons": persons,
    }


@router.get("/{vansha_id}")
def get_tree(vansha_id: UUID) -> dict[str, Any]:
    """
    Return all unions (sorted by `relative_gen_index` ascending) and persons
    for the given `Vansha_ID`.
    """
    return _fetch_tree_for_vansha(str(vansha_id))


@router.post("/bridge")
def bridge_to_paternal_tree(body: BridgeBody) -> dict[str, Any]:
    """
    Load paternal tree data for the matrimonial bridge using the female's
    `origin_vansha_id` (same payload shape as GET /api/tree/{vansha_id}).
    """
    vid = str(body.origin_vansha_id)

    try:
        payload = _fetch_tree_for_vansha(vid)
    except Exception:
        logger.exception("Bridge fetch failed for origin_vansha_id=%s", vid)
        raise HTTPException(status_code=502, detail="Unable to load paternal tree data") from None

    return payload


@router.post("/bootstrap")
def bootstrap_onboarding_tree(body: OnboardingBootstrapBody) -> dict[str, Any]:
    """
    Create initial onboarding tree rows in Supabase in one request and return
    the canonical payload shape used by GET /api/tree/{vansha_id}.
    """
    sb = get_supabase()
    vansha_id = str(body.vansha_id or uuid.uuid4())

    self_id = str(uuid.uuid4())
    i = body.identity

    self_row: dict[str, Any] = {
        "node_id": self_id,
        VANSHA_ID_COLUMN: vansha_id,
        "first_name": i.given_name.strip(),
        "middle_name": i.middle_name.strip() or None,
        "last_name": i.surname.strip(),
        "date_of_birth": i.date_of_birth.strip(),
        "ancestral_place": i.ancestral_place.strip(),
        "current_residence": i.current_residence.strip(),
        "gender": (i.gender or "male").strip().lower() or "male",
        "relation": "self",
        "branch": "main",
        "gotra": body.gotra.strip(),
        "mool_niwas": i.ancestral_place.strip(),
        "relative_gen_index": 0,
        "generation": 0,
    }

    persons_to_insert: list[dict[str, Any]] = [self_row]
    unions_to_insert: list[dict[str, Any]] = []

    father = body.father_name.strip()
    mother = body.mother_name.strip()
    spouse = body.spouse_name.strip()

    if father and mother:
        father_id = str(uuid.uuid4())
        mother_id = str(uuid.uuid4())
        parent_union_id = str(uuid.uuid4())
        f_first, f_last = _split_name(father)
        m_first, m_last = _split_name(mother)
        persons_to_insert.append(
            {
                "node_id": father_id,
                VANSHA_ID_COLUMN: vansha_id,
                "first_name": f_first,
                "last_name": f_last,
                "date_of_birth": "1900-01-01",
                "ancestral_place": i.ancestral_place.strip(),
                "current_residence": i.current_residence.strip(),
                "gender": "male",
                "relation": "father",
                "branch": "main",
                "gotra": body.gotra.strip(),
                "mool_niwas": i.ancestral_place.strip(),
                "relative_gen_index": -1,
                "generation": -1,
            }
        )
        persons_to_insert.append(
            {
                "node_id": mother_id,
                VANSHA_ID_COLUMN: vansha_id,
                "first_name": m_first,
                "last_name": m_last,
                "date_of_birth": "1900-01-01",
                "ancestral_place": i.ancestral_place.strip(),
                "current_residence": i.current_residence.strip(),
                "gender": "female",
                "relation": "mother",
                "branch": "main",
                "gotra": "",
                "mool_niwas": "",
                "relative_gen_index": -1,
                "generation": -1,
            }
        )
        unions_to_insert.append(
            {
                "union_id": parent_union_id,
                VANSHA_ID_COLUMN: vansha_id,
                "male_node_id": father_id,
                "female_node_id": mother_id,
                "relative_gen_index": -1,
            }
        )
        self_row["parent_union_id"] = parent_union_id
        self_row["father_node_id"] = father_id
        self_row["mother_node_id"] = mother_id
    else:
        if father:
            father_id = str(uuid.uuid4())
            f_first, f_last = _split_name(father)
            persons_to_insert.append(
                {
                    "node_id": father_id,
                    VANSHA_ID_COLUMN: vansha_id,
                    "first_name": f_first,
                    "last_name": f_last,
                    "date_of_birth": "1900-01-01",
                    "ancestral_place": i.ancestral_place.strip(),
                    "current_residence": i.current_residence.strip(),
                    "gender": "male",
                    "relation": "father",
                    "branch": "main",
                    "gotra": body.gotra.strip(),
                    "mool_niwas": i.ancestral_place.strip(),
                    "relative_gen_index": -1,
                    "generation": -1,
                }
            )
            self_row["father_node_id"] = father_id
        if mother:
            mother_id = str(uuid.uuid4())
            m_first, m_last = _split_name(mother)
            persons_to_insert.append(
                {
                    "node_id": mother_id,
                    VANSHA_ID_COLUMN: vansha_id,
                    "first_name": m_first,
                    "last_name": m_last,
                    "date_of_birth": "1900-01-01",
                    "ancestral_place": i.ancestral_place.strip(),
                    "current_residence": i.current_residence.strip(),
                    "gender": "female",
                    "relation": "mother",
                    "branch": "main",
                    "gotra": "",
                    "mool_niwas": "",
                    "relative_gen_index": -1,
                    "generation": -1,
                }
            )
            self_row["mother_node_id"] = mother_id

    if spouse:
        spouse_id = str(uuid.uuid4())
        spouse_union_id = str(uuid.uuid4())
        s_first, s_last = _split_name(spouse)
        persons_to_insert.append(
            {
                "node_id": spouse_id,
                VANSHA_ID_COLUMN: vansha_id,
                "first_name": s_first,
                "last_name": s_last,
                "date_of_birth": "1900-01-01",
                "ancestral_place": i.ancestral_place.strip(),
                "current_residence": i.current_residence.strip(),
                "gender": "female",
                "relation": "spouse",
                "branch": "main",
                "gotra": body.gotra.strip(),
                "mool_niwas": "",
                "relative_gen_index": 0,
                "generation": 0,
            }
        )
        unions_to_insert.append(
            {
                "union_id": spouse_union_id,
                VANSHA_ID_COLUMN: vansha_id,
                "male_node_id": self_id,
                "female_node_id": spouse_id,
                "relative_gen_index": 0,
            }
        )

    try:
        sb.table(PERSONS_TABLE).insert(persons_to_insert).execute()
        if unions_to_insert:
            sb.table(UNIONS_TABLE).insert(unions_to_insert).execute()
    except Exception:
        logger.exception("Failed onboarding bootstrap insert for vansha_id=%s", vansha_id)
        raise HTTPException(status_code=502, detail="Failed to create onboarding tree") from None

    return _fetch_tree_for_vansha(vansha_id)
