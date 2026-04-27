"""
Care Reminder Worker — APScheduler daily job.

Runs every day at 08:00 IST (02:30 UTC).
Scans completed service_orders for care_schedule milestones that are due today or overdue.
Sends in-app notifications to both the vendor and the user.

care_schedule JSON format (per order):
    [
        {"month": 3,  "due_date": "2025-07-01", "status": "pending",   "proof_id": null},
        {"month": 6,  "due_date": "2025-10-01", "status": "notified",  "proof_id": null},
        {"month": 9,  "due_date": "2026-01-01", "status": "completed", "proof_id": "uuid"},
        {"month": 12, "due_date": "2026-04-01", "status": "pending",   "proof_id": null},
    ]
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from constants import NOTIFICATIONS_TABLE, SERVICE_ORDERS_TABLE, VENDORS_TABLE
from db import get_supabase

logger = logging.getLogger(__name__)


def _send_notification(sb: Any, user_id: str, title: str, body: str, notif_type: str = "care_reminder") -> None:
    try:
        sb.table(NOTIFICATIONS_TABLE).insert({
            "user_id": user_id,
            "title":   title,
            "body":    body,
            "type":    notif_type,
            "read":    False,
        }).execute()
    except Exception:
        logger.exception("care_reminder: failed to send notification to user_id=%s", user_id)


def run_care_reminders() -> int:
    """
    Scan service_orders for overdue care milestones and notify vendor + user.
    Returns the number of notifications sent.
    """
    sb = get_supabase()
    today_str = date.today().isoformat()
    notifications_sent = 0

    orders_res = (
        sb.table(SERVICE_ORDERS_TABLE)
        .select("id, user_id, vendor_id, package_id, care_schedule")
        .eq("status", "completed")
        .execute()
    )
    orders = orders_res.data or []

    for order in orders:
        care_schedule = order.get("care_schedule") or []
        if isinstance(care_schedule, str):
            try:
                care_schedule = json.loads(care_schedule)
            except Exception:
                continue

        updated = False
        for milestone in care_schedule:
            if milestone.get("status") not in ("pending",):
                continue
            due_date = milestone.get("due_date", "")
            if not due_date or due_date > today_str:
                continue

            month = milestone.get("month", "?")
            order_id = order["id"]
            user_id  = str(order["user_id"])
            vendor_id = order.get("vendor_id")

            # Notify user
            _send_notification(
                sb, user_id,
                f"🌳 Month {month} Tree Care Update Due",
                f"Your service order is due for a {month}-month care check. "
                f"Your vendor will upload proof shortly. Track at /services/orders/{order_id}",
            )
            notifications_sent += 1

            # Notify vendor (find vendor's user_id)
            if vendor_id:
                vendor_res = (
                    sb.table(VENDORS_TABLE)
                    .select("user_id")
                    .eq("id", str(vendor_id))
                    .limit(1)
                    .execute()
                )
                if vendor_res.data and vendor_res.data[0].get("user_id"):
                    vendor_user_id = str(vendor_res.data[0]["user_id"])
                    _send_notification(
                        sb, vendor_user_id,
                        f"📋 Care Upload Due — Month {month}",
                        f"Order {order_id[:8]}… requires a month-{month} care proof upload. "
                        f"Please upload a geo-tagged photo in your vendor portal.",
                    )
                    notifications_sent += 1

            milestone["status"] = "notified"
            updated = True

        if updated:
            sb.table(SERVICE_ORDERS_TABLE).update(
                {"care_schedule": care_schedule}
            ).eq("id", order["id"]).execute()

    logger.info("care_reminder: sent %d notifications for %d orders", notifications_sent, len(orders))
    return notifications_sent


def create_care_reminder_scheduler(scheduler: AsyncIOScheduler) -> None:
    """Register the daily care reminder job on an existing scheduler."""
    scheduler.add_job(
        run_care_reminders,
        trigger=CronTrigger(hour=2, minute=30, timezone="UTC"),  # 08:00 IST
        id="care_reminder_daily",
        name="Daily service order care milestone reminder",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    logger.info("Care reminder job registered (daily 02:30 UTC / 08:00 IST)")
