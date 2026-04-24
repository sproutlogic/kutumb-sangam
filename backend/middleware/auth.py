"""
FastAPI dependencies for authentication and role enforcement.

Uses Supabase Admin auth.get_user(jwt) to validate the Bearer token — no
separate JWT secret needed. The caller's DB row (public.users) is returned
so downstream routers can read role / vansha_id without extra queries.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from constants import USERS_TABLE
from db import get_supabase

logger = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=True)


def _get_user_row(user_id: str) -> dict[str, Any] | None:
    sb = get_supabase()
    res = sb.table(USERS_TABLE).select("*").eq("id", user_id).limit(1).execute()
    return res.data[0] if res.data else None


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict[str, Any]:
    """Validate Supabase JWT and return the public.users row."""
    sb = get_supabase()
    try:
        auth_resp = sb.auth.get_user(creds.credentials)
        if auth_resp is None or auth_resp.user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")
        user_id = str(auth_resp.user.id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Token validation failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")

    row = _get_user_row(user_id)
    if row is None:
        # Auto-provision a users row on first authenticated request.
        sb = get_supabase()
        new_row = {"id": user_id, "role": "user"}
        try:
            sb.table(USERS_TABLE).insert(new_row).execute()
        except Exception:
            logger.exception("Failed to auto-provision user row for user_id=%s", user_id)
        row = _get_user_row(user_id) or {**new_row}
    return row


async def require_pandit(
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    if user.get("role") not in ("pandit", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pandit role required.")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
PanditUser = Annotated[dict[str, Any], Depends(require_pandit)]
