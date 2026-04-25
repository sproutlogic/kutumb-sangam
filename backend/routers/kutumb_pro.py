"""
Kutumb Pro — Community OS APIs.

POST /api/org/enquire            Public. Submit a Kutumb Pro access request.
POST /api/org                    Kutumb Pro users only. Create an organisation.
GET  /api/org/my                 List all orgs the authenticated user belongs to.
GET  /api/org/{slug}             Org members only. Full org detail + tier config.
PATCH /api/org/{slug}            Head only. Update name, aliases, tiers, currency.
POST /api/org/{slug}/invite      Head / Tier-2 only. Generate an invite (targeted or open).
GET  /api/org/{slug}/invites     Head only. List active invites.
DELETE /api/org/{slug}/invite/{code}  Head only. Revoke an invite.
POST /api/org/join/{invite_code} Authenticated. Join an org via invite code.
GET  /api/org/{slug}/members     Org members only. Full member list with ratings.
PATCH /api/org/{slug}/members/{uid}   Head only. Change tier or role label.
DELETE /api/org/{slug}/members/{uid}  Head only. Remove a member.

Admin-only:
PATCH /api/org/enquiries/{enquiry_id}/approve  Set enquiry approved + flip kutumb_pro on user.
GET   /api/org/enquiries                       List all enquiries.
"""

from __future__ import annotations

import logging
import re
import random
import string
from typing import Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, EmailStr

from constants import (
    ORGANIZATIONS_TABLE, ORG_MEMBERS_TABLE,
    ORG_INVITES_TABLE, ORG_ENQUIRIES_TABLE, USERS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/org", tags=["kutumb-pro"])

VALID_FRAMEWORKS = {"spiritual", "political", "ngo", "university", "rwa", "custom"}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _is_head(org: dict, user_id: str) -> bool:
    return str(org.get("head_user_id")) == user_id

def _is_admin(user: dict) -> bool:
    return user.get("role") in ("admin", "superadmin")

def _has_pro(user: dict) -> bool:
    return bool(user.get("kutumb_pro")) or _is_admin(user)

def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    return slug or "org"

def _unique_slug(sb, base: str) -> str:
    slug = base
    for _ in range(10):
        res = sb.table(ORGANIZATIONS_TABLE).select("id").eq("slug", slug).limit(1).execute()
        if not res.data:
            return slug
        suffix = "".join(random.choices(string.digits, k=4))
        slug = f"{base[:35]}-{suffix}"
    raise HTTPException(status_code=409, detail="Could not generate a unique slug. Choose a different name.")

def _gen_invite_code(sb) -> str:
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        code = "".join(random.choices(alphabet, k=8))
        res = sb.table(ORG_INVITES_TABLE).select("id").eq("invite_code", code).limit(1).execute()
        if not res.data:
            return code
    raise HTTPException(status_code=500, detail="Could not generate invite code.")

def _get_membership(sb, org_id: str, user_id: str) -> dict | None:
    res = (
        sb.table(ORG_MEMBERS_TABLE)
        .select("*")
        .eq("org_id", org_id)
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None

def _require_member(sb, org_id: str, user_id: str) -> dict:
    m = _get_membership(sb, org_id, user_id)
    if not m:
        raise HTTPException(status_code=403, detail="You are not a member of this organisation.")
    return m

def _require_head(org: dict, user_id: str) -> None:
    if not _is_head(org, user_id):
        raise HTTPException(status_code=403, detail="Only the organisation head can perform this action.")

def _get_org_by_slug(sb, slug: str) -> dict:
    res = sb.table(ORGANIZATIONS_TABLE).select("*").eq("slug", slug).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    return res.data[0]


# ─── Pydantic models ─────────────────────────────────────────────────────────

class EnquiryBody(BaseModel):
    contact_name:     str  = Field(min_length=2, max_length=100)
    contact_email:    str  = Field(min_length=5, max_length=200)
    contact_phone:    Optional[str] = Field(None, max_length=20)
    org_name:         str  = Field(min_length=2, max_length=100)
    framework_type:   str
    org_description:  Optional[str] = Field(None, max_length=500)
    expected_members: Optional[int] = Field(None, ge=1)


class CreateOrgBody(BaseModel):
    name:            str   = Field(min_length=2, max_length=100)
    description:     Optional[str] = Field(None, max_length=500)
    framework_type:  str
    tier1_alias:     str   = Field(min_length=1, max_length=50)
    tier2_alias:     str   = Field(min_length=1, max_length=50)
    tier3_alias:     str   = Field(min_length=1, max_length=50)
    tier4_alias:     str   = Field(min_length=1, max_length=50)
    tier5_alias:     str   = Field(min_length=1, max_length=50)
    is_tier2_active: bool  = True
    is_tier3_active: bool  = True
    is_tier4_active: bool  = True
    currency_name:   str   = Field(min_length=1, max_length=30)
    currency_emoji:  str   = Field(default="💫", max_length=4)


class UpdateOrgBody(BaseModel):
    name:            Optional[str]  = Field(None, min_length=2, max_length=100)
    description:     Optional[str]  = None
    tier1_alias:     Optional[str]  = Field(None, min_length=1, max_length=50)
    tier2_alias:     Optional[str]  = Field(None, min_length=1, max_length=50)
    tier3_alias:     Optional[str]  = Field(None, min_length=1, max_length=50)
    tier4_alias:     Optional[str]  = Field(None, min_length=1, max_length=50)
    tier5_alias:     Optional[str]  = Field(None, min_length=1, max_length=50)
    is_tier2_active: Optional[bool] = None
    is_tier3_active: Optional[bool] = None
    is_tier4_active: Optional[bool] = None
    currency_name:   Optional[str]  = Field(None, min_length=1, max_length=30)
    currency_emoji:  Optional[str]  = Field(None, max_length=4)


class InviteBody(BaseModel):
    target_kutumb_id: Optional[str] = None   # Targeted invite by Kutumb ID
    target_tier:      int = Field(5, ge=1, le=5)
    max_uses:         Optional[int] = Field(1, ge=1)  # None = unlimited (open link)


class UpdateMemberBody(BaseModel):
    tier_level:  Optional[int]  = Field(None, ge=1, le=5)
    role_label:  Optional[str]  = Field(None, max_length=50)
    status:      Optional[str]  = None


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/enquire", status_code=201)
def submit_enquiry(body: EnquiryBody, user: CurrentUser) -> dict[str, Any]:
    """Submit a Kutumb Pro access request (no Pro access required)."""
    if body.framework_type not in VALID_FRAMEWORKS:
        raise HTTPException(status_code=400, detail=f"Invalid framework type.")

    sb = get_supabase()
    row = {
        "user_id":          str(user["id"]),
        "contact_name":     body.contact_name,
        "contact_email":    body.contact_email,
        "contact_phone":    body.contact_phone,
        "org_name":         body.org_name,
        "framework_type":   body.framework_type,
        "org_description":  body.org_description,
        "expected_members": body.expected_members,
        "status":           "pending",
    }
    try:
        res = sb.table(ORG_ENQUIRIES_TABLE).insert(row).execute()
    except Exception:
        logger.exception("Failed to insert org enquiry for user_id=%s", user["id"])
        raise HTTPException(status_code=502, detail="Could not save your request. Please try again.") from None

    logger.info("Kutumb Pro enquiry submitted user_id=%s org=%s", user["id"], body.org_name)
    return {"ok": True, "enquiry_id": res.data[0]["id"]}


@router.post("", status_code=201)
def create_org(body: CreateOrgBody, user: CurrentUser) -> dict[str, Any]:
    """Create a new organisation. Requires Kutumb Pro access."""
    if not _has_pro(user):
        raise HTTPException(
            status_code=403,
            detail="Kutumb Pro access required. Submit an access request to get started.",
        )
    if body.framework_type not in VALID_FRAMEWORKS:
        raise HTTPException(status_code=400, detail="Invalid framework type.")

    sb = get_supabase()
    uid = str(user["id"])

    slug = _unique_slug(sb, _slugify(body.name))

    org_row = {
        "name":            body.name,
        "slug":            slug,
        "description":     body.description,
        "framework_type":  body.framework_type,
        "head_user_id":    uid,
        "tier1_alias":     body.tier1_alias,
        "tier2_alias":     body.tier2_alias,
        "tier3_alias":     body.tier3_alias,
        "tier4_alias":     body.tier4_alias,
        "tier5_alias":     body.tier5_alias,
        "is_tier2_active": body.is_tier2_active,
        "is_tier3_active": body.is_tier3_active,
        "is_tier4_active": body.is_tier4_active,
        "currency_name":   body.currency_name,
        "currency_emoji":  body.currency_emoji,
    }

    try:
        org_res = sb.table(ORGANIZATIONS_TABLE).insert(org_row).execute()
    except Exception:
        logger.exception("Failed to create org for user_id=%s", uid)
        raise HTTPException(status_code=502, detail="Could not create organisation.") from None

    org = org_res.data[0]

    # Auto-add the head as a Tier 1 active member
    member_row = {
        "org_id":     org["id"],
        "user_id":    uid,
        "tier_level": 1,
        "status":     "active",
        "invited_by": uid,
    }
    try:
        sb.table(ORG_MEMBERS_TABLE).insert(member_row).execute()
    except Exception:
        logger.warning("Head auto-member insert failed org_id=%s — non-fatal", org["id"])

    logger.info("Organisation created org_id=%s slug=%s by user_id=%s", org["id"], slug, uid)
    return {"ok": True, "org": org}


@router.get("/my")
def list_my_orgs(user: CurrentUser) -> dict[str, Any]:
    """List all organisations the authenticated user is an active member of."""
    uid = str(user["id"])
    sb  = get_supabase()

    mem_res = (
        sb.table(ORG_MEMBERS_TABLE)
        .select("org_id, tier_level, role_label, l_credits, avg_quality_rating, total_ratings")
        .eq("user_id", uid)
        .eq("status", "active")
        .execute()
    )
    memberships = mem_res.data or []
    if not memberships:
        return {"orgs": [], "total": 0}

    org_ids = [m["org_id"] for m in memberships]
    org_res = (
        sb.table(ORGANIZATIONS_TABLE)
        .select("id, name, slug, framework_type, tier1_alias, currency_name, currency_emoji, head_user_id, status")
        .in_("id", org_ids)
        .execute()
    )
    orgs_by_id = {o["id"]: o for o in (org_res.data or [])}

    result = []
    for m in memberships:
        org = orgs_by_id.get(m["org_id"])
        if org:
            result.append({
                **org,
                "my_tier":         m["tier_level"],
                "my_role_label":   m["role_label"],
                "my_l_credits":    m["l_credits"],
                "my_rating":       m["avg_quality_rating"],
                "is_head":         org["head_user_id"] == uid,
            })

    return {"orgs": result, "total": len(result)}


@router.get("/enquiries")
def list_enquiries(user: CurrentUser) -> dict[str, Any]:
    """Admin only — list all Kutumb Pro access enquiries."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required.")
    sb = get_supabase()
    res = (
        sb.table(ORG_ENQUIRIES_TABLE)
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return {"enquiries": res.data or [], "total": len(res.data or [])}


@router.patch("/enquiries/{enquiry_id}/approve")
def approve_enquiry(enquiry_id: str, user: CurrentUser) -> dict[str, Any]:
    """Admin only — approve enquiry and grant Kutumb Pro to the user."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    sb = get_supabase()
    enq_res = (
        sb.table(ORG_ENQUIRIES_TABLE)
        .select("*").eq("id", enquiry_id).limit(1).execute()
    )
    if not enq_res.data:
        raise HTTPException(status_code=404, detail="Enquiry not found.")

    enq = enq_res.data[0]
    sb.table(ORG_ENQUIRIES_TABLE).update({"status": "approved"}).eq("id", enquiry_id).execute()

    if enq.get("user_id"):
        sb.table(USERS_TABLE).update({"kutumb_pro": True}).eq("id", enq["user_id"]).execute()

    logger.info("Kutumb Pro approved enquiry_id=%s user_id=%s by admin=%s", enquiry_id, enq.get("user_id"), user["id"])
    return {"ok": True, "kutumb_pro_granted": bool(enq.get("user_id"))}


@router.get("/{slug}")
def get_org(slug: str, user: CurrentUser) -> dict[str, Any]:
    """Org members only. Full org detail."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_member(sb, org["id"], uid)
    return {"org": org}


@router.patch("/{slug}")
def update_org(slug: str, body: UpdateOrgBody, user: CurrentUser) -> dict[str, Any]:
    """Head only. Update org settings."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_head(org, uid)

    updates: dict[str, Any] = {}
    for field in [
        "name", "description",
        "tier1_alias", "tier2_alias", "tier3_alias", "tier4_alias", "tier5_alias",
        "is_tier2_active", "is_tier3_active", "is_tier4_active",
        "currency_name", "currency_emoji",
    ]:
        val = getattr(body, field, None)
        if val is not None:
            updates[field] = val

    if not updates:
        return {"org": org}

    try:
        res = sb.table(ORGANIZATIONS_TABLE).update(updates).eq("id", org["id"]).execute()
    except Exception:
        logger.exception("Failed to update org id=%s", org["id"])
        raise HTTPException(status_code=502, detail="Could not update organisation.") from None

    return {"ok": True, "org": res.data[0] if res.data else {**org, **updates}}


@router.post("/{slug}/invite", status_code=201)
def create_invite(slug: str, body: InviteBody, user: CurrentUser) -> dict[str, Any]:
    """
    Head or Tier ≤ 2 member. Generate an invite code.
    Targeted: supply target_kutumb_id (looks up user).
    Open link: omit target_kutumb_id.
    """
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    mem = _require_member(sb, org["id"], uid)

    # Only Tier 1 or 2 can invite
    if mem["tier_level"] > 2 and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only Tier 1 or Tier 2 members can send invites.")

    target_user_id   = None
    target_kutumb_id = None

    if body.target_kutumb_id:
        target_kutumb_id = body.target_kutumb_id.strip().upper()
        u_res = (
            sb.table(USERS_TABLE)
            .select("id")
            .eq("kutumb_id", target_kutumb_id)
            .limit(1)
            .execute()
        )
        if not u_res.data:
            raise HTTPException(status_code=404, detail="Kutumb ID not found. Check the ID and try again.")
        target_user_id = u_res.data[0]["id"]

        # Already a member?
        if _get_membership(sb, org["id"], target_user_id):
            raise HTTPException(status_code=409, detail="This person is already a member of your organisation.")

    code = _gen_invite_code(sb)
    invite_row = {
        "org_id":           org["id"],
        "invite_code":      code,
        "target_kutumb_id": target_kutumb_id,
        "target_user_id":   target_user_id,
        "target_tier":      body.target_tier,
        "created_by":       uid,
        "max_uses":         body.max_uses,
        "status":           "active",
    }

    try:
        res = sb.table(ORG_INVITES_TABLE).insert(invite_row).execute()
    except Exception:
        logger.exception("Failed to create invite for org_id=%s", org["id"])
        raise HTTPException(status_code=502, detail="Could not create invite.") from None

    invite = res.data[0]
    return {
        "ok":          True,
        "invite_code": code,
        "join_path":   f"/org/{slug}/join/{code}",
        "invite":      invite,
    }


@router.get("/{slug}/invites")
def list_invites(slug: str, user: CurrentUser) -> dict[str, Any]:
    """Head only — list active invites."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_head(org, uid)

    res = (
        sb.table(ORG_INVITES_TABLE)
        .select("*")
        .eq("org_id", org["id"])
        .eq("status", "active")
        .order("created_at", desc=True)
        .execute()
    )
    return {"invites": res.data or []}


@router.delete("/{slug}/invite/{code}")
def revoke_invite(slug: str, code: str, user: CurrentUser) -> dict[str, Any]:
    """Head only — revoke an invite code."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_head(org, uid)

    sb.table(ORG_INVITES_TABLE).update({"status": "revoked"}).eq("invite_code", code).eq("org_id", org["id"]).execute()
    return {"ok": True}


@router.post("/join/{invite_code}", status_code=201)
def join_org(invite_code: str, user: CurrentUser) -> dict[str, Any]:
    """Join an organisation via invite code."""
    uid = str(user["id"])
    sb  = get_supabase()

    inv_res = (
        sb.table(ORG_INVITES_TABLE)
        .select("*")
        .eq("invite_code", invite_code.strip().upper())
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invite code not found or has expired.")

    invite = inv_res.data[0]

    # Check expiry
    if invite.get("expires_at"):
        if datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="This invite has expired.")

    # Check use limit
    if invite.get("max_uses") and invite["use_count"] >= invite["max_uses"]:
        raise HTTPException(status_code=410, detail="This invite has already been used.")

    # Targeted invite — must match
    if invite.get("target_user_id") and invite["target_user_id"] != uid:
        raise HTTPException(status_code=403, detail="This invite was issued to a different member.")

    org_res = sb.table(ORGANIZATIONS_TABLE).select("*").eq("id", invite["org_id"]).limit(1).execute()
    if not org_res.data or org_res.data[0]["status"] != "active":
        raise HTTPException(status_code=404, detail="Organisation not found or is inactive.")

    org = org_res.data[0]

    # Already a member?
    if _get_membership(sb, org["id"], uid):
        raise HTTPException(status_code=409, detail="You are already a member of this organisation.")

    member_row = {
        "org_id":     org["id"],
        "user_id":    uid,
        "tier_level": invite["target_tier"],
        "status":     "active",
        "invited_by": invite["created_by"],
    }

    try:
        mem_res = sb.table(ORG_MEMBERS_TABLE).insert(member_row).execute()
    except Exception:
        logger.exception("Failed to add member org_id=%s user_id=%s", org["id"], uid)
        raise HTTPException(status_code=502, detail="Could not join organisation.") from None

    # Increment use count; mark used if single-use
    new_use_count = invite["use_count"] + 1
    new_status = "active"
    if invite.get("max_uses") and new_use_count >= invite["max_uses"]:
        new_status = "expired"
    sb.table(ORG_INVITES_TABLE).update({"use_count": new_use_count, "status": new_status}).eq("id", invite["id"]).execute()

    logger.info("User joined org user_id=%s org_id=%s tier=%s", uid, org["id"], invite["target_tier"])
    return {
        "ok":    True,
        "org":   org,
        "member": mem_res.data[0] if mem_res.data else member_row,
    }


@router.get("/{slug}/members")
def list_members(slug: str, user: CurrentUser) -> dict[str, Any]:
    """Org members only. Full member list with user profiles."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_member(sb, org["id"], uid)

    mem_res = (
        sb.table(ORG_MEMBERS_TABLE)
        .select("*")
        .eq("org_id", org["id"])
        .eq("status", "active")
        .order("tier_level")
        .execute()
    )
    members = mem_res.data or []

    # Enrich with basic user profile (name, kutumb_id)
    if members:
        uids = [m["user_id"] for m in members]
        u_res = (
            sb.table(USERS_TABLE)
            .select("id, full_name, kutumb_id, role")
            .in_("id", uids)
            .execute()
        )
        users_by_id = {u["id"]: u for u in (u_res.data or [])}
        for m in members:
            m["profile"] = users_by_id.get(m["user_id"], {})

    return {"members": members, "total": len(members)}


@router.patch("/{slug}/members/{member_uid}")
def update_member(slug: str, member_uid: str, body: UpdateMemberBody, user: CurrentUser) -> dict[str, Any]:
    """Head only. Change a member's tier or custom role label."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_head(org, uid)

    if member_uid == uid:
        raise HTTPException(status_code=400, detail="You cannot modify your own membership through this endpoint.")

    updates: dict[str, Any] = {}
    if body.tier_level is not None:
        updates["tier_level"] = body.tier_level
    if body.role_label is not None:
        updates["role_label"] = body.role_label
    if body.status in ("active", "suspended"):
        updates["status"] = body.status

    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    try:
        sb.table(ORG_MEMBERS_TABLE).update(updates).eq("org_id", org["id"]).eq("user_id", member_uid).execute()
    except Exception:
        logger.exception("Failed to update member org_id=%s member=%s", org["id"], member_uid)
        raise HTTPException(status_code=502, detail="Could not update member.") from None

    return {"ok": True}


@router.delete("/{slug}/members/{member_uid}")
def remove_member(slug: str, member_uid: str, user: CurrentUser) -> dict[str, Any]:
    """Head only. Remove a member from the organisation."""
    uid = str(user["id"])
    sb  = get_supabase()
    org = _get_org_by_slug(sb, slug)
    _require_head(org, uid)

    if member_uid == uid:
        raise HTTPException(status_code=400, detail="The head cannot remove themselves.")

    now = datetime.now(timezone.utc).isoformat()
    sb.table(ORG_MEMBERS_TABLE).update({"status": "left", "left_at": now}).eq("org_id", org["id"]).eq("user_id", member_uid).execute()

    logger.info("Member removed org_id=%s member=%s by head=%s", org["id"], member_uid, uid)
    return {"ok": True}
