"""
Kutumb Calendar APIs.

GET  /api/calendar/events?vansha_id=   — list upcoming events (next 90 days + recurring)
POST /api/calendar/events              — create a new event or announcement
DELETE /api/calendar/events/{id}       — delete an event (creator only)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from constants import CALENDAR_EVENTS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/calendar", tags=["calendar"])


class EventBody(BaseModel):
    vansha_id: str
    title: str = Field(min_length=1, max_length=200)
    event_date: str   # YYYY-MM-DD
    event_type: str = Field(default="event")
    description: str | None = Field(default=None, max_length=1000)
    recurs_yearly: bool = False
    is_announcement: bool = False


@router.get("/events")
def list_events(
    vansha_id: str = Query(...),
    user: CurrentUser = None,
) -> list[dict[str, Any]]:
    """Return all events for a vansha sorted by event_date ascending."""
    sb = get_supabase()
    res = (
        sb.table(CALENDAR_EVENTS_TABLE)
        .select("*")
        .eq("vansha_id", vansha_id)
        .order("event_date", desc=False)
        .execute()
    )
    return res.data or []


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(body: EventBody, user: CurrentUser) -> dict[str, Any]:
    valid_types = {"birthday", "anniversary", "event", "announcement"}
    if body.event_type not in valid_types:
        raise HTTPException(status_code=422, detail=f"event_type must be one of {valid_types}")

    sb = get_supabase()
    row = {
        "vansha_id": body.vansha_id,
        "created_by": str(user["id"]),
        "title": body.title.strip(),
        "event_date": body.event_date,
        "event_type": body.event_type,
        "description": body.description,
        "recurs_yearly": body.recurs_yearly,
        "is_announcement": body.is_announcement,
    }
    res = sb.table(CALENDAR_EVENTS_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=502, detail="Failed to create event.")
    logger.info("Calendar event created vansha=%s type=%s by=%s", body.vansha_id, body.event_type, user.get("id"))
    return res.data[0]


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, user: CurrentUser) -> None:
    sb = get_supabase()
    existing = (
        sb.table(CALENDAR_EVENTS_TABLE)
        .select("id,created_by")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Event not found.")
    if existing.data[0]["created_by"] != str(user["id"]):
        raise HTTPException(status_code=403, detail="Only the creator can delete this event.")
    sb.table(CALENDAR_EVENTS_TABLE).delete().eq("id", event_id).execute()
