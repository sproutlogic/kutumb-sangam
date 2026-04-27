"""
Auth session management.

POST /api/auth/session             — upsert public.users row after Supabase sign-in.
GET  /api/auth/me                  — returns authenticated user's profile row.
PATCH /api/auth/me                 — update display name / link vansha_id after onboarding.
POST /api/auth/complete-onboarding — mark onboarding_complete = true (called at end of onboarding form).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from constants import USERS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

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
    # If user has a vansha_id they completed onboarding; ensure the flag is set
    # (handles cases where migration 017 hasn't run yet or back-fill missed this row).
    if user.get("vansha_id") and not user.get("onboarding_complete"):
        sb = get_supabase()
        try:
            sb.table(USERS_TABLE).update({"onboarding_complete": True}).eq("id", user["id"]).execute()
            user = {**user, "onboarding_complete": True}
        except Exception:
            logger.exception("Failed to auto-set onboarding_complete for uid=%s", user.get("id"))
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

    res = sb.table(USERS_TABLE).select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else user


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
    res = sb.table(USERS_TABLE).select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else {**user, "onboarding_complete": True}
