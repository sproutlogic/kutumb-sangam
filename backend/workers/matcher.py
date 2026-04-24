"""
Daily matcher: detect gotra / match_hash collisions across distinct vanshas.

When multiple `vansha_id` values share the same `match_hash`, we log a
'Gotra Collision Event' for future premium notifications.
"""

from __future__ import annotations

import logging
from collections import defaultdict

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from constants import PERSONS_TABLE, VANSHA_ID_COLUMN
from db import get_supabase

logger = logging.getLogger(__name__)


def scan_gotra_collisions() -> None:
    """Group all persons by `match_hash`; log when several vanshas share a hash."""
    sb = get_supabase()
    try:
        resp = sb.table(PERSONS_TABLE).select(
            f"{VANSHA_ID_COLUMN}, match_hash, node_id"
        ).execute()
    except Exception:
        logger.exception("Matcher: failed to load persons for collision scan")
        return

    rows = resp.data or []
    hash_to_vanshas: dict[str, set[str]] = defaultdict(set)

    for row in rows:
        h = row.get("match_hash")
        vid = row.get(VANSHA_ID_COLUMN)
        if not h or not vid:
            continue
        hash_to_vanshas[str(h)].add(str(vid))

    for match_hash, vansha_ids in sorted(hash_to_vanshas.items(), key=lambda x: x[0]):
        if len(vansha_ids) <= 1:
            continue
        logger.warning(
            "Gotra Collision Event: match_hash=%r shared by vansha_ids=%s",
            match_hash,
            sorted(vansha_ids),
        )


def create_matcher_scheduler() -> AsyncIOScheduler:
    settings = get_settings()
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        scan_gotra_collisions,
        trigger=CronTrigger(
            minute=settings.matcher_cron_minute,
            hour=settings.matcher_cron_hour,
        ),
        id="gotra_collision_daily",
        name="Daily gotra / match_hash collision scan",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    return scheduler
