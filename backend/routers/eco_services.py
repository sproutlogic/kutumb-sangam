"""
Eco Service APIs — Tier 2 verified eco-action pipeline.

GET   /api/services/packages                  — list active packages (runtime prices)
POST  /api/services/create-order              — purchase flow → Razorpay order
GET   /api/services/orders                    — user's orders
GET   /api/services/orders/{id}               — order detail + care timeline
PATCH /api/services/orders/{id}/accept        — vendor accepts assignment
POST  /api/services/orders/{id}/proof         — vendor uploads proof (auto geofence verify)
POST  /api/services/orders/{id}/proof/review  — Paryavaran Mitra approves/rejects
GET   /api/services/vendor/dashboard          — vendor's assigned orders
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from constants import (
    GEOFENCE_RADIUS_METRES,
    NOTIFICATIONS_TABLE,
    PAYMENTS_TABLE,
    PRAKRITI_SCORES_TABLE,
    PROOF_SUBMISSIONS_TABLE,
    SERVICE_ORDERS_TABLE,
    SERVICE_PACKAGE_DEFAULT_PRICES,
    SERVICE_PACKAGES_TABLE,
    USERS_TABLE,
    VENDOR_ASSIGNMENTS_TABLE,
    VENDORS_TABLE,
    VERIFIED_ECO_ACTIONS_TABLE,
)
from db import get_supabase
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/services", tags=["eco-services"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "superadmin")


def _haversine_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two lat/lon points."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_runtime_package_prices(sb: Any) -> dict[str, int]:
    """Fetch service package price overrides from platform_config. Falls back to defaults."""
    try:
        res = (
            sb.table("platform_config")
            .select("config")
            .eq("id", "pricing")
            .limit(1)
            .execute()
        )
        if res.data:
            cfg = res.data[0]["config"]
            overrides = cfg.get("service_packages", {})
            merged = dict(SERVICE_PACKAGE_DEFAULT_PRICES)
            for pkg_id, pkg_cfg in overrides.items():
                if isinstance(pkg_cfg.get("price_paise"), int):
                    merged[pkg_id] = pkg_cfg["price_paise"]
            return merged
    except Exception:
        logger.warning("Could not fetch service package prices from platform_config — using defaults")
    return dict(SERVICE_PACKAGE_DEFAULT_PRICES)


def _get_vendor_for_user(uid: str, sb: Any) -> dict[str, Any] | None:
    res = (
        sb.table(VENDORS_TABLE)
        .select("*")
        .eq("user_id", uid)
        .eq("kyc_status", "approved")
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _get_user_vansha(uid: str, sb: Any) -> str | None:
    res = sb.table(USERS_TABLE).select("vansha_id").eq("id", uid).limit(1).execute()
    if res.data and res.data[0].get("vansha_id"):
        return str(res.data[0]["vansha_id"])
    return None


def _build_care_schedule(package_id: str, start_date: date) -> list[dict]:
    """Generate 4 quarterly care milestones for tree packages."""
    if package_id == "jala_setu":
        # Water station: 6-month and 12-month check
        return [
            {
                "month":    6,
                "due_date": (start_date + timedelta(days=180)).isoformat(),
                "status":   "pending",
                "proof_id": None,
            },
            {
                "month":    12,
                "due_date": (start_date + timedelta(days=365)).isoformat(),
                "status":   "pending",
                "proof_id": None,
            },
        ]
    return [
        {
            "month":    m,
            "due_date": (start_date + timedelta(days=m * 30)).isoformat(),
            "status":   "pending",
            "proof_id": None,
        }
        for m in (3, 6, 9, 12)
    ]


def _apply_prakriti_score(vansha_id: str, trees_delta: int, pledges_delta: int, sb: Any) -> None:
    """Increment trees_planted + pledges_completed in prakriti_scores and recompute score."""
    existing = (
        sb.table(PRAKRITI_SCORES_TABLE)
        .select("trees_planted, eco_hours, pledges_completed")
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    row = existing.data[0] if existing.data else {
        "trees_planted": 0, "eco_hours": 0.0, "pledges_completed": 0
    }
    trees   = int(row["trees_planted"]) + trees_delta
    hours   = float(row["eco_hours"])
    pledges = int(row["pledges_completed"]) + pledges_delta
    score   = round(trees * 10 + hours * 2 + pledges * 5, 2)

    sb.table(PRAKRITI_SCORES_TABLE).upsert({
        "vansha_id":         vansha_id,
        "trees_planted":     trees,
        "eco_hours":         round(hours, 4),
        "pledges_completed": pledges,
        "score":             score,
        "updated_at":        datetime.now(timezone.utc).isoformat(),
    }, on_conflict="vansha_id").execute()


def _send_notification(sb: Any, user_id: str, title: str, body: str, notif_type: str = "service") -> None:
    try:
        sb.table(NOTIFICATIONS_TABLE).insert({
            "user_id": user_id,
            "title":   title,
            "body":    body,
            "type":    notif_type,
            "read":    False,
        }).execute()
    except Exception:
        logger.exception("eco_services: failed to notify user_id=%s", user_id)


def _find_nearest_vendor(package_id: str, delivery_lat: float | None, delivery_lon: float | None, sb: Any) -> str | None:
    """Return vendor_id of nearest approved vendor that can fulfil the package."""
    can_water = (package_id == "jala_setu")
    q = sb.table(VENDORS_TABLE).select("id, service_area_lat, service_area_lon, service_radius_km").eq("kyc_status", "approved")
    if can_water:
        q = q.eq("can_water_station", True)
    else:
        q = q.eq("can_plant_trees", True)
    res = q.execute()
    vendors = res.data or []

    if not vendors:
        return None
    if delivery_lat is None or delivery_lon is None:
        return str(vendors[0]["id"])

    best_id, best_dist = None, float("inf")
    for v in vendors:
        vlat, vlon = v.get("service_area_lat"), v.get("service_area_lon")
        if vlat is None or vlon is None:
            continue
        radius_m = (v.get("service_radius_km") or 30) * 1000
        dist = _haversine_metres(delivery_lat, delivery_lon, float(vlat), float(vlon))
        if dist <= radius_m and dist < best_dist:
            best_dist = dist
            best_id   = str(v["id"])
    return best_id


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateOrderBody(BaseModel):
    package_id:            str   = Field(..., description="'taruvara'|'dashavruksha'|'jala_setu'")
    delivery_location_text: str  = Field(..., min_length=5, max_length=500)
    delivery_lat:          Optional[float] = None
    delivery_lon:          Optional[float] = None
    preferred_date:        Optional[str]   = None   # YYYY-MM-DD
    use_igst:              bool = True
    billed_name:           Optional[str]   = None
    billed_email:          Optional[str]   = None
    billed_phone:          Optional[str]   = None
    gstin:                 Optional[str]   = None


class ProofUploadBody(BaseModel):
    photo_urls:      list[str] = Field(..., min_length=1, max_length=10)
    geo_lat:         float
    geo_lon:         float
    geo_accuracy_m:  Optional[int] = None
    captured_at:     str   = Field(..., description="ISO8601 timestamp of capture")
    vendor_notes:    Optional[str] = None
    submission_type: str   = Field(default="initial",
                                   description="'initial'|'care_month_3'|'care_month_6'|'care_month_9'|'care_month_12'|'adhoc'")


class ProofReviewBody(BaseModel):
    approved:        bool
    rejection_reason: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/packages")
def list_packages() -> list[dict[str, Any]]:
    """List active service packages with runtime-overridden prices."""
    sb = get_supabase()
    res = sb.table(SERVICE_PACKAGES_TABLE).select("*").eq("is_active", True).execute()
    packages = res.data or []
    prices   = _get_runtime_package_prices(sb)

    for pkg in packages:
        pkg["price_paise"] = prices.get(pkg["id"], pkg.get("price_paise", 0))
        # Convenience display field
        pkg["price_inr"]   = round(pkg["price_paise"] / 100, 2)

    return packages


@router.post("/create-order")
def create_order(
    body: CreateOrderBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Create a service order and return a Razorpay order stub.
    Vendor assignment is triggered after payment confirmation.
    """
    uid = str(current_user["id"])
    sb  = get_supabase()

    # Validate package
    pkg_res = (
        sb.table(SERVICE_PACKAGES_TABLE)
        .select("*")
        .eq("id", body.package_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not pkg_res.data:
        raise HTTPException(status_code=404, detail="Service package not found or inactive.")
    pkg = pkg_res.data[0]

    vansha_id = _get_user_vansha(uid, sb)
    if not vansha_id:
        raise HTTPException(status_code=400, detail="User has no vansha_id. Complete onboarding first.")

    # Runtime price
    prices      = _get_runtime_package_prices(sb)
    base_paise  = prices.get(body.package_id, pkg["price_paise"])

    # GST (18% IGST)
    import math as _math
    igst_paise  = _math.ceil(base_paise * 18 / 100)
    total_paise = base_paise + igst_paise

    preferred_date = None
    if body.preferred_date:
        try:
            date.fromisoformat(body.preferred_date)
            preferred_date = body.preferred_date
        except ValueError:
            raise HTTPException(status_code=400, detail="preferred_date must be YYYY-MM-DD.")

    # Create payment record
    pay_row = {
        "user_id":           uid,
        "gateway":           "manual",
        "payment_type":      "service",
        "plan_id":           None,
        "description":       f"{pkg['name_english']} — Eco Service Package",
        "currency":          "INR",
        "base_amount_paise": base_paise,
        "cgst_paise":        0,
        "sgst_paise":        0,
        "igst_paise":        igst_paise,
        "cgst_rate":         0.0,
        "sgst_rate":         0.0,
        "igst_rate":         18.0,
        "status":            "created",
        "notes": {
            "billed_name":  body.billed_name,
            "billed_email": body.billed_email,
            "billed_phone": body.billed_phone,
            "gstin":        body.gstin,
            "package_id":   body.package_id,
        },
    }
    pay_res = sb.table(PAYMENTS_TABLE).insert(pay_row).execute()
    if not pay_res.data:
        raise HTTPException(status_code=502, detail="Could not create payment record.")
    payment = pay_res.data[0]

    # Create service order
    order_row = {
        "vansha_id":             vansha_id,
        "user_id":               uid,
        "package_id":            body.package_id,
        "payment_id":            payment["id"],
        "payment_status":        "pending",
        "delivery_location_text": body.delivery_location_text,
        "delivery_lat":          body.delivery_lat,
        "delivery_lon":          body.delivery_lon,
        "preferred_date":        preferred_date,
        "status":                "created",
        "care_schedule":         [],
    }
    order_res = sb.table(SERVICE_ORDERS_TABLE).insert(order_row).execute()
    if not order_res.data:
        raise HTTPException(status_code=502, detail="Could not create service order.")
    order = order_res.data[0]

    # TODO: GATEWAY — call Razorpay here:
    # import razorpay
    # client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    # rp_order = client.order.create({"amount": total_paise, "currency": "INR",
    #     "receipt": order["id"], "notes": {"package_id": body.package_id}})
    # sb.table(PAYMENTS_TABLE).update({"gateway_order_id": rp_order["id"], "gateway": "razorpay"})
    #   .eq("id", payment["id"]).execute()

    return {
        "ok":             True,
        "service_order_id": order["id"],
        "payment_id":     payment["id"],
        "package":        pkg,
        "base_paise":     base_paise,
        "igst_paise":     igst_paise,
        "total_paise":    total_paise,
        "display_total":  f"₹{total_paise / 100:,.2f}",
        "gateway_ready":  False,
    }


@router.get("/orders")
def list_orders(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List the authenticated user's service orders."""
    uid = str(current_user["id"])
    sb  = get_supabase()
    res = (
        sb.table(SERVICE_ORDERS_TABLE)
        .select("*, service_packages(name_sanskrit, name_english, tree_count, includes_water_station)")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/orders/{order_id}")
def get_order(
    order_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Return order detail with proof submissions and care timeline."""
    uid = str(current_user["id"])
    sb  = get_supabase()

    order_res = (
        sb.table(SERVICE_ORDERS_TABLE)
        .select("*, service_packages(*)")
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Order not found.")
    order = order_res.data[0]

    # Allow: owner, vendor assigned, admin
    is_owner  = str(order["user_id"]) == uid
    is_admin  = _is_admin(current_user)
    vendor    = _get_vendor_for_user(uid, sb) if not is_owner and not is_admin else None
    is_vendor = vendor is not None and str(order.get("vendor_id")) == str(vendor["id"])
    if not (is_owner or is_admin or is_vendor):
        raise HTTPException(status_code=403, detail="Not authorised to view this order.")

    proofs_res = (
        sb.table(PROOF_SUBMISSIONS_TABLE)
        .select("*")
        .eq("service_order_id", order_id)
        .order("created_at", desc=True)
        .execute()
    )
    order["proof_submissions"] = proofs_res.data or []
    return order


@router.patch("/orders/{order_id}/accept")
def vendor_accept_order(
    order_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Vendor accepts an assigned order → status moves to 'in_progress'."""
    uid = str(current_user["id"])
    sb  = get_supabase()

    vendor = _get_vendor_for_user(uid, sb)
    if not vendor:
        raise HTTPException(status_code=403, detail="Approved vendor account required.")

    order_res = sb.table(SERVICE_ORDERS_TABLE).select("*").eq("id", order_id).limit(1).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Order not found.")
    order = order_res.data[0]

    if str(order.get("vendor_id")) != str(vendor["id"]):
        raise HTTPException(status_code=403, detail="This order is not assigned to you.")
    if order["status"] != "assigned":
        raise HTTPException(status_code=409, detail=f"Order status is '{order['status']}' — cannot accept.")

    now = datetime.now(timezone.utc).isoformat()
    sb.table(SERVICE_ORDERS_TABLE).update({
        "status":     "in_progress",
        "updated_at": now,
    }).eq("id", order_id).execute()

    _send_notification(
        sb, str(order["user_id"]),
        "Your Eco Service Has Started",
        f"Your vendor has accepted order {order_id[:8]}… and will begin work soon.",
    )
    return {"ok": True, "order_id": order_id, "new_status": "in_progress"}


@router.post("/orders/{order_id}/proof")
def upload_proof(
    order_id: str,
    body: ProofUploadBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Vendor uploads geo-tagged proof for an order.
    Auto-verification: geo must be within 500m of delivery_lat/lon AND timestamp within 30d of assignment.
    Auto-approved → prakriti_scores updated immediately.
    Escalated → enters Paryavaran Mitra review queue.
    """
    uid = str(current_user["id"])
    sb  = get_supabase()

    vendor = _get_vendor_for_user(uid, sb)
    if not vendor:
        raise HTTPException(status_code=403, detail="Approved vendor account required.")

    order_res = sb.table(SERVICE_ORDERS_TABLE).select("*").eq("id", order_id).limit(1).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Order not found.")
    order = order_res.data[0]

    if str(order.get("vendor_id")) != str(vendor["id"]):
        raise HTTPException(status_code=403, detail="This order is not assigned to you.")
    if order["status"] not in ("in_progress", "assigned"):
        raise HTTPException(status_code=409, detail=f"Order status is '{order['status']}' — cannot upload proof.")

    # Parse capture timestamp
    try:
        captured_dt = datetime.fromisoformat(body.captured_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="captured_at must be a valid ISO8601 timestamp.")

    # Geofence check
    geo_ok = False
    if order.get("delivery_lat") and order.get("delivery_lon"):
        dist = _haversine_metres(
            body.geo_lat, body.geo_lon,
            float(order["delivery_lat"]), float(order["delivery_lon"]),
        )
        geo_ok = dist <= GEOFENCE_RADIUS_METRES
    else:
        geo_ok = True  # No delivery coords → can't verify, pass through

    # Time check: captured within 30 days of assignment
    time_ok = False
    assigned_at = order.get("assigned_at")
    if assigned_at:
        try:
            assigned_dt = datetime.fromisoformat(str(assigned_at).replace("Z", "+00:00"))
            time_ok = timedelta(0) <= (captured_dt - assigned_dt) <= timedelta(days=30)
        except Exception:
            time_ok = False
    else:
        time_ok = True  # Not assigned yet (edge case) — pass through

    auto_approved = geo_ok and time_ok
    proof_status  = "auto_approved" if auto_approved else "escalated"

    proof_row = {
        "service_order_id": order_id,
        "vendor_id":        str(vendor["id"]),
        "submission_type":  body.submission_type,
        "photo_urls":       body.photo_urls,
        "geo_lat":          body.geo_lat,
        "geo_lon":          body.geo_lon,
        "geo_accuracy_m":   body.geo_accuracy_m,
        "captured_at":      body.captured_at,
        "vendor_notes":     body.vendor_notes,
        "status":           proof_status,
        "auto_geo_ok":      geo_ok,
        "auto_time_ok":     time_ok,
    }
    proof_res = sb.table(PROOF_SUBMISSIONS_TABLE).insert(proof_row).execute()
    if not proof_res.data:
        raise HTTPException(status_code=502, detail="Failed to save proof submission.")
    proof = proof_res.data[0]

    now = datetime.now(timezone.utc).isoformat()

    if auto_approved:
        _complete_order_on_approval(order, proof["id"], sb, now)

    else:
        # Mark order as proof_submitted and notify admins for manual review
        sb.table(SERVICE_ORDERS_TABLE).update({
            "status":     "proof_submitted",
            "updated_at": now,
        }).eq("id", order_id).execute()

        # Notify admins
        admin_res = sb.table(USERS_TABLE).select("id").in_("role", ["admin", "superadmin"]).execute()
        for admin in (admin_res.data or []):
            _send_notification(
                sb, admin["id"],
                "Proof Review Required",
                f"Order {order_id[:8]}… geo-verification failed. Manual review needed in /admin/orders.",
                "proof_review",
            )

    return {
        "ok":           True,
        "proof_id":     proof["id"],
        "auto_approved": auto_approved,
        "geo_ok":       geo_ok,
        "time_ok":      time_ok,
        "status":       proof_status,
        "message": (
            "Proof auto-approved. Prakriti Score updated."
            if auto_approved else
            "Geo-verification failed. Proof sent for manual review."
        ),
    }


@router.post("/orders/{order_id}/proof/review")
def review_proof(
    order_id: str,
    body: ProofReviewBody,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Paryavaran Mitra (admin) manually approves or rejects escalated proof."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin role required.")

    uid = str(current_user["id"])
    sb  = get_supabase()

    order_res = sb.table(SERVICE_ORDERS_TABLE).select("*").eq("id", order_id).limit(1).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Order not found.")
    order = order_res.data[0]

    if order["status"] != "proof_submitted":
        raise HTTPException(status_code=409, detail=f"Order is '{order['status']}' — not awaiting review.")

    # Find the escalated proof
    proof_res = (
        sb.table(PROOF_SUBMISSIONS_TABLE)
        .select("*")
        .eq("service_order_id", order_id)
        .eq("status", "escalated")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not proof_res.data:
        raise HTTPException(status_code=404, detail="No escalated proof found for this order.")
    proof = proof_res.data[0]

    now = datetime.now(timezone.utc).isoformat()

    if body.approved:
        sb.table(PROOF_SUBMISSIONS_TABLE).update({
            "status":        "approved",
            "reviewed_by":   uid,
            "reviewed_at":   now,
        }).eq("id", proof["id"]).execute()
        _complete_order_on_approval(order, proof["id"], sb, now)
        return {"ok": True, "order_id": order_id, "result": "approved"}
    else:
        if not body.rejection_reason:
            raise HTTPException(status_code=400, detail="rejection_reason is required when rejecting.")
        sb.table(PROOF_SUBMISSIONS_TABLE).update({
            "status":        "rejected",
            "reviewed_by":   uid,
            "reviewed_at":   now,
        }).eq("id", proof["id"]).execute()
        sb.table(SERVICE_ORDERS_TABLE).update({
            "status":     "in_progress",
            "updated_at": now,
        }).eq("id", order_id).execute()

        # Notify vendor of rejection
        if order.get("vendor_id"):
            vendor_res = (
                sb.table(VENDORS_TABLE)
                .select("user_id")
                .eq("id", str(order["vendor_id"]))
                .limit(1)
                .execute()
            )
            if vendor_res.data and vendor_res.data[0].get("user_id"):
                _send_notification(
                    sb, str(vendor_res.data[0]["user_id"]),
                    "Proof Rejected — Resubmission Required",
                    f"Order {order_id[:8]}… proof was rejected: {body.rejection_reason}. Please resubmit.",
                    "proof_rejected",
                )
        return {"ok": True, "order_id": order_id, "result": "rejected", "reason": body.rejection_reason}


@router.get("/vendor/dashboard")
def vendor_dashboard(
    limit: int = Query(default=20, le=100),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the vendor's assigned orders and summary stats."""
    uid = str(current_user["id"])
    sb  = get_supabase()

    vendor = _get_vendor_for_user(uid, sb)
    if not vendor:
        raise HTTPException(status_code=403, detail="Approved vendor account required.")

    orders_res = (
        sb.table(SERVICE_ORDERS_TABLE)
        .select("*, service_packages(name_english, tree_count, includes_water_station)")
        .eq("vendor_id", str(vendor["id"]))
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    orders = orders_res.data or []

    by_status: dict[str, int] = {}
    for o in orders:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1

    return {
        "vendor":       vendor,
        "orders":       orders,
        "total":        len(orders),
        "by_status":    by_status,
    }


# ── Internal: complete order on approval ─────────────────────────────────────

def _complete_order_on_approval(order: dict[str, Any], proof_id: str, sb: Any, now: str) -> None:
    """
    Called on auto-approval or manual admin approval.
    1. Inserts verified_eco_action
    2. Updates prakriti_scores (trees + pledges)
    3. Sets care_schedule milestones
    4. Marks order as 'completed'
    5. Notifies the user
    """
    vansha_id  = order["vansha_id"]
    package_id = order["package_id"]

    # Determine tree count and pledge credit
    pkg_res = sb.table("service_packages").select("tree_count").eq("id", package_id).limit(1).execute()
    tree_count = int(pkg_res.data[0]["tree_count"]) if pkg_res.data else 0
    pledges_delta = 1  # Each completed service order counts as one pledge

    # Determine action type
    if package_id == "jala_setu":
        action_type = "water_station_installed"
    elif tree_count == 1:
        action_type = "tree_planted"
    else:
        action_type = "tree_planted"

    # Insert verified eco action
    try:
        sb.table("verified_eco_actions").insert({
            "vansha_id":        vansha_id,
            "service_order_id": order["id"],
            "vendor_id":        order.get("vendor_id"),
            "action_type":      action_type,
            "proof_timestamp":  now,
            "photo_url":        "",  # placeholder; full URLs in proof_submissions
            "status":           "auto_approved",
            "auto_check_passed": True,
            "trees_delta":      tree_count,
            "pledges_delta":    pledges_delta,
            "score_applied":    True,
        }).execute()
    except Exception:
        logger.exception("eco_services: failed to insert verified_eco_action for order %s", order["id"])

    # Update prakriti scores
    _apply_prakriti_score(vansha_id, tree_count, pledges_delta, sb)

    # Build care schedule
    care_schedule = _build_care_schedule(package_id, date.today())

    # Mark order completed
    sb.table(SERVICE_ORDERS_TABLE).update({
        "status":       "completed",
        "completed_at": now,
        "care_schedule": care_schedule,
        "updated_at":   now,
    }).eq("id", order["id"]).execute()

    # Refresh materialized view (best-effort)
    try:
        sb.rpc("refresh_family_eco_summary", {}).execute()
    except Exception:
        logger.debug("eco_services: could not refresh family_eco_summary (non-fatal)")

    # Notify user
    points = tree_count * 10 + pledges_delta * 5
    _send_notification(
        sb, str(order["user_id"]),
        "🌳 Proof of Green Legacy Received!",
        f"Your eco service is complete. +{points} Prakriti points added to your family's Green Legacy score.",
        "order_completed",
    )
