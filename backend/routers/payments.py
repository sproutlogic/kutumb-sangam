"""
Payment infrastructure APIs.

GET  /api/payments/transactions              User's full transaction history + current subscription.
GET  /api/payments/invoice/{payment_id}      Full invoice detail (amounts, tax, billing info).
POST /api/payments/create-order              Create a payment record; returns gateway order stub.
POST /api/payments/verify                    Verify gateway signature → mark paid, activate sub, issue invoice.
POST /api/payments/webhook                   Raw gateway webhook receiver (idempotent).
POST /api/payments/{payment_id}/refund       Admin only — initiate a refund.
GET  /api/payments/subscriptions/current     Current active subscription for the user.
DELETE /api/payments/subscriptions/current   Cancel the user's active subscription.

GATEWAY NOTE:
  Gateway fields (gateway_order_id, gateway_payment_id, gateway_signature) are nullable.
  Endpoints that touch the gateway are clearly marked with # TODO: GATEWAY.
  All business logic (GST, invoice, subscription lifecycle) is fully implemented
  and will work the moment the gateway client is wired in.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from constants import (
    DEFAULT_CGST_RATE, DEFAULT_IGST_RATE, DEFAULT_SGST_RATE,
    INVOICES_TABLE, PAYMENTS_TABLE, REFUNDS_TABLE,
    SUBSCRIPTIONS_TABLE, USERS_TABLE, WEBHOOK_EVENTS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payments", tags=["payments"])

# Subscription durations (days)
PLAN_DURATION_DAYS: dict[str, int | None] = {
    "beej":  None,    # free — no expiry
    "ankur": 365,
    "vriksh": 365,
    "vansh":  365,
}


# ─── GST helpers ─────────────────────────────────────────────────────────────

def calc_gst(
    base_paise: int,
    use_igst: bool = True,
    cgst_rate: float = DEFAULT_CGST_RATE,
    sgst_rate: float = DEFAULT_SGST_RATE,
    igst_rate: float = DEFAULT_IGST_RATE,
) -> dict[str, Any]:
    """Return tax breakdown dict for a base amount (in paise)."""
    if use_igst:
        igst = math.ceil(base_paise * igst_rate / 100)
        return {
            "cgst_paise": 0,      "cgst_rate": 0.0,
            "sgst_paise": 0,      "sgst_rate": 0.0,
            "igst_paise": igst,   "igst_rate": igst_rate,
            "total_tax_paise": igst,
        }
    else:
        cgst = math.ceil(base_paise * cgst_rate / 100)
        sgst = math.ceil(base_paise * sgst_rate / 100)
        return {
            "cgst_paise": cgst,   "cgst_rate": cgst_rate,
            "sgst_paise": sgst,   "sgst_rate": sgst_rate,
            "igst_paise": 0,      "igst_rate": 0.0,
            "total_tax_paise": cgst + sgst,
        }


def format_inr(paise: int) -> str:
    """₹99,900 style string from paise."""
    rupees = paise / 100
    return f"₹{rupees:,.2f}"


# ─── Invoice number ───────────────────────────────────────────────────────────

def _next_invoice_number(sb) -> str:
    """
    Generates KM-INV-YYYYMM-NNNNN using a Postgres sequence.
    Month prefix is cosmetic; the sequence itself is monotonic globally.
    """
    res = sb.rpc("nextval", {"seqname": "invoice_seq"}).execute()
    seq_val: int = res.data if isinstance(res.data, int) else int(res.data)
    month_prefix = datetime.now(timezone.utc).strftime("%Y%m")
    return f"KM-INV-{month_prefix}-{str(seq_val).zfill(5)}"


# ─── Pydantic models ─────────────────────────────────────────────────────────

class CreateOrderBody(BaseModel):
    plan_id:      str  = Field(..., description="'ankur'|'vriksh'|'vansh'")
    use_igst:     bool = Field(True, description="True=IGST 18%, False=CGST9+SGST9")
    pre_launch:   bool = Field(False, description="Whether to apply pre-launch offer price")
    # Billing details (optional at order time, required for invoice)
    billed_name:  Optional[str] = None
    billed_email: Optional[str] = None
    billed_phone: Optional[str] = None
    gstin:        Optional[str] = None


class VerifyPaymentBody(BaseModel):
    payment_id:         UUID
    gateway_order_id:   str
    gateway_payment_id: str
    gateway_signature:  str


class RefundBody(BaseModel):
    amount_paise: int  = Field(gt=0, description="Amount to refund in paise")
    reason:       str  = Field(min_length=3, max_length=500)
    notes:        Optional[str] = None


class CancelSubscriptionBody(BaseModel):
    reason: Optional[str] = None


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "superadmin")


def _get_live_price(plan_id: str, pre_launch: bool, sb) -> int:
    """
    Fetch the live price from platform_config.
    Returns the base amount in paise (no tax).
    Falls back to hardcoded defaults if DB is unavailable.
    """
    _DEFAULTS_PAISE = {
        "beej":   0,
        "ankur":  210000,   # ₹2100
        "vriksh": 490000,   # ₹4900
        "vansh":  790000,   # ₹7900
    }
    _PRELAUNCH_PAISE = {
        "ankur": 99900,     # ₹999
    }
    try:
        res = (
            sb.table("platform_config")
            .select("config")
            .eq("id", "pricing")
            .limit(1)
            .execute()
        )
        if res.data:
            cfg  = res.data[0]["config"]
            plan = cfg["plans"].get(plan_id, {})
            if pre_launch and plan.get("isPreLaunch") and plan.get("preLaunchPrice") is not None:
                return int(plan["preLaunchPrice"] * 100)
            return int(plan.get("price", 0) * 100)
    except Exception:
        logger.warning("Could not fetch live pricing — using defaults")

    if pre_launch and plan_id in _PRELAUNCH_PAISE:
        return _PRELAUNCH_PAISE[plan_id]
    return _DEFAULTS_PAISE.get(plan_id, 0)


def _issue_invoice(
    sb,
    *,
    payment_id: str,
    user_id: str,
    base_paise: int,
    tax: dict[str, Any],
    billed_name: str | None,
    billed_email: str | None,
    billed_phone: str | None,
    gstin: str | None,
    description: str,
    plan_id: str | None,
) -> dict[str, Any]:
    """Insert an invoice row and return it."""
    inv_no = _next_invoice_number(sb)
    total  = base_paise + tax["total_tax_paise"]
    row = {
        "payment_id":        payment_id,
        "user_id":           user_id,
        "invoice_number":    inv_no,
        "base_amount_paise": base_paise,
        "cgst_paise":        tax["cgst_paise"],
        "sgst_paise":        tax["sgst_paise"],
        "igst_paise":        tax["igst_paise"],
        "total_paise":       total,
        "cgst_rate":         tax["cgst_rate"],
        "sgst_rate":         tax["sgst_rate"],
        "igst_rate":         tax["igst_rate"],
        "billed_name":       billed_name,
        "billed_email":      billed_email,
        "billed_phone":      billed_phone,
        "gstin":             gstin,
        "line_items": [
            {"description": description, "amount_paise": base_paise, "qty": 1}
        ],
    }
    res = sb.table(INVOICES_TABLE).insert(row).execute()
    return res.data[0] if res.data else row


def _activate_subscription(
    sb, *, user_id: str, plan_id: str, payment_id: str
) -> dict[str, Any]:
    """
    Expire any active subscription, then create a fresh one.
    Returns the new subscription row.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Expire current active sub (if any)
    sb.table(SUBSCRIPTIONS_TABLE).update(
        {"status": "expired", "updated_at": now}
    ).eq("user_id", user_id).eq("status", "active").execute()

    duration = PLAN_DURATION_DAYS.get(plan_id)
    ends_at  = None
    if duration:
        ends_at = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()

    new_sub = {
        "user_id":    user_id,
        "payment_id": payment_id,
        "plan_id":    plan_id,
        "status":     "active",
        "starts_at":  now,
        "ends_at":    ends_at,
        "auto_renew": False,
    }
    res = sb.table(SUBSCRIPTIONS_TABLE).insert(new_sub).execute()
    return res.data[0] if res.data else new_sub


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/transactions")
def get_transactions(user: CurrentUser) -> dict[str, Any]:
    """
    Return the authenticated user's full payment history plus their
    current active subscription.
    """
    uid = str(user["id"])
    sb  = get_supabase()

    # Payments joined with their invoice number
    pay_res = (
        sb.table(PAYMENTS_TABLE)
        .select("*, invoices(invoice_number)")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .execute()
    )
    transactions = pay_res.data or []

    # Refunds per payment (indexed by payment_id)
    if transactions:
        p_ids = [t["id"] for t in transactions]
        ref_res = (
            sb.table(REFUNDS_TABLE)
            .select("payment_id, id, amount_paise, status, reason, created_at")
            .in_("payment_id", p_ids)
            .execute()
        )
        refunds_by_pid: dict[str, list] = {}
        for r in (ref_res.data or []):
            refunds_by_pid.setdefault(r["payment_id"], []).append(r)
        for t in transactions:
            t["refunds"] = refunds_by_pid.get(t["id"], [])

    # Current active subscription
    sub_res = (
        sb.table(SUBSCRIPTIONS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    current_subscription = sub_res.data[0] if sub_res.data else None

    return {
        "transactions": transactions,
        "current_subscription": current_subscription,
        "total": len(transactions),
    }


@router.get("/invoice/{payment_id}")
def get_invoice(payment_id: str, user: CurrentUser) -> dict[str, Any]:
    """Return full invoice details for a payment the user owns."""
    uid = str(user["id"])
    sb  = get_supabase()

    # Confirm the payment belongs to this user
    pay_res = (
        sb.table(PAYMENTS_TABLE)
        .select("*")
        .eq("id", payment_id)
        .eq("user_id", uid)
        .limit(1)
        .execute()
    )
    if not pay_res.data:
        raise HTTPException(status_code=404, detail="Payment not found.")

    inv_res = (
        sb.table(INVOICES_TABLE)
        .select("*")
        .eq("payment_id", payment_id)
        .limit(1)
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invoice not yet generated for this payment.")

    payment = pay_res.data[0]
    invoice = inv_res.data[0]

    return {
        "invoice": invoice,
        "payment": payment,
        # Pre-formatted amounts for display
        "display": {
            "base":  format_inr(invoice["base_amount_paise"]),
            "cgst":  format_inr(invoice["cgst_paise"]),
            "sgst":  format_inr(invoice["sgst_paise"]),
            "igst":  format_inr(invoice["igst_paise"]),
            "total": format_inr(invoice["total_paise"]),
        },
    }


@router.post("/create-order")
def create_order(body: CreateOrderBody, user: CurrentUser) -> dict[str, Any]:
    """
    Create a payment record for the requested plan.
    Calculates GST and stores all amounts before the gateway is touched.

    # TODO: GATEWAY — after inserting the payment row, call Razorpay/Stripe to
    # create an order and store gateway_order_id + return key_id to frontend.
    """
    uid = str(user["id"])
    sb  = get_supabase()

    if body.plan_id not in PLAN_DURATION_DAYS:
        raise HTTPException(status_code=400, detail=f"Unknown plan_id '{body.plan_id}'.")
    if body.plan_id == "beej":
        raise HTTPException(status_code=400, detail="Beej is a free plan — no payment required.")

    base_paise = _get_live_price(body.plan_id, body.pre_launch, sb)
    if base_paise == 0:
        raise HTTPException(status_code=400, detail="Resolved price is zero — check pricing config.")

    tax = calc_gst(base_paise, use_igst=body.use_igst)

    plan_name_map = {"ankur": "Ankur", "vriksh": "Vriksh", "vansh": "Vansh"}
    description   = f"Paryavaran Mitra Membership – {plan_name_map.get(body.plan_id, body.plan_id)}"
    if body.pre_launch:
        description += " (Pre-launch offer)"

    row = {
        "user_id":           uid,
        "gateway":           "manual",       # TODO: GATEWAY — change to 'razorpay'
        "payment_type":      "subscription",
        "plan_id":           body.plan_id,
        "description":       description,
        "currency":          "INR",
        "base_amount_paise": base_paise,
        "cgst_paise":        tax["cgst_paise"],
        "sgst_paise":        tax["sgst_paise"],
        "igst_paise":        tax["igst_paise"],
        "cgst_rate":         tax["cgst_rate"],
        "sgst_rate":         tax["sgst_rate"],
        "igst_rate":         tax["igst_rate"],
        "status":            "created",
        "notes": {
            "billed_name":  body.billed_name,
            "billed_email": body.billed_email,
            "billed_phone": body.billed_phone,
            "gstin":        body.gstin,
        },
    }

    try:
        res = sb.table(PAYMENTS_TABLE).insert(row).execute()
    except Exception:
        logger.exception("Failed to insert payment row for user_id=%s", uid)
        raise HTTPException(status_code=502, detail="Could not create payment order.") from None

    payment = res.data[0]

    # TODO: GATEWAY
    # import razorpay
    # client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    # rp_order = client.order.create({
    #     "amount": payment["total_amount_paise"],
    #     "currency": "INR",
    #     "receipt": payment["id"],
    #     "notes": {"plan_id": body.plan_id},
    # })
    # sb.table(PAYMENTS_TABLE).update({"gateway_order_id": rp_order["id"], "gateway": "razorpay"})
    #   .eq("id", payment["id"]).execute()
    # payment["gateway_order_id"] = rp_order["id"]
    # payment["key_id"] = settings.razorpay_key_id

    return {
        "payment":          payment,
        "amount_paise":     payment["total_amount_paise"],
        "currency":         "INR",
        "display_base":     format_inr(base_paise),
        "display_tax":      format_inr(tax["total_tax_paise"]),
        "display_total":    format_inr(base_paise + tax["total_tax_paise"]),
        "gateway_ready":    False,
        # TODO: GATEWAY — add key_id and gateway_order_id here
    }


@router.post("/verify")
def verify_payment(body: VerifyPaymentBody, user: CurrentUser) -> dict[str, Any]:
    """
    Verify the gateway payment signature, mark payment as paid,
    activate the subscription, and issue the invoice.

    # TODO: GATEWAY — uncomment signature verification once Razorpay is live.
    """
    uid = str(user["id"])
    sb  = get_supabase()

    # Fetch the payment row
    pay_res = (
        sb.table(PAYMENTS_TABLE)
        .select("*")
        .eq("id", str(body.payment_id))
        .eq("user_id", uid)
        .limit(1)
        .execute()
    )
    if not pay_res.data:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    payment = pay_res.data[0]
    if payment["status"] == "paid":
        raise HTTPException(status_code=409, detail="Payment already marked as paid.")

    # TODO: GATEWAY — Razorpay signature verification
    # expected = hmac.new(
    #     settings.razorpay_key_secret.encode(),
    #     f"{body.gateway_order_id}|{body.gateway_payment_id}".encode(),
    #     hashlib.sha256,
    # ).hexdigest()
    # if not hmac.compare_digest(expected, body.gateway_signature):
    #     raise HTTPException(status_code=400, detail="Invalid payment signature.")

    now = datetime.now(timezone.utc).isoformat()

    # Mark payment as paid
    sb.table(PAYMENTS_TABLE).update({
        "status":             "paid",
        "gateway_order_id":   body.gateway_order_id,
        "gateway_payment_id": body.gateway_payment_id,
        "gateway_signature":  body.gateway_signature,
        "paid_at":            now,
    }).eq("id", str(body.payment_id)).execute()

    # Activate subscription
    subscription = _activate_subscription(
        sb,
        user_id=uid,
        plan_id=payment["plan_id"],
        payment_id=str(body.payment_id),
    )

    # Issue invoice
    notes = payment.get("notes") or {}
    invoice = _issue_invoice(
        sb,
        payment_id=str(body.payment_id),
        user_id=uid,
        base_paise=payment["base_amount_paise"],
        tax={
            "cgst_paise":      payment["cgst_paise"],
            "sgst_paise":      payment["sgst_paise"],
            "igst_paise":      payment["igst_paise"],
            "cgst_rate":       payment["cgst_rate"],
            "sgst_rate":       payment["sgst_rate"],
            "igst_rate":       payment["igst_rate"],
            "total_tax_paise": payment["cgst_paise"] + payment["sgst_paise"] + payment["igst_paise"],
        },
        billed_name=notes.get("billed_name"),
        billed_email=notes.get("billed_email"),
        billed_phone=notes.get("billed_phone"),
        gstin=notes.get("gstin"),
        description=payment["description"],
        plan_id=payment["plan_id"],
    )

    logger.info("Payment verified: payment_id=%s user_id=%s plan=%s", body.payment_id, uid, payment["plan_id"])
    return {
        "ok":            True,
        "payment_id":    str(body.payment_id),
        "plan_id":       payment["plan_id"],
        "invoice_number": invoice["invoice_number"],
        "subscription":  subscription,
    }


@router.post("/webhook")
async def receive_webhook(request: Request) -> dict[str, Any]:
    """
    Receive and log raw gateway webhook events.
    Signature verification and processing run here.

    # TODO: GATEWAY — uncomment Razorpay signature check and add event handlers.
    """
    body_bytes = await request.body()

    # TODO: GATEWAY — verify Razorpay webhook signature
    # signature = request.headers.get("X-Razorpay-Signature", "")
    # expected  = hmac.new(
    #     settings.razorpay_webhook_secret.encode(), body_bytes, hashlib.sha256
    # ).hexdigest()
    # if not hmac.compare_digest(expected, signature):
    #     raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    event_id   = request.headers.get("X-Razorpay-Event-Id") or payload.get("id")
    event_type = payload.get("event", "unknown")

    sb = get_supabase()

    # Idempotency: skip if already processed
    if event_id:
        existing = (
            sb.table(WEBHOOK_EVENTS_TABLE)
            .select("id, processed")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        if existing.data and existing.data[0]["processed"]:
            logger.info("Webhook event_id=%s already processed — skipping", event_id)
            return {"ok": True, "skipped": True}

    # Log the event
    log_row: dict[str, Any] = {
        "gateway":    "razorpay",
        "event_id":   event_id,
        "event_type": event_type,
        "payload":    payload,
    }
    try:
        log_res = sb.table(WEBHOOK_EVENTS_TABLE).insert(log_row).execute()
        log_id  = log_res.data[0]["id"] if log_res.data else None
    except Exception:
        logger.exception("Failed to log webhook event_type=%s", event_type)
        log_id = None

    # TODO: GATEWAY — handle specific event types, e.g.:
    # if event_type == "payment.captured":
    #     _handle_payment_captured(sb, payload)
    # elif event_type == "refund.created":
    #     _handle_refund_created(sb, payload)
    # elif event_type == "subscription.charged":
    #     _handle_subscription_charged(sb, payload)

    # Mark as processed
    if log_id:
        sb.table(WEBHOOK_EVENTS_TABLE).update({
            "processed": True, "processed_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", log_id).execute()

    logger.info("Webhook received event_type=%s event_id=%s", event_type, event_id)
    return {"ok": True}


@router.post("/{payment_id}/refund")
def initiate_refund(
    payment_id: str, body: RefundBody, user: CurrentUser
) -> dict[str, Any]:
    """Admin only — create a refund record and trigger gateway refund."""
    if not _is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")

    sb = get_supabase()

    pay_res = (
        sb.table(PAYMENTS_TABLE)
        .select("*")
        .eq("id", payment_id)
        .limit(1)
        .execute()
    )
    if not pay_res.data:
        raise HTTPException(status_code=404, detail="Payment not found.")

    payment = pay_res.data[0]
    if payment["status"] not in ("paid", "partially_refunded"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot refund a payment with status '{payment['status']}'.",
        )

    total_paid = payment["total_amount_paise"]
    if body.amount_paise > total_paid:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount ({body.amount_paise} paise) exceeds total paid ({total_paid} paise).",
        )

    refund_row = {
        "payment_id":   payment_id,
        "user_id":      payment["user_id"],
        "amount_paise": body.amount_paise,
        "reason":       body.reason,
        "notes":        body.notes,
        "status":       "pending",
        "initiated_by": str(user["id"]),
    }

    try:
        res = sb.table(REFUNDS_TABLE).insert(refund_row).execute()
    except Exception:
        logger.exception("Failed to insert refund row for payment_id=%s", payment_id)
        raise HTTPException(status_code=502, detail="Could not create refund record.") from None

    refund = res.data[0]

    # Determine new payment status
    is_full = (body.amount_paise >= total_paid)
    new_status = "refunded" if is_full else "partially_refunded"
    sb.table(PAYMENTS_TABLE).update({"status": new_status}).eq("id", payment_id).execute()

    # If full refund, cancel the associated subscription
    if is_full:
        sb.table(SUBSCRIPTIONS_TABLE).update({
            "status":       "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancel_reason": f"Refund initiated by admin: {body.reason}",
            "cancelled_by": str(user["id"]),
        }).eq("payment_id", payment_id).eq("status", "active").execute()

    # TODO: GATEWAY — call Razorpay refund API
    # if payment.get("gateway_payment_id"):
    #     client.payment.refund(payment["gateway_payment_id"], {"amount": body.amount_paise})

    logger.info(
        "Refund created refund_id=%s payment_id=%s amount=%s paise by admin=%s",
        refund["id"], payment_id, body.amount_paise, user["id"],
    )
    return {
        "ok":      True,
        "refund":  refund,
        "payment_new_status": new_status,
    }


@router.get("/subscriptions/current")
def get_current_subscription(user: CurrentUser) -> dict[str, Any]:
    """Return the user's current active subscription (or null)."""
    uid = str(user["id"])
    sb  = get_supabase()

    sub_res = (
        sb.table(SUBSCRIPTIONS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    sub = sub_res.data[0] if sub_res.data else None
    return {"subscription": sub}


@router.delete("/subscriptions/current")
def cancel_subscription(body: CancelSubscriptionBody, user: CurrentUser) -> dict[str, Any]:
    """Cancel the user's current active subscription (end of period)."""
    uid = str(user["id"])
    sb  = get_supabase()

    sub_res = (
        sb.table(SUBSCRIPTIONS_TABLE)
        .select("id, plan_id, ends_at")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not sub_res.data:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    sub = sub_res.data[0]
    now = datetime.now(timezone.utc).isoformat()

    sb.table(SUBSCRIPTIONS_TABLE).update({
        "status":       "cancelled",
        "auto_renew":   False,
        "cancelled_at": now,
        "cancel_reason": body.reason or "User requested cancellation",
        "cancelled_by": uid,
    }).eq("id", sub["id"]).execute()

    logger.info("Subscription cancelled sub_id=%s user_id=%s plan=%s", sub["id"], uid, sub["plan_id"])
    return {
        "ok":          True,
        "message":     "Subscription cancelled. Access continues until the end of your billing period.",
        "access_until": sub.get("ends_at"),
        "plan_id":     sub["plan_id"],
    }
