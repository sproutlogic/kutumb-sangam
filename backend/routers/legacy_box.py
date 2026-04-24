"""
Legacy Box APIs.

GET    /api/legacy/messages?vansha_id=   — list my messages (sent by me)
POST   /api/legacy/messages              — create a new time- or location-triggered message
DELETE /api/legacy/messages/{id}         — delete a pending message (sender only)
POST   /api/legacy/check-location        — check if any pending location-triggered messages
                                           should fire for the current user's position
"""

from __future__ import annotations

import logging
import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from constants import LEGACY_MESSAGES_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/legacy", tags=["legacy_box"])

TEXT_MAX_CHARS = 500
VOICE_MAX_SECS = 60


class LegacyMessageBody(BaseModel):
    vansha_id: str
    recipient_node_id: str
    recipient_name: str
    message_type: str   # 'text' | 'voice'
    text_content: str | None = Field(default=None, max_length=TEXT_MAX_CHARS)
    voice_url: str | None = None
    voice_duration_sec: int | None = Field(default=None, ge=1, le=VOICE_MAX_SECS)
    trigger_type: str   # 'time' | 'location'
    trigger_time: str | None = None   # ISO datetime string
    trigger_lat: float | None = None
    trigger_lon: float | None = None
    trigger_radius_m: int = Field(default=100, ge=10, le=5000)
    trigger_place_name: str | None = Field(default=None, max_length=200)


class LocationCheckBody(BaseModel):
    vansha_id: str
    latitude: float
    longitude: float


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/messages")
def list_messages(
    vansha_id: str = Query(...),
    user: CurrentUser = None,
) -> list[dict[str, Any]]:
    sb = get_supabase()
    res = (
        sb.table(LEGACY_MESSAGES_TABLE)
        .select("id,recipient_name,message_type,trigger_type,trigger_time,trigger_place_name,status,created_at,voice_duration_sec")
        .eq("sender_id", str(user["id"]))
        .eq("vansha_id", vansha_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/messages", status_code=status.HTTP_201_CREATED)
def create_message(body: LegacyMessageBody, user: CurrentUser) -> dict[str, Any]:
    if body.message_type not in ("text", "voice"):
        raise HTTPException(status_code=422, detail="message_type must be 'text' or 'voice'.")
    if body.trigger_type not in ("time", "location"):
        raise HTTPException(status_code=422, detail="trigger_type must be 'time' or 'location'.")

    if body.message_type == "text" and not body.text_content:
        raise HTTPException(status_code=422, detail="text_content required for text messages.")
    if body.message_type == "voice" and not body.voice_url:
        raise HTTPException(status_code=422, detail="voice_url required for voice messages.")

    if body.trigger_type == "time" and not body.trigger_time:
        raise HTTPException(status_code=422, detail="trigger_time required for time-triggered messages.")
    if body.trigger_type == "location" and (body.trigger_lat is None or body.trigger_lon is None):
        raise HTTPException(status_code=422, detail="trigger_lat and trigger_lon required for location-triggered messages.")

    sb = get_supabase()
    row: dict[str, Any] = {
        "sender_id": str(user["id"]),
        "vansha_id": body.vansha_id,
        "recipient_node_id": body.recipient_node_id,
        "recipient_name": body.recipient_name,
        "message_type": body.message_type,
        "text_content": body.text_content,
        "voice_url": body.voice_url,
        "voice_duration_sec": body.voice_duration_sec,
        "trigger_type": body.trigger_type,
        "trigger_time": body.trigger_time,
        "trigger_lat": body.trigger_lat,
        "trigger_lon": body.trigger_lon,
        "trigger_radius_m": body.trigger_radius_m,
        "trigger_place_name": body.trigger_place_name,
    }
    res = sb.table(LEGACY_MESSAGES_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=502, detail="Failed to save message.")
    logger.info("Legacy message created by=%s trigger=%s", user.get("id"), body.trigger_type)
    return res.data[0]


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: str, user: CurrentUser) -> None:
    sb = get_supabase()
    existing = (
        sb.table(LEGACY_MESSAGES_TABLE)
        .select("id,sender_id,status")
        .eq("id", message_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Message not found.")
    row = existing.data[0]
    if row["sender_id"] != str(user["id"]):
        raise HTTPException(status_code=403, detail="Only the sender can delete this message.")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail="Cannot delete a delivered or expired message.")
    sb.table(LEGACY_MESSAGES_TABLE).delete().eq("id", message_id).execute()


@router.post("/check-location")
def check_location_triggers(body: LocationCheckBody, user: CurrentUser) -> dict[str, Any]:
    """
    Called by the frontend periodically (e.g. when app gains focus).
    Returns any pending location-triggered messages whose trigger point is within radius.
    Marks them as delivered.
    """
    sb = get_supabase()
    pending = (
        sb.table(LEGACY_MESSAGES_TABLE)
        .select("*")
        .eq("vansha_id", body.vansha_id)
        .eq("trigger_type", "location")
        .eq("status", "pending")
        .execute()
    )
    triggered = []
    for msg in (pending.data or []):
        if msg.get("trigger_lat") is None or msg.get("trigger_lon") is None:
            continue
        dist = _haversine_m(body.latitude, body.longitude, msg["trigger_lat"], msg["trigger_lon"])
        radius = msg.get("trigger_radius_m") or 100
        if dist <= radius:
            sb.table(LEGACY_MESSAGES_TABLE).update(
                {"status": "delivered", "delivered_at": "now()"}
            ).eq("id", msg["id"]).execute()
            triggered.append(msg)
    return {"triggered": triggered}
