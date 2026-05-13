"""
Non-fatal helper for writing to the performance_events ledger.

Import and call record_event() from any router after a successful action.
Never raises — always logs on failure so the main request is never broken.
"""

from __future__ import annotations

import logging
from typing import Any

from db import get_supabase

logger = logging.getLogger(__name__)

_WEIGHT_CACHE: dict[str, int] = {}


def _get_weight(sb: Any, event_type: str) -> int:
    if event_type in _WEIGHT_CACHE:
        return _WEIGHT_CACHE[event_type]
    try:
        res = sb.table("performance_weights").select("weight").eq("event_type", event_type).limit(1).execute()
        w = res.data[0]["weight"] if res.data else 1
    except Exception:
        w = 1
    _WEIGHT_CACHE[event_type] = w
    return w


def record_event(
    *,
    user_id: str,
    event_type: str,
    ref_id: str | None = None,
    ref_table: str | None = None,
    attributed_to: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write one immutable performance event row. Non-fatal on any error."""
    try:
        sb = get_supabase()
        weight = _get_weight(sb, event_type)
        sb.table("performance_events").insert({
            "user_id":       user_id,
            "event_type":    event_type,
            "weight":        weight,
            "ref_id":        ref_id,
            "ref_table":     ref_table,
            "attributed_to": attributed_to,
            "metadata":      metadata or {},
        }).execute()
    except Exception:
        logger.exception(
            "performance.record_event failed — user_id=%s event_type=%s",
            user_id, event_type,
        )
