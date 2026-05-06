"""
Sachet (micro-transaction) APIs.

Three sachet products:
  • Node unlock        — permanent unlock of a single ghost ancestor/descendant.
  • Branch bundle      — permanent unlock of an entire subtree.
  • Generation topup   — temporary +1 gen window for 30 days.

Endpoints:
  POST /api/sachets/node-unlock/checkout      Create stub order + price quote.
  POST /api/sachets/node-unlock/verify        Activate after payment confirm.
  POST /api/sachets/bundle/checkout
  POST /api/sachets/bundle/verify
  POST /api/sachets/topup/checkout
  POST /api/sachets/topup/verify
  GET  /api/sachets/my                        List of my unlocks + topups.

PAYMENT GATEWAY: stubbed. Mock order_ids of the form `order_mock_{uuid4}`.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import (
    GEN_TOPUPS_TABLE,
    NODE_UNLOCKS_TABLE,
    PERSONS_TABLE,
    SACHET_BRANCH_BUNDLE_PRICE,
    SACHET_GEN_TOPUP_DAYS,
    SACHET_GEN_TOPUP_PRICE,
    SACHET_NODE_BUNDLE_5_PRICE,
    SACHET_NODE_UNLOCK_PRICE,
    SUBSCRIPTION_EVENTS_TABLE,
    USER_VISIBLE_NODES_TABLE,
    VANSHA_ID_COLUMN,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sachets", tags=["sachets"])


# ─── Models ──────────────────────────────────────────────────────────────────

class NodeUnlockBody(BaseModel):
    node_ids: list[UUID] = Field(min_length=1, max_length=5)
    # 1 → ₹19, 2-5 → ₹49 (bundle of 5)


class BranchBundleBody(BaseModel):
    bundle_root_node_id: UUID
    descendant_node_ids: list[UUID] = Field(min_length=1, max_length=50)


class TopupBody(BaseModel):
    direction: Literal["up", "down"] = "up"
    extra_gens: int = Field(ge=1, le=2, default=1)
    days: int = Field(ge=7, le=90, default=SACHET_GEN_TOPUP_DAYS)


class VerifyBody(BaseModel):
    gateway_order_id:   str
    gateway_payment_id: Optional[str] = None
    gateway_signature:  Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _str_id(v: Any) -> str:
    return str(v) if v is not None else ""


def _create_gateway_order(amount_inr: int, label: str) -> str:
    """STUB — mock Razorpay order id."""
    return f"order_mock_{uuid.uuid4().hex[:14]}"


def _bust_cache(sb, user_id: str) -> None:
    try:
        sb.table(USER_VISIBLE_NODES_TABLE).delete().eq("user_id", user_id).execute()
    except Exception:
        logger.exception("Cache bust failed for user %s", user_id)


def _record_event(sb, *, user_id: str, event_type: str,
                  metadata: dict[str, Any]) -> None:
    try:
        sb.table(SUBSCRIPTION_EVENTS_TABLE).insert({
            "user_id":    user_id,
            "event_type": event_type,
            "metadata":   metadata,
            "created_by": user_id,
        }).execute()
    except Exception:
        logger.exception("Event log failed: %s for user %s", event_type, user_id)


# ─── Node-unlock sachet ──────────────────────────────────────────────────────

@router.post("/node-unlock/checkout")
def node_unlock_checkout(body: NodeUnlockBody, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    n = len(body.node_ids)
    if n == 1:
        price = SACHET_NODE_UNLOCK_PRICE
        product = "node_unlock_single"
    else:
        price = SACHET_NODE_BUNDLE_5_PRICE
        product = "node_unlock_bundle_5"

    # Confirm nodes exist
    ids_str = [str(n) for n in body.node_ids]
    res = sb.table(PERSONS_TABLE).select("node_id, vansha_id").in_("node_id", ids_str).execute()
    if not res.data or len(res.data) != n:
        raise HTTPException(status_code=400, detail="Some node ids do not exist.")

    order_id = _create_gateway_order(price, product)

    _record_event(sb, user_id=uid, event_type="sachet_purchased",
                  metadata={
                      "stage":            "checkout_initiated",
                      "product":          product,
                      "node_ids":         ids_str,
                      "amount_inr":       price,
                      "gateway_order_id": order_id,
                  })

    return {
        "ok":             True,
        "order_id":       order_id,
        "amount_paise":   price * 100,
        "amount_inr":     price,
        "product":        product,
        "node_count":     n,
        "currency":       "INR",
        "gateway":        "razorpay_stub",
        "gateway_ready":  False,
    }


@router.post("/node-unlock/verify")
def node_unlock_verify(body: VerifyBody, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    ev = (
        sb.table(SUBSCRIPTION_EVENTS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("event_type", "sachet_purchased")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    matching = None
    for row in (ev.data or []):
        meta = row.get("metadata") or {}
        if meta.get("gateway_order_id") == body.gateway_order_id \
           and meta.get("stage") == "checkout_initiated" \
           and (meta.get("product") or "").startswith("node_unlock"):
            matching = row
            break
    if not matching:
        raise HTTPException(status_code=404, detail="No matching pending node-unlock order.")

    meta = matching.get("metadata") or {}
    node_ids = meta.get("node_ids") or []
    price    = int(meta.get("amount_inr") or 0)

    rows = []
    for nid in node_ids:
        rows.append({
            "user_id":          uid,
            "node_id":          nid,
            "bundle_size":      len(node_ids),
            "price_paid_inr":   price / max(len(node_ids), 1),
            "gateway_order_id": body.gateway_order_id,
        })
    try:
        sb.table(NODE_UNLOCKS_TABLE).upsert(rows, on_conflict="user_id,node_id").execute()
    except Exception:
        logger.exception("node_unlocks insert failed")
        raise HTTPException(status_code=500, detail="Could not record unlock.")

    _record_event(sb, user_id=uid, event_type="sachet_purchased",
                  metadata={**meta, "stage": "activated",
                            "gateway_payment_id": body.gateway_payment_id})
    _bust_cache(sb, uid)

    return {"ok": True, "unlocked_node_ids": node_ids}


# ─── Branch bundle sachet ────────────────────────────────────────────────────

@router.post("/bundle/checkout")
def bundle_checkout(body: BranchBundleBody, user: CurrentUser) -> dict[str, Any]:
    uid   = _str_id(user["id"])
    sb    = get_supabase()
    price = SACHET_BRANCH_BUNDLE_PRICE
    order_id = _create_gateway_order(price, "branch_bundle")

    descendant_ids = [str(n) for n in body.descendant_node_ids]
    _record_event(sb, user_id=uid, event_type="sachet_purchased",
                  metadata={
                      "stage":               "checkout_initiated",
                      "product":             "branch_bundle",
                      "bundle_root_node_id": str(body.bundle_root_node_id),
                      "descendant_node_ids": descendant_ids,
                      "amount_inr":          price,
                      "gateway_order_id":    order_id,
                  })

    return {
        "ok":            True,
        "order_id":      order_id,
        "amount_paise":  price * 100,
        "amount_inr":    price,
        "product":       "branch_bundle",
        "node_count":    len(descendant_ids),
        "currency":      "INR",
        "gateway":       "razorpay_stub",
        "gateway_ready": False,
    }


@router.post("/bundle/verify")
def bundle_verify(body: VerifyBody, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    ev = (
        sb.table(SUBSCRIPTION_EVENTS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("event_type", "sachet_purchased")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    matching = None
    for row in (ev.data or []):
        meta = row.get("metadata") or {}
        if meta.get("gateway_order_id") == body.gateway_order_id \
           and meta.get("stage") == "checkout_initiated" \
           and meta.get("product") == "branch_bundle":
            matching = row
            break
    if not matching:
        raise HTTPException(status_code=404, detail="No matching bundle order.")

    meta = matching.get("metadata") or {}
    descendant_ids = meta.get("descendant_node_ids") or []
    bundle_root    = meta.get("bundle_root_node_id")
    price          = int(meta.get("amount_inr") or 0)

    rows = [{
        "user_id":          uid,
        "node_id":          nid,
        "bundle_size":      len(descendant_ids),
        "bundle_root_id":   bundle_root,
        "price_paid_inr":   price / max(len(descendant_ids), 1),
        "gateway_order_id": body.gateway_order_id,
    } for nid in descendant_ids]
    try:
        sb.table(NODE_UNLOCKS_TABLE).upsert(rows, on_conflict="user_id,node_id").execute()
    except Exception:
        logger.exception("bundle insert failed")
        raise HTTPException(status_code=500, detail="Could not record bundle unlock.")

    _record_event(sb, user_id=uid, event_type="sachet_purchased",
                  metadata={**meta, "stage": "activated",
                            "gateway_payment_id": body.gateway_payment_id})
    _bust_cache(sb, uid)

    return {"ok": True, "unlocked_node_ids": descendant_ids}


# ─── Generation topup ────────────────────────────────────────────────────────

@router.post("/topup/checkout")
def topup_checkout(body: TopupBody, user: CurrentUser) -> dict[str, Any]:
    uid   = _str_id(user["id"])
    sb    = get_supabase()
    price = SACHET_GEN_TOPUP_PRICE * body.extra_gens
    order_id = _create_gateway_order(price, "gen_topup")

    _record_event(sb, user_id=uid, event_type="topup_activated",
                  metadata={
                      "stage":            "checkout_initiated",
                      "product":          "gen_topup",
                      "direction":        body.direction,
                      "extra_gens":       body.extra_gens,
                      "days":             body.days,
                      "amount_inr":       price,
                      "gateway_order_id": order_id,
                  })
    return {
        "ok":            True,
        "order_id":      order_id,
        "amount_paise":  price * 100,
        "amount_inr":    price,
        "product":       "gen_topup",
        "extra_gens":    body.extra_gens,
        "direction":     body.direction,
        "days":          body.days,
        "currency":      "INR",
        "gateway":       "razorpay_stub",
        "gateway_ready": False,
    }


@router.post("/topup/verify")
def topup_verify(body: VerifyBody, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    ev = (
        sb.table(SUBSCRIPTION_EVENTS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("event_type", "topup_activated")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    matching = None
    for row in (ev.data or []):
        meta = row.get("metadata") or {}
        if meta.get("gateway_order_id") == body.gateway_order_id \
           and meta.get("stage") == "checkout_initiated":
            matching = row
            break
    if not matching:
        raise HTTPException(status_code=404, detail="No matching topup order.")

    meta = matching.get("metadata") or {}
    direction  = meta.get("direction", "up")
    extra      = int(meta.get("extra_gens") or 1)
    days       = int(meta.get("days") or SACHET_GEN_TOPUP_DAYS)
    price      = int(meta.get("amount_inr") or 0)
    valid_until = datetime.now(timezone.utc) + timedelta(days=days)

    row = {
        "user_id":          uid,
        "extra_gen_up":     extra if direction == "up"   else 0,
        "extra_gen_down":   extra if direction == "down" else 0,
        "price_paid_inr":   price,
        "valid_until":      valid_until.isoformat(),
        "gateway_order_id": body.gateway_order_id,
    }
    try:
        ins = sb.table(GEN_TOPUPS_TABLE).insert(row).execute()
    except Exception:
        logger.exception("topup insert failed")
        raise HTTPException(status_code=500, detail="Could not record topup.")

    _record_event(sb, user_id=uid, event_type="topup_activated",
                  metadata={**meta, "stage": "activated",
                            "valid_until": valid_until.isoformat(),
                            "gateway_payment_id": body.gateway_payment_id})
    _bust_cache(sb, uid)

    return {"ok": True, "topup": ins.data[0] if ins.data else row}


# ─── Reads ───────────────────────────────────────────────────────────────────

@router.get("/my")
def my_sachets(user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    unlocks = (
        sb.table(NODE_UNLOCKS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .order("purchased_at", desc=True)
        .execute()
    )
    topups = (
        sb.table(GEN_TOPUPS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .order("purchased_at", desc=True)
        .execute()
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    active_topups = [t for t in (topups.data or []) if (t.get("valid_until") or "") > now_iso]

    return {
        "node_unlocks":   unlocks.data or [],
        "topups":         topups.data or [],
        "active_topups":  active_topups,
        "pricing": {
            "single_node":   SACHET_NODE_UNLOCK_PRICE,
            "bundle_5":      SACHET_NODE_BUNDLE_5_PRICE,
            "branch_bundle": SACHET_BRANCH_BUNDLE_PRICE,
            "gen_topup":     SACHET_GEN_TOPUP_PRICE,
            "topup_days":    SACHET_GEN_TOPUP_DAYS,
        },
    }
