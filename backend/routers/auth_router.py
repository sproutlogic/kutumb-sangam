"""
Auth session management.

POST /api/auth/session                — upsert public.users row after Supabase sign-in.
GET  /api/auth/me                     — returns authenticated user's profile row.
PATCH /api/auth/me                    — update display name / link vansha_id after onboarding.
POST /api/auth/complete-onboarding    — mark onboarding_complete = true (called at end of onboarding form).
GET  /api/auth/referral/validate      — check if a kutumb_id referral code is valid.
POST /api/auth/referral/record        — record a referral event (registration / invite_accepted).
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from constants import USERS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser
from services.performance import record_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=True)


class SessionBody(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class MePatch(BaseModel):
    full_name: str | None = None
    vansha_id: UUID | None = None


@router.post("/session")
def upsert_session(body: SessionBody, user: CurrentUser) -> dict[str, Any]:
    """Upsert the public.users row for the signed-in Supabase user."""
    sb = get_supabase()
    uid = user["id"]

    updates: dict[str, Any] = {}
    if body.full_name:
        updates["full_name"] = body.full_name
    if body.phone:
        updates["phone"] = body.phone

    if updates:
        try:
            sb.table(USERS_TABLE).update(updates).eq("id", uid).execute()
        except Exception:
            logger.exception("Failed to update user row uid=%s", uid)

    res = sb.table(USERS_TABLE).select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else user


@router.get("/me")
def get_me(user: CurrentUser) -> dict[str, Any]:
    uid = str(user["id"])
    vansha_id = user.get("vansha_id")
    sb = get_supabase()

    if vansha_id and not user.get("onboarding_complete"):
        try:
            sb.table(USERS_TABLE).update({"onboarding_complete": True}).eq("id", uid).execute()
            user = {**user, "onboarding_complete": True}
        except Exception:
            logger.exception("Failed to auto-set onboarding_complete for uid=%s", uid)

    # Backfill: if user has a vansha but no claimed ego node, auto-claim the self node
    if vansha_id:
        try:
            from constants import PERSONS_TABLE, VANSHA_ID_COLUMN
            ego = (
                sb.table(PERSONS_TABLE)
                .select("node_id")
                .eq("owner_id", uid)
                .eq(VANSHA_ID_COLUMN, str(vansha_id))
                .limit(1)
                .execute()
            )
            if not ego.data:
                self_node = (
                    sb.table(PERSONS_TABLE)
                    .select("node_id")
                    .eq(VANSHA_ID_COLUMN, str(vansha_id))
                    .eq("relation", "self")
                    .is_("owner_id", "null")
                    .limit(1)
                    .execute()
                )
                if self_node.data:
                    sb.table(PERSONS_TABLE).update({"owner_id": uid}).eq("node_id", self_node.data[0]["node_id"]).execute()
        except Exception:
            logger.exception("Failed to backfill ego owner_id for uid=%s vansha=%s", uid, vansha_id)

    return user


@router.patch("/me")
def patch_me(body: MePatch, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    uid = user["id"]

    updates: dict[str, Any] = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.vansha_id is not None:
        updates["vansha_id"] = str(body.vansha_id)

    if not updates:
        return user

    try:
        sb.table(USERS_TABLE).update(updates).eq("id", uid).execute()
    except Exception:
        logger.exception("Failed to patch user row uid=%s", uid)
        raise HTTPException(status_code=502, detail="Profile update failed.")

    # When vansha_id is being linked, claim the self node in that vansha
    if body.vansha_id is not None:
        try:
            from constants import PERSONS_TABLE, VANSHA_ID_COLUMN
            vid = str(body.vansha_id)
            ego = (
                sb.table(PERSONS_TABLE)
                .select("node_id")
                .eq("owner_id", uid)
                .eq(VANSHA_ID_COLUMN, vid)
                .limit(1)
                .execute()
            )
            if not ego.data:
                self_node = (
                    sb.table(PERSONS_TABLE)
                    .select("node_id")
                    .eq(VANSHA_ID_COLUMN, vid)
                    .eq("relation", "self")
                    .is_("owner_id", "null")
                    .limit(1)
                    .execute()
                )
                if self_node.data:
                    sb.table(PERSONS_TABLE).update({"owner_id": uid}).eq("node_id", self_node.data[0]["node_id"]).execute()
        except Exception:
            logger.exception("Failed to claim self node on vansha link uid=%s vansha=%s", uid, body.vansha_id)

    res = sb.table(USERS_TABLE).select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else user


@router.delete("/account")
def delete_account(user: CurrentUser) -> dict[str, bool]:
    """Permanently delete the authenticated user's account and auth credentials."""
    sb = get_supabase()
    uid = user["id"]
    try:
        sb.table(USERS_TABLE).delete().eq("id", uid).execute()
    except Exception:
        logger.exception("Failed to delete public.users row for uid=%s", uid)
    try:
        sb.auth.admin.delete_user(uid)
    except Exception:
        logger.exception("Failed to delete Supabase auth user uid=%s", uid)
        raise HTTPException(status_code=502, detail="Account deletion failed.")
    return {"ok": True}


class ReferralRecordBody(BaseModel):
    kutumb_id_used: str
    event_type: str = "registration"  # registration | invite_accepted | se_application
    metadata: Optional[dict] = None


@router.get("/referral/validate")
def validate_referral_code(
    code: str = Query(..., description="Kutumb ID referral code (KMxxxxxxxx)"),
    user: CurrentUser = None,
) -> dict[str, Any]:
    """Return referrer info if the code is a valid kutumb_id; 404 otherwise."""
    sb = get_supabase()
    clean = code.strip().upper()
    if not clean:
        raise HTTPException(status_code=400, detail="Code is required")
    res = (
        sb.table(USERS_TABLE)
        .select("id, full_name, kutumb_id")
        .eq("kutumb_id", clean)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Invalid referral code — no matching member found")
    row = res.data[0]
    return {
        "valid": True,
        "referrer_id": row.get("id"),
        "referrer_name": row.get("full_name") or "Member",
        "kutumb_id": row.get("kutumb_id"),
    }


@router.post("/referral/record")
def record_referral_event(body: ReferralRecordBody, user: CurrentUser) -> dict[str, Any]:
    """Record that the authenticated user used a referral code.  Idempotent on duplicate inserts."""
    sb = get_supabase()
    uid = user["id"]
    code = (body.kutumb_id_used or "").strip().upper()

    referrer_id = None
    if code:
        res = (
            sb.table(USERS_TABLE)
            .select("id")
            .eq("kutumb_id", code)
            .limit(1)
            .execute()
        )
        if res.data:
            referrer_id = res.data[0].get("id")

    allowed = {"registration", "se_application", "invite_accepted"}
    event_type = body.event_type if body.event_type in allowed else "registration"

    try:
        sb.table("referral_events").insert({
            "kutumb_id_used": code,
            "referrer_id": referrer_id,
            "referred_id": uid,
            "event_type": event_type,
            "metadata": body.metadata or {},
        }).execute()
    except Exception:
        logger.exception("Failed to record referral event uid=%s code=%s", uid, code)
        raise HTTPException(status_code=502, detail="Could not record referral event")

    # ── Wire to tree-entitlement referral_unlocks ─────────────────────────────
    # Each confirmed registration increments the referrer's referral_unlocks row.
    # Bonus schedule: 1st referral → +1 gen_up; 2nd → +1 gen_down; 3rd → +1 gen_up.
    # Cap: extra_gen_up ≤ 2, extra_gen_down ≤ 1 (per ENTITLEMENT_SYSTEM.md).
    if referrer_id and event_type == "registration":
        try:
            cur = (
                sb.table("referral_unlocks")
                .select("*")
                .eq("user_id", referrer_id)
                .limit(1)
                .execute()
            )
            row = cur.data[0] if cur.data else None
            new_count = (row["referrals_count"] if row else 0) + 1
            extra_up   = row["extra_gen_up"]   if row else 0
            extra_down = row["extra_gen_down"] if row else 0
            # Award bonus on referral count milestones
            if new_count == 1 and extra_up < 2:
                extra_up += 1
            elif new_count == 2 and extra_down < 1:
                extra_down += 1
            elif new_count == 3 and extra_up < 2:
                extra_up += 1
            payload = {
                "user_id":         referrer_id,
                "referrals_count": new_count,
                "extra_gen_up":    extra_up,
                "extra_gen_down":  extra_down,
            }
            sb.table("referral_unlocks").upsert(payload, on_conflict="user_id").execute()

            # Audit event in subscription_events for full visibility
            sb.table("subscription_events").insert({
                "user_id":    referrer_id,
                "event_type": "referral_unlock",
                "metadata":   {
                    "referrals_count": new_count,
                    "extra_gen_up":    extra_up,
                    "extra_gen_down":  extra_down,
                    "referred_user_id": uid,
                    "kutumb_id_used":   code,
                },
                "created_by": referrer_id,
            }).execute()

            # Bust referrer's visibility cache so the bonus takes effect immediately
            sb.table("user_visible_nodes").delete().eq("user_id", referrer_id).execute()
        except Exception:
            # Non-fatal — referral was recorded; entitlement bump is best-effort.
            logger.exception("Failed to wire referral_unlocks for referrer=%s", referrer_id)

    # Performance credit for the referrer
    if referrer_id:
        record_event(
            user_id=referrer_id,
            event_type="referral_accepted",
            ref_id=code,
            ref_table="referral_events",
            attributed_to=uid,
            metadata={"event_type": event_type, "referred_user_id": uid},
        )

    return {"ok": True, "referrer_id": referrer_id}


@router.post("/complete-onboarding")
def complete_onboarding(user: CurrentUser) -> dict[str, Any]:
    """Mark the authenticated user's onboarding as complete.
    Called by the frontend at the final step of the onboarding form.
    Idempotent — safe to call multiple times.
    """
    sb = get_supabase()
    uid = user["id"]
    try:
        sb.table(USERS_TABLE).update({"onboarding_complete": True}).eq("id", uid).execute()
    except Exception:
        logger.exception("Failed to set onboarding_complete for uid=%s", uid)
        raise HTTPException(status_code=502, detail="Could not mark onboarding complete.")

    # Performance: credit the completing user
    record_event(
        user_id=uid,
        event_type="onboarding_completed",
        ref_table="users",
        ref_id=uid,
    )

    # Performance: credit whoever referred this user (if anyone)
    try:
        ref_row = (
            sb.table("referral_events")
            .select("referrer_id, kutumb_id_used")
            .eq("referred_id", uid)
            .eq("event_type", "registration")
            .limit(1)
            .execute()
        )
        if ref_row.data and ref_row.data[0].get("referrer_id"):
            referrer_id = ref_row.data[0]["referrer_id"]
            record_event(
                user_id=referrer_id,
                event_type="referral_completed",
                ref_id=uid,
                ref_table="users",
                attributed_to=uid,
                metadata={"referred_user_id": uid},
            )
    except Exception:
        logger.exception("Failed to credit referrer on onboarding_completed for uid=%s", uid)

    res = sb.table(USERS_TABLE).select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else {**user, "onboarding_complete": True}
