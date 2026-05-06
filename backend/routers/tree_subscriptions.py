"""
Tree subscription checkout / activation API.

Distinct from /api/payments (which serves Paryavaran Mitra membership plans
beej/ankur/vriksh/vansh). This router handles the tree-visibility plans
free/basic/standard/premium tied to user_subscriptions + tree_plans.

Endpoints:
  GET  /api/subscriptions/plans            Public list of active tree plans.
  POST /api/subscriptions/checkout         Create stub Razorpay order (mock id).
  POST /api/subscriptions/verify           Activate subscription after payment confirm.
  POST /api/subscriptions/webhook          Razorpay webhook stub.
  GET  /api/subscriptions/my               Current + history.
  POST /api/subscriptions/cancel           Cancel current subscription.

PAYMENT GATEWAY: stubbed. All checkout responses return a mock order_id of the
form `order_mock_{uuid4}`. Once Razorpay credentials are wired, swap the stub
in `_create_gateway_order()` with the real client call.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from constants import (
    DEFAULT_CGST_RATE, DEFAULT_IGST_RATE, DEFAULT_SGST_RATE,
    SUBSCRIPTION_EVENTS_TABLE,
    TREE_PLANS_TABLE,
    USER_SUBSCRIPTIONS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscriptions", tags=["tree-subscriptions"])


# ─── Models ──────────────────────────────────────────────────────────────────

BillingPeriod = Literal["monthly", "annual"]


class CheckoutBody(BaseModel):
    plan_id:        UUID
    billing_period: BillingPeriod = "monthly"
    billed_name:    Optional[str] = None
    billed_email:   Optional[str] = None
    billed_phone:   Optional[str] = None
    billed_state:   Optional[str] = None
    use_igst:       bool = True


class VerifyBody(BaseModel):
    gateway_order_id:   str
    gateway_payment_id: Optional[str] = None
    gateway_signature:  Optional[str] = None


class CancelBody(BaseModel):
    reason: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _str_id(v: Any) -> str:
    return str(v) if v is not None else ""


def _create_gateway_order(amount_paise: int, plan_name: str) -> str:
    """
    STUB: Returns a mock Razorpay-style order id.
    When Razorpay is wired in, replace with:
        client.order.create({"amount": amount_paise, "currency": "INR",
                             "receipt": "...", "notes": {...}})["id"]
    """
    return f"order_mock_{uuid.uuid4().hex[:14]}"


def _gst_split(price_inr: Decimal, use_igst: bool) -> dict[str, Any]:
    """Compute CGST/SGST or IGST breakdown. Returns dict with INR Decimal values."""
    rate_total = Decimal("18.00")
    if use_igst:
        igst = (price_inr * Decimal(DEFAULT_IGST_RATE) / Decimal("100")).quantize(Decimal("0.01"))
        return {
            "base_inr":  price_inr,
            "cgst_inr":  Decimal("0"), "cgst_rate": 0.0,
            "sgst_inr":  Decimal("0"), "sgst_rate": 0.0,
            "igst_inr":  igst,         "igst_rate": float(DEFAULT_IGST_RATE),
            "total_inr": (price_inr + igst).quantize(Decimal("0.01")),
        }
    cgst = (price_inr * Decimal(DEFAULT_CGST_RATE) / Decimal("100")).quantize(Decimal("0.01"))
    sgst = (price_inr * Decimal(DEFAULT_SGST_RATE) / Decimal("100")).quantize(Decimal("0.01"))
    return {
        "base_inr":  price_inr,
        "cgst_inr":  cgst, "cgst_rate": float(DEFAULT_CGST_RATE),
        "sgst_inr":  sgst, "sgst_rate": float(DEFAULT_SGST_RATE),
        "igst_inr":  Decimal("0"), "igst_rate": 0.0,
        "total_inr": (price_inr + cgst + sgst).quantize(Decimal("0.01")),
    }


def _record_event(sb, *, user_id: str, event_type: str, plan_id: Optional[str],
                  metadata: dict[str, Any], created_by: Optional[str] = None) -> None:
    try:
        sb.table(SUBSCRIPTION_EVENTS_TABLE).insert({
            "user_id":    user_id,
            "event_type": event_type,
            "plan_id":    plan_id,
            "metadata":   metadata,
            "created_by": created_by or user_id,
        }).execute()
    except Exception:
        logger.exception("Failed to record subscription_event %s for user %s", event_type, user_id)


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/plans")
def list_plans() -> dict[str, Any]:
    """Public list of active plans, sorted by sort_order."""
    sb  = get_supabase()
    res = (
        sb.table(TREE_PLANS_TABLE)
        .select("*")
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    return {"plans": res.data or []}


@router.post("/checkout")
def checkout(body: CheckoutBody, user: CurrentUser) -> dict[str, Any]:
    """
    Create a stub gateway order for the requested plan.
    Returns the mock order_id and amount breakdown for Razorpay-compatible UI.
    """
    uid = _str_id(user["id"])
    sb  = get_supabase()

    plan_res = (
        sb.table(TREE_PLANS_TABLE)
        .select("*")
        .eq("id", str(body.plan_id))
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found or inactive.")
    plan = plan_res.data[0]

    if plan["name"] == "free":
        raise HTTPException(status_code=400, detail="Free plan does not require checkout.")

    price = Decimal(str(plan["price_inr_monthly" if body.billing_period == "monthly"
                                                else "price_inr_annual"]))
    if price <= 0:
        raise HTTPException(status_code=400, detail="Plan has zero price — contact support.")

    tax = _gst_split(price, body.use_igst)
    amount_paise = int((tax["total_inr"] * 100).to_integral_value())

    # STUB gateway order
    order_id = _create_gateway_order(amount_paise, plan["name"])

    _record_event(sb, user_id=uid, event_type="subscribed", plan_id=plan["id"],
                  metadata={
                      "stage":            "checkout_initiated",
                      "billing_period":   body.billing_period,
                      "amount_inr":       float(tax["total_inr"]),
                      "gateway_order_id": order_id,
                      "billed_name":      body.billed_name,
                      "billed_state":     body.billed_state,
                  })

    return {
        "ok":               True,
        "order_id":         order_id,           # mock — for Razorpay UI compatibility
        "amount_paise":     amount_paise,
        "currency":         "INR",
        "plan":             plan,
        "billing_period":   body.billing_period,
        "tax_breakdown":    {k: float(v) if isinstance(v, Decimal) else v
                             for k, v in tax.items()},
        "gateway":          "razorpay_stub",
        "gateway_ready":    False,              # flips True once Razorpay wired
        "key_id":           None,               # Razorpay public key — set later
        "instructions":     "Payment gateway integration pending. "
                            "Call /api/subscriptions/verify with this order_id "
                            "to activate the subscription in dev/test mode.",
    }


@router.post("/verify")
def verify(body: VerifyBody, user: CurrentUser) -> dict[str, Any]:
    """
    Activate the subscription matching this gateway_order_id.
    In stub mode, this is the developer/test path to flip the subscription on
    without an actual payment. When Razorpay is wired, signature verification
    moves here too.
    """
    uid = _str_id(user["id"])
    sb  = get_supabase()

    # Find the latest pending checkout event for this user with matching order_id
    ev = (
        sb.table(SUBSCRIPTION_EVENTS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("event_type", "subscribed")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    matching = None
    for row in (ev.data or []):
        meta = row.get("metadata") or {}
        if meta.get("gateway_order_id") == body.gateway_order_id and meta.get("stage") == "checkout_initiated":
            matching = row
            break
    if not matching:
        raise HTTPException(status_code=404, detail="No pending checkout for this order_id.")

    plan_id        = matching.get("plan_id")
    billing_period = (matching.get("metadata") or {}).get("billing_period", "monthly")
    amount_inr     = (matching.get("metadata") or {}).get("amount_inr", 0)

    # Compute valid_until
    now = datetime.now(timezone.utc)
    duration_days = 30 if billing_period == "monthly" else 365
    valid_until = now + timedelta(days=duration_days)

    # Expire any existing active subscription
    sb.table(USER_SUBSCRIPTIONS_TABLE).update({
        "status": "expired",
    }).eq("user_id", uid).in_("status", ["active", "trial", "grace_period"]).execute()

    # Insert new active subscription
    new_sub_row = {
        "user_id":            uid,
        "plan_id":            plan_id,
        "status":             "active",
        "valid_from":         now.isoformat(),
        "valid_until":        valid_until.isoformat(),
        "price_paid_inr":     amount_inr,
        "billing_period":     billing_period,
        "gateway_order_id":   body.gateway_order_id,
        "gateway_payment_id": body.gateway_payment_id,
    }
    sub_res = sb.table(USER_SUBSCRIPTIONS_TABLE).insert(new_sub_row).execute()
    new_sub = sub_res.data[0] if sub_res.data else new_sub_row

    _record_event(sb, user_id=uid, event_type="renewed", plan_id=plan_id,
                  metadata={
                      "stage":              "activated",
                      "subscription_id":    new_sub.get("id"),
                      "gateway_order_id":   body.gateway_order_id,
                      "gateway_payment_id": body.gateway_payment_id,
                      "valid_until":        valid_until.isoformat(),
                  })

    # Bust visibility cache (fire-and-forget)
    try:
        sb.table("user_visible_nodes").delete().eq("user_id", uid).execute()
    except Exception:
        logger.exception("Failed to bust visibility cache for user %s", uid)

    return {"ok": True, "subscription": new_sub}


@router.post("/webhook")
async def webhook(request: Request) -> dict[str, Any]:
    """
    STUB Razorpay webhook receiver.

    When Razorpay is wired, verify HMAC signature using
    `X-Razorpay-Signature` header against `settings.razorpay_webhook_secret`.
    Then dispatch to event handlers (payment.captured, subscription.charged,
    payment.failed, etc.).
    """
    body_bytes = await request.body()
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON.")

    logger.info("[STUB] Tree subscriptions webhook received: %s", payload.get("event"))
    return {"ok": True, "stub": True}


@router.get("/my")
def my_subscriptions(user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    res = (
        sb.table(USER_SUBSCRIPTIONS_TABLE)
        .select("*, tree_plans(*)")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .execute()
    )
    history = res.data or []
    current = next(
        (s for s in history
         if s.get("status") in ("active", "trial", "grace_period")),
        None,
    )
    return {"current": current, "history": history}


@router.post("/cancel")
def cancel(body: CancelBody, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    cur = (
        sb.table(USER_SUBSCRIPTIONS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .in_("status", ["active", "trial", "grace_period"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not cur.data:
        raise HTTPException(status_code=404, detail="No active subscription to cancel.")
    sub = cur.data[0]
    if sub["plan_id"] is None:
        raise HTTPException(status_code=400, detail="Free plan cannot be cancelled.")

    sb.table(USER_SUBSCRIPTIONS_TABLE).update({
        "status": "cancelled",
    }).eq("id", sub["id"]).execute()

    _record_event(sb, user_id=uid, event_type="cancelled", plan_id=sub.get("plan_id"),
                  metadata={"reason": body.reason or "user-requested",
                            "subscription_id": sub["id"]})

    return {"ok": True, "access_until": sub.get("valid_until")}
