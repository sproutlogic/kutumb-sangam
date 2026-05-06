"""
Superadmin tree-plan dashboard APIs.

Endpoints (all require admin/superadmin role):
  GET    /api/admin/tree-plans                   List all plans (active+inactive).
  POST   /api/admin/tree-plans                   Create a new plan.
  PATCH  /api/admin/tree-plans/{plan_id}         Update plan (price/display freely;
                                                  limits frozen if active subs exist).
  DELETE /api/admin/tree-plans/{plan_id}         Deactivate plan (soft delete).
  GET    /api/admin/tree-subscriptions           Paginated list of all subscriptions.
  POST   /api/admin/override/{user_id}           Create admin_override event.
  GET    /api/admin/subscription-events          Audit log (filterable).
  GET    /api/admin/sachet-analytics             Most-unlocked nodes, conversion stats.
  GET    /api/admin/gst-report                   Date-range invoice export rows.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from constants import (
    ENTITLEMENT_SHARES_TABLE,
    GEN_TOPUPS_TABLE,
    INVOICES_TABLE,
    NODE_UNLOCKS_TABLE,
    REFERRAL_UNLOCKS_TABLE,
    SUBSCRIPTION_EVENTS_TABLE,
    TREE_PLANS_TABLE,
    USER_SUBSCRIPTIONS_TABLE,
)
from db import get_supabase
from middleware.auth import SuperadminUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin-tree-plans"])


# ─── Models ──────────────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    name:                  str = Field(min_length=2, max_length=40)
    display_name:          str = Field(min_length=2, max_length=80)
    price_inr_monthly:     float = Field(ge=0)
    price_inr_annual:      float = Field(ge=0)
    gen_up:                int = Field(ge=0, le=20)
    gen_down:              int = Field(ge=0, le=20)
    max_intentional_nodes: int = Field(ge=1, le=999999)
    features:              dict[str, bool] = Field(default_factory=dict)
    sort_order:            int = 0
    description:           Optional[str] = None
    is_active:             bool = True


class PlanUpdate(BaseModel):
    display_name:          Optional[str] = None
    price_inr_monthly:     Optional[float] = None
    price_inr_annual:      Optional[float] = None
    gen_up:                Optional[int] = Field(default=None, ge=0, le=20)
    gen_down:              Optional[int] = Field(default=None, ge=0, le=20)
    max_intentional_nodes: Optional[int] = Field(default=None, ge=1, le=999999)
    features:              Optional[dict[str, bool]] = None
    sort_order:            Optional[int] = None
    description:           Optional[str] = None
    is_active:             Optional[bool] = None


class OverrideBody(BaseModel):
    gen_up:    Optional[int] = Field(default=None, ge=0, le=20)
    gen_down:  Optional[int] = Field(default=None, ge=0, le=20)
    max_nodes: Optional[int] = Field(default=None, ge=1, le=999999)
    reason:    str = Field(min_length=3, max_length=500)
    active:    bool = True


# ─── Helpers ─────────────────────────────────────────────────────────────────

LIMIT_FIELDS = {"gen_up", "gen_down", "max_intentional_nodes"}


def _has_active_subscribers(sb, plan_id: str) -> bool:
    res = (
        sb.table(USER_SUBSCRIPTIONS_TABLE)
        .select("id", count="exact")
        .eq("plan_id", plan_id)
        .in_("status", ["active", "trial", "grace_period"])
        .limit(1)
        .execute()
    )
    return bool(res.count and res.count > 0)


# ─── Plan CRUD ───────────────────────────────────────────────────────────────

@router.get("/tree-plans")
def list_plans(user: SuperadminUser) -> dict[str, Any]:
    sb  = get_supabase()
    res = sb.table(TREE_PLANS_TABLE).select("*").order("sort_order").execute()
    return {"plans": res.data or []}


@router.post("/tree-plans")
def create_plan(body: PlanCreate, user: SuperadminUser) -> dict[str, Any]:
    sb = get_supabase()
    row = body.model_dump()
    try:
        res = sb.table(TREE_PLANS_TABLE).insert(row).execute()
    except Exception as exc:
        logger.exception("Plan create failed")
        raise HTTPException(status_code=400, detail=f"Could not create plan: {exc}")
    return {"ok": True, "plan": res.data[0] if res.data else None}


@router.patch("/tree-plans/{plan_id}")
def update_plan(plan_id: UUID, body: PlanUpdate, user: SuperadminUser) -> dict[str, Any]:
    sb = get_supabase()
    pid = str(plan_id)

    # Block limit changes if active subscribers exist
    body_dict = body.model_dump(exclude_unset=True)
    touches_limits = any(k in body_dict for k in LIMIT_FIELDS)
    if touches_limits and _has_active_subscribers(sb, pid):
        raise HTTPException(
            status_code=409,
            detail="Cannot modify limits (gen_up/gen_down/max_intentional_nodes) "
                   "while active subscribers exist on this plan. Create a new plan instead.",
        )

    if not body_dict:
        raise HTTPException(status_code=400, detail="No fields to update.")

    try:
        res = sb.table(TREE_PLANS_TABLE).update(body_dict).eq("id", pid).execute()
    except Exception as exc:
        logger.exception("Plan update failed")
        raise HTTPException(status_code=400, detail=f"Could not update: {exc}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Plan not found.")
    return {"ok": True, "plan": res.data[0]}


@router.delete("/tree-plans/{plan_id}")
def deactivate_plan(plan_id: UUID, user: SuperadminUser) -> dict[str, Any]:
    sb = get_supabase()
    pid = str(plan_id)
    if _has_active_subscribers(sb, pid):
        raise HTTPException(
            status_code=409,
            detail="Plan has active subscribers — cannot deactivate. "
                   "Migrate users first.",
        )
    res = sb.table(TREE_PLANS_TABLE).update({"is_active": False}).eq("id", pid).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Plan not found.")
    return {"ok": True}


# ─── Subscription explorer ───────────────────────────────────────────────────

@router.get("/tree-subscriptions")
def list_subscriptions(
    user: SuperadminUser,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    plan_id: Optional[UUID] = None,
    page:    int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    sb = get_supabase()
    q  = sb.table(USER_SUBSCRIPTIONS_TABLE).select("*, tree_plans(name, display_name)", count="exact")
    if status_filter:
        q = q.eq("status", status_filter)
    if plan_id:
        q = q.eq("plan_id", str(plan_id))
    q = q.order("created_at", desc=True).range((page - 1) * per_page, page * per_page - 1)
    res = q.execute()
    return {
        "subscriptions": res.data or [],
        "total":         res.count or 0,
        "page":          page,
        "per_page":      per_page,
    }


# ─── Admin override ──────────────────────────────────────────────────────────

@router.post("/override/{target_user_id}")
def admin_override(
    target_user_id: UUID,
    body: OverrideBody,
    user: SuperadminUser,
) -> dict[str, Any]:
    sb  = get_supabase()
    uid = str(target_user_id)

    metadata = {
        "active":    body.active,
        "reason":    body.reason,
        "applied_by_role": user.get("role"),
    }
    if body.gen_up    is not None: metadata["gen_up"]    = body.gen_up
    if body.gen_down  is not None: metadata["gen_down"]  = body.gen_down
    if body.max_nodes is not None: metadata["max_nodes"] = body.max_nodes

    try:
        ev = sb.table(SUBSCRIPTION_EVENTS_TABLE).insert({
            "user_id":    uid,
            "event_type": "admin_override",
            "metadata":   metadata,
            "created_by": str(user["id"]),
        }).execute()
    except Exception as exc:
        logger.exception("Override failed")
        raise HTTPException(status_code=500, detail=f"Could not apply override: {exc}")

    # Bust cache
    try:
        sb.table("user_visible_nodes").delete().eq("user_id", uid).execute()
    except Exception:
        logger.exception("Cache bust failed for override target %s", uid)

    return {"ok": True, "event": ev.data[0] if ev.data else None}


# ─── Audit log ───────────────────────────────────────────────────────────────

@router.get("/subscription-events")
def event_log(
    user: SuperadminUser,
    event_type: Optional[str] = None,
    target_user_id: Optional[UUID] = None,
    page:    int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    sb = get_supabase()
    q  = sb.table(SUBSCRIPTION_EVENTS_TABLE).select("*", count="exact")
    if event_type:
        q = q.eq("event_type", event_type)
    if target_user_id:
        q = q.eq("user_id", str(target_user_id))
    q = q.order("created_at", desc=True).range((page - 1) * per_page, page * per_page - 1)
    res = q.execute()
    return {"events": res.data or [], "total": res.count or 0, "page": page, "per_page": per_page}


# ─── Sachet analytics ────────────────────────────────────────────────────────

@router.get("/sachet-analytics")
def sachet_analytics(user: SuperadminUser) -> dict[str, Any]:
    sb = get_supabase()

    unlocks = sb.table(NODE_UNLOCKS_TABLE).select("node_id, user_id, price_paid_inr").execute()
    rows = unlocks.data or []

    # Top-unlocked node ids (descending)
    counts: dict[str, int] = {}
    for r in rows:
        nid = str(r["node_id"])
        counts[nid] = counts.get(nid, 0) + 1
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:25]

    # Total revenue from sachets
    total_inr = sum(float(r.get("price_paid_inr") or 0) for r in rows)

    # Top granted topups
    topup_res = sb.table(GEN_TOPUPS_TABLE).select("user_id, price_paid_inr, valid_until").execute()
    topup_rows = topup_res.data or []
    topup_revenue = sum(float(r.get("price_paid_inr") or 0) for r in topup_rows)

    return {
        "node_unlocks": {
            "total_count":      len(rows),
            "total_revenue_inr": total_inr,
            "top_unlocked_node_ids": [{"node_id": nid, "count": c} for nid, c in top],
        },
        "topups": {
            "total_count":      len(topup_rows),
            "total_revenue_inr": topup_revenue,
        },
        "shares": {
            "total_active":  (sb.table(ENTITLEMENT_SHARES_TABLE).select("id", count="exact")
                              .is_("revoked_at", "null").execute().count or 0),
        },
    }


# ─── GST report ──────────────────────────────────────────────────────────────

@router.get("/gst-report")
def gst_report(
    user: SuperadminUser,
    start_date: Optional[str] = Query(default=None, description="ISO date"),
    end_date:   Optional[str] = Query(default=None, description="ISO date"),
) -> dict[str, Any]:
    """
    Return invoice rows for a date range, with totals broken out by tax type.
    Frontend converts this into CSV for CA / GST filing.
    """
    sb = get_supabase()
    q = sb.table(INVOICES_TABLE).select("*")
    if start_date:
        q = q.gte("created_at", start_date)
    if end_date:
        q = q.lte("created_at", end_date)
    q = q.order("created_at", desc=False)
    res = q.execute()

    rows = res.data or []
    totals = {
        "base_paise": 0, "cgst_paise": 0, "sgst_paise": 0, "igst_paise": 0, "total_paise": 0,
    }
    for r in rows:
        for k in totals.keys():
            totals[k] += int(r.get(k) or 0)

    return {
        "rows":      rows,
        "totals":    totals,
        "row_count": len(rows),
        "range":     {"start_date": start_date, "end_date": end_date},
    }


# ─── Referral unlocks summary (for ops visibility) ──────────────────────────

@router.get("/referral-unlocks")
def referral_unlocks_summary(user: SuperadminUser) -> dict[str, Any]:
    sb  = get_supabase()
    res = sb.table(REFERRAL_UNLOCKS_TABLE).select("*").order("referrals_count", desc=True).execute()
    rows = res.data or []
    total_users = len(rows)
    totals_up   = sum(int(r.get("extra_gen_up") or 0) for r in rows)
    totals_down = sum(int(r.get("extra_gen_down") or 0) for r in rows)
    return {
        "rows":           rows,
        "total_users":    total_users,
        "total_extra_up":   totals_up,
        "total_extra_down": totals_down,
    }
