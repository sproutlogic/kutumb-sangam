"""
Auth session management.

POST /api/auth/session  — called by the frontend right after Supabase sign-in to
                          ensure a public.users row exists (upsert) and returns the
                          current user profile.
GET  /api/auth/me       — returns the authenticated user's profile row.
PATCH /api/auth/me      — update display name / link vansha_id after onboarding.
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
