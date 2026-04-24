"""
In-app notifications for the signed-in user.

GET   /api/notifications           — unread + recent notifications (newest first)
PATCH /api/notifications/{id}/read — mark a single notification as read
POST  /api/notifications/read-all  — mark all as read
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from constants import NOTIFICATIONS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser, limit: int = 30) -> list[dict[str, Any]]:
    sb = get_supabase()
    res = (
        sb.table(NOTIFICATIONS_TABLE)
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(min(limit, 100))
        .execute()
    )
    return res.data or []


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    res = (
        sb.table(NOTIFICATIONS_TABLE)
        .update({"read": True})
        .eq("id", notification_id)
        .eq("user_id", user["id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    sb.table(NOTIFICATIONS_TABLE).update({"read": True}).eq("user_id", user["id"]).eq("read", False).execute()
    return {"ok": True}
