"""
Content review queue APIs — Eco-Panchang generated content lifecycle.

GET   /api/content/queue          — draft content pending review (admin)
PATCH /api/content/{id}/approve   — approve + optionally publish
PATCH /api/content/{id}/reject    — reject with reason
POST  /api/content/generate       — manual trigger for weekly content generation (admin)
GET   /api/content/published      — published blog posts (public, paginated)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from constants import GENERATED_CONTENT_TABLE, USERS_TABLE
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/content", tags=["content"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "superadmin")


# ── Pydantic models ───────────────────────────────────────────────────────────

class ApproveBody(BaseModel):
    publish_now: bool = Field(default=False, description="Immediately publish after approval.")


class RejectBody(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/queue")
def get_draft_queue(
    content_type: Optional[str] = Query(default=None, description="Filter: blog_post|ig_caption|yt_short"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Return draft content items pending admin review, newest first."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    sb  = get_supabase()
    q   = sb.table(GENERATED_CONTENT_TABLE).select("*").eq("status", "draft")

    if content_type:
        if content_type not in ("blog_post", "ig_caption", "yt_short"):
            raise HTTPException(status_code=400, detail="Invalid content_type filter.")
        q = q.eq("content_type", content_type)

    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    items = res.data or []

    # Count total drafts for pagination
    count_res = (
        sb.table(GENERATED_CONTENT_TABLE)
        .select("id", count="exact")
        .eq("status", "draft")
        .execute()
    )
    total = count_res.count if hasattr(count_res, "count") else len(items)

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.patch("/{content_id}/approve")
def approve_content(
    content_id: str,
    body: ApproveBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Approve a draft content item, optionally publishing it immediately."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    uid = str(current_user["id"])
    sb  = get_supabase()

    item_res = sb.table(GENERATED_CONTENT_TABLE).select("*").eq("id", content_id).limit(1).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Content item not found.")
    item = item_res.data[0]

    if item["status"] not in ("draft",):
        raise HTTPException(status_code=409, detail=f"Item is already '{item['status']}' — cannot approve.")

    now     = datetime.now(timezone.utc).isoformat()
    updates: dict[str, Any] = {
        "status":      "published" if body.publish_now else "approved",
        "reviewed_by": uid,
        "reviewed_at": now,
    }
    if body.publish_now:
        updates["published_at"] = now

    sb.table(GENERATED_CONTENT_TABLE).update(updates).eq("id", content_id).execute()

    return {
        "ok":         True,
        "content_id": content_id,
        "new_status": updates["status"],
        "published":  body.publish_now,
    }


@router.patch("/{content_id}/reject")
def reject_content(
    content_id: str,
    body: RejectBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Reject a draft content item with a reason."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    uid = str(current_user["id"])
    sb  = get_supabase()

    item_res = sb.table(GENERATED_CONTENT_TABLE).select("id, status").eq("id", content_id).limit(1).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Content item not found.")
    item = item_res.data[0]

    if item["status"] not in ("draft", "approved"):
        raise HTTPException(status_code=409, detail=f"Item is '{item['status']}' — cannot reject.")

    now = datetime.now(timezone.utc).isoformat()
    sb.table(GENERATED_CONTENT_TABLE).update({
        "status":      "rejected",
        "reviewed_by": uid,
        "reviewed_at": now,
    }).eq("id", content_id).execute()

    return {"ok": True, "content_id": content_id, "new_status": "rejected"}


@router.post("/generate")
def manual_generate(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Manually trigger weekly content generation for the next 7 days. Admin only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    from workers.content_gen import generate_weekly_content
    try:
        inserted = generate_weekly_content()
    except Exception as exc:
        logger.exception("content/generate: manual trigger failed")
        raise HTTPException(status_code=502, detail=f"Content generation failed: {exc}") from exc

    return {
        "ok":      True,
        "inserted": inserted,
        "message": f"{inserted} draft content items generated for the next 7 days.",
    }


@router.get("/published")
def list_published(
    content_type: str = Query(default="blog_post", description="blog_post|ig_caption|yt_short"),
    vansha_id: Optional[str] = Query(default=None, description="Filter by vansha (omit for generic)"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """
    Public endpoint — returns published content items.
    Generic items (vansha_id=NULL) are visible to everyone.
    Personalised items are included when vansha_id is provided.
    """
    if content_type not in ("blog_post", "ig_caption", "yt_short"):
        raise HTTPException(status_code=400, detail="Invalid content_type.")

    sb = get_supabase()

    q = (
        sb.table(GENERATED_CONTENT_TABLE)
        .select("id, panchang_date, tithi_id, content_type, vansha_id, family_name, location, title, subtitle, body, hashtags, published_at")
        .eq("status", "published")
        .eq("content_type", content_type)
    )

    if vansha_id:
        # Generic OR this vansha's personalised content
        q = q.or_(f"vansha_id.is.null,vansha_id.eq.{vansha_id}")
    else:
        q = q.is_("vansha_id", "null")

    res = (
        q.order("published_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    items = res.data or []

    return {"items": items, "limit": limit, "offset": offset, "content_type": content_type}
