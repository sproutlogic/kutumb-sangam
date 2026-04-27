"""
Content Generation Worker — APScheduler job.

Runs every Monday at 06:00 IST (00:30 UTC).
Renders Eco-Panchang blog posts, Instagram captions, and YouTube short descriptions
from the tithis template table for the coming 7 days.

Generates:
  - 3 generic items per day (vansha_id=NULL, for platform-level use)
  - 3 personalised items per day for the top-10 vanshas by Prakriti Score

All items start as status='draft' and require admin approval before publishing.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from constants import (
    GENERATED_CONTENT_TABLE,
    NOTIFICATIONS_TABLE,
    PANCHANG_CALENDAR_TABLE,
    PERSONS_TABLE,
    PRAKRITI_SCORES_TABLE,
    TITHIS_TABLE,
    USERS_TABLE,
)
from db import get_supabase

logger = logging.getLogger(__name__)

CONTENT_TYPES = ("blog_post", "ig_caption", "yt_short")

_TEMPLATE_KEYS = {
    "blog_post":  ("blog_title_template", "blog_subtitle_template", "blog_body_template", None),
    "ig_caption": ("ig_caption_template",  None,                     "ig_caption_template", "ig_hashtag_set"),
    "yt_short":   ("yt_short_title_template", None,                  "yt_short_desc_template", None),
}


def _render(template: str, ctx: dict[str, str]) -> str:
    """Replace {key} placeholders with context values."""
    result = template
    for key, value in ctx.items():
        result = result.replace(f"{{{key}}}", str(value) if value else "")
    return result.strip()


def _build_rows(
    panchang_row: dict[str, Any],
    tithi_row: dict[str, Any],
    family_name: str,
    location: str,
    vansha_id: str | None,
) -> list[dict[str, Any]]:
    """Build 3 content rows (one per content_type) from templates."""
    date_str = panchang_row["gregorian_date"]
    formatted_date = date.fromisoformat(date_str).strftime("%-d %B %Y")  # e.g. "27 April 2026"
    tithi_name = tithi_row.get("name_hindi") or tithi_row.get("name_common", "")
    community_action = tithi_row.get("community_action", "")
    plant_action = tithi_row.get("plant_action", "")
    water_action = tithi_row.get("water_action", "")

    ctx = {
        "family_name":      family_name,
        "location":         location,
        "tithi_name":       tithi_name,
        "date":             formatted_date,
        "community_action": community_action,
        "plant_action":     plant_action,
        "water_action":     water_action,
    }

    rows: list[dict[str, Any]] = []
    for ct in CONTENT_TYPES:
        title_key, subtitle_key, body_key, hashtag_key = _TEMPLATE_KEYS[ct]

        title    = _render(tithi_row.get(title_key, ""), ctx) if title_key else ""
        subtitle = _render(tithi_row.get(subtitle_key, ""), ctx) if subtitle_key else None
        body     = _render(tithi_row.get(body_key, ""), ctx) if body_key else ""
        hashtags = tithi_row.get(hashtag_key) if hashtag_key else None

        if not title and ct == "blog_post":
            title = f"{family_name} का {tithi_name} पर हरित संकल्प"
        if not body:
            body = f"{tithi_name} — {community_action}"

        rows.append({
            "panchang_date": date_str,
            "tithi_id":      tithi_row["id"],
            "content_type":  ct,
            "vansha_id":     vansha_id,
            "family_name":   family_name,
            "location":      location,
            "title":         title,
            "subtitle":      subtitle,
            "body":          body,
            "hashtags":      hashtags,
            "status":        "draft",
        })

    return rows


def _get_family_display_name(vansha_id: str, sb: Any) -> tuple[str, str]:
    """Return (family_name, location) for a vansha by querying persons table."""
    res = (
        sb.table(PERSONS_TABLE)
        .select("last_name, current_residence")
        .eq("vansha_id", vansha_id)
        .limit(20)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return ("Harit Vanshavali Parivar", "Bharat")

    # Most common last_name
    names = [r["last_name"] for r in rows if r.get("last_name")]
    family_name = (max(set(names), key=names.count) + " Parivar") if names else "Harit Parivar"

    # Most common current_residence
    residences = [r["current_residence"] for r in rows if r.get("current_residence")]
    location = max(set(residences), key=residences.count) if residences else "Bharat"

    return family_name, location


def generate_weekly_content() -> int:
    """
    Main worker entry point.
    Generates content for the next 7 days and notifies admin.
    Returns total rows inserted.
    """
    sb = get_supabase()
    today = date.today()
    window_end = today + timedelta(days=7)

    # Fetch next 7 days from panchang_calendar
    cal_res = (
        sb.table(PANCHANG_CALENDAR_TABLE)
        .select("*, tithis(*)")
        .gte("gregorian_date", today.isoformat())
        .lte("gregorian_date", window_end.isoformat())
        .order("gregorian_date")
        .execute()
    )
    panchang_days = cal_res.data or []

    if not panchang_days:
        logger.warning("content_gen: no panchang_calendar rows found for next 7 days — run panchang_seeder first")
        return 0

    all_rows: list[dict[str, Any]] = []

    # Top-10 vanshas by prakriti_score (for personalised content)
    scores_res = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("vansha_id, score")
        .order("score", desc=True)
        .limit(10)
        .execute()
    )
    top_vanshas = [(r["vansha_id"], r["score"]) for r in (scores_res.data or [])]

    for panchang_row in panchang_days:
        tithi_row = panchang_row.get("tithis")
        if not tithi_row:
            # Fallback: fetch tithi separately
            t_res = sb.table(TITHIS_TABLE).select("*").eq("id", panchang_row["tithi_id"]).limit(1).execute()
            tithi_row = t_res.data[0] if t_res.data else {}

        if not tithi_row:
            continue

        # Generic platform content
        all_rows.extend(_build_rows(
            panchang_row, tithi_row,
            "Harit Vanshavali Parivar", "Bharat", None
        ))

        # Personalised for top vanshas
        for vansha_id, _ in top_vanshas:
            family_name, location = _get_family_display_name(vansha_id, sb)
            all_rows.extend(_build_rows(
                panchang_row, tithi_row,
                family_name, location, vansha_id
            ))

    if not all_rows:
        return 0

    # Batch insert in chunks of 50
    inserted = 0
    for i in range(0, len(all_rows), 50):
        chunk = all_rows[i:i + 50]
        sb.table(GENERATED_CONTENT_TABLE).insert(chunk).execute()
        inserted += len(chunk)

    # Notify all superadmins
    admin_res = (
        sb.table(USERS_TABLE)
        .select("id")
        .in_("role", ["admin", "superadmin"])
        .execute()
    )
    for admin in (admin_res.data or []):
        sb.table(NOTIFICATIONS_TABLE).insert({
            "user_id": admin["id"],
            "title":   "Eco-Panchang Content Ready",
            "body":    f"{inserted} content items generated for next 7 days. Review and approve in /admin/content.",
            "type":    "content_review",
            "read":    False,
        }).execute()

    logger.info("content_gen: inserted %d draft content rows for %d days", inserted, len(panchang_days))
    return inserted


def create_content_gen_scheduler(scheduler: AsyncIOScheduler) -> None:
    """Register the weekly content generation job on an existing scheduler."""
    scheduler.add_job(
        generate_weekly_content,
        trigger=CronTrigger(day_of_week="mon", hour=0, minute=30, timezone="UTC"),  # 06:00 IST
        id="eco_content_gen_weekly",
        name="Weekly Eco-Panchang content generation",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    logger.info("Content generation job registered (weekly Monday 00:30 UTC)")
