"""
Admin APIs — role-gated platform management.

Pricing config (existing):
  GET  /api/admin/pricing-config          Public — live pricing blob
  PUT  /api/admin/pricing-config          Superadmin/Admin — upsert pricing

User management (superadmin only):
  GET  /api/admin/users                   List / search users
  PUT  /api/admin/users/{user_id}/role    Change a user's role

Transactions (superadmin / finance):
  GET  /api/admin/transactions            All platform transactions, filterable by status

Payouts (superadmin / finance):
  GET  /api/admin/payouts                 Payout queue
  POST /api/admin/payouts/{id}/mark-paid  Mark a payout as paid

KYC queue (superadmin / admin / office):
  GET  /api/admin/kyc-queue               Pending KYC / SE applications
  POST /api/admin/kyc-queue/{id}/approve  Approve a KYC application
  POST /api/admin/kyc-queue/{id}/reject   Reject a KYC application

Support tickets (superadmin / admin / office):
  GET  /api/admin/support-tickets         Open support tickets
  POST /api/admin/support-tickets/{id}/close  Close a ticket
"""

from __future__ import annotations

import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from constants import (
    PAYMENTS_TABLE, PLATFORM_CONFIG_TABLE, PRICING_CONFIG_ID,
    SE_APPLICATIONS_TABLE, USERS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── Pydantic models (mirrors PricingConfig in packages.config.ts) ────────────

class EntitlementModel(BaseModel):
    culturalFields:     bool = False
    discovery:          bool = False
    connectionChains:   bool = False
    panditVerification: bool = False
    matrimony:          bool = False
    sosAlerts:          bool = False
    treeAnnounce:       bool = False


class PlanLimitsModel(BaseModel):
    """ Annual pricing + optional pre-launch offer per plan. """
    price:          float = Field(ge=0, description="Annual price in INR; 0 = free")
    preLaunchPrice: Optional[float] = Field(None, ge=0, description="Pre-launch offer price in INR")
    isPreLaunch:    bool  = Field(False, description="Whether the pre-launch offer is currently active")
    maxNodes:       int   = Field(ge=1)
    generationCap:  int   = Field(ge=1)
    entitlements:   EntitlementModel


class PlansModel(BaseModel):
    beej:   PlanLimitsModel
    ankur:  PlanLimitsModel
    vriksh: PlanLimitsModel
    vansh:  PlanLimitsModel


class MatrimonyPricesModel(BaseModel):
    compatibilityUnlock:  float = Field(ge=0)
    photoUnlock:          float = Field(ge=0)
    kundaliReview:        float = Field(ge=0)
    gotraConsultation:    float = Field(ge=0)
    fullFamilyOnboarding: float = Field(ge=0)
    secondPanditOpinion:  float = Field(ge=0)


class PanditDefaultFeesModel(BaseModel):
    kundaliMilanReview:   float = Field(ge=0)
    gotraConsultation:    float = Field(ge=0)
    fullFamilyOnboarding: float = Field(ge=0)


class PricingConfigModel(BaseModel):
    plans:          PlansModel
    matrimony:      MatrimonyPricesModel
    panditDefaults: PanditDefaultFeesModel


# ─── Hardcoded fallback (matches defaultPricingConfig in packages.config.ts) ──

_DEFAULT_CONFIG: dict[str, Any] = {
    "plans": {
        "beej": {
            "price": 0, "preLaunchPrice": None, "isPreLaunch": False,
            "maxNodes": 15, "generationCap": 3,
            "entitlements": {
                "culturalFields": False, "discovery": False, "connectionChains": False,
                "panditVerification": False, "matrimony": False, "sosAlerts": False, "treeAnnounce": False,
            },
        },
        "ankur": {
            "price": 2100, "preLaunchPrice": 999, "isPreLaunch": True,
            "maxNodes": 100, "generationCap": 7,
            "entitlements": {
                "culturalFields": True, "discovery": True, "connectionChains": False,
                "panditVerification": False, "matrimony": False, "sosAlerts": False, "treeAnnounce": False,
            },
        },
        "vriksh": {
            "price": 4900, "preLaunchPrice": None, "isPreLaunch": False,
            "maxNodes": 500, "generationCap": 15,
            "entitlements": {
                "culturalFields": True, "discovery": True, "connectionChains": True,
                "panditVerification": True, "matrimony": False, "sosAlerts": True, "treeAnnounce": False,
            },
        },
        "vansh": {
            "price": 7900, "preLaunchPrice": None, "isPreLaunch": False,
            "maxNodes": 1000, "generationCap": 25,
            "entitlements": {
                "culturalFields": True, "discovery": True, "connectionChains": True,
                "panditVerification": True, "matrimony": True, "sosAlerts": True, "treeAnnounce": True,
            },
        },
    },
    "matrimony": {
        "compatibilityUnlock": 101,
        "photoUnlock": 151,
        "kundaliReview": 501,
        "gotraConsultation": 251,
        "fullFamilyOnboarding": 2500,
        "secondPanditOpinion": 251,
    },
    "panditDefaults": {
        "kundaliMilanReview": 501,
        "gotraConsultation": 251,
        "fullFamilyOnboarding": 2500,
    },
}


def _is_superadmin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("superadmin", "admin")

def _is_finance(user: dict[str, Any]) -> bool:
    return user.get("role") in ("superadmin", "finance")

def _is_office(user: dict[str, Any]) -> bool:
    return user.get("role") in ("superadmin", "admin", "office")


def _fetch_config() -> dict[str, Any]:
    """Read the pricing row from DB. Returns the hardcoded default if absent."""
    try:
        sb = get_supabase()
        res = (
            sb.table(PLATFORM_CONFIG_TABLE)
            .select("config")
            .eq("id", PRICING_CONFIG_ID)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["config"]
    except Exception:
        logger.exception("Could not read platform_config — returning defaults")
    return _DEFAULT_CONFIG


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/pricing-config")
def get_pricing_config() -> dict[str, Any]:
    """
    Public endpoint — no auth required.
    Returns the live pricing / package config so the frontend can gate
    features and display correct prices without a code deploy.
    """
    return _fetch_config()


@router.put("/pricing-config")
def update_pricing_config(body: PricingConfigModel, user: CurrentUser) -> dict[str, Any]:
    """
    Superadmin / Admin only.
    Validates the full PricingConfig, then upserts it to platform_config.
    Changes are immediately live for all new users and transactions.
    """
    if not _is_superadmin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin or Admin role required to change pricing.",
        )

    config_dict = body.model_dump()

    try:
        sb = get_supabase()
        sb.table(PLATFORM_CONFIG_TABLE).upsert(
            {
                "id": PRICING_CONFIG_ID,
                "config": config_dict,
                "updated_by": str(user.get("id", "")),
            }
        ).execute()
    except Exception:
        logger.exception("Failed to upsert pricing config")
        raise HTTPException(status_code=502, detail="Failed to save pricing config.") from None

    logger.info("Pricing config updated by user_id=%s", user.get("id"))
    return {"ok": True, "config": config_dict}


# ─── User management ──────────────────────────────────────────────────────────

VALID_ROLES = {"user", "margdarshak", "admin", "superadmin", "office", "finance", "se", "cp", "rp", "zp", "np"}


class RoleUpdateBody(BaseModel):
    role: str = Field(..., description="New role to assign")


@router.get("/users")
def list_users(
    user: CurrentUser,
    q: Optional[str] = Query(None, description="Search by full_name or phone"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Superadmin only — list / search platform users."""
    if not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin required.")

    sb = get_supabase()
    try:
        query = sb.table(USERS_TABLE).select(
            "id, full_name, phone, role, kutumb_id, onboarding_complete, created_at",
            count="exact",
        )
        if q:
            # PostgREST OR filter for search
            query = query.or_(f"full_name.ilike.%{q}%,phone.ilike.%{q}%")
        res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        return {"items": res.data or [], "total": res.count or 0}
    except Exception:
        logger.exception("Failed to list users")
        return {"items": [], "total": 0}


@router.put("/users/{user_id}/role")
def update_user_role(user_id: str, body: RoleUpdateBody, user: CurrentUser) -> dict[str, Any]:
    """Superadmin only — change a user's role."""
    if not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin required.")
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")
    if user_id == str(user.get("id")) and body.role != "superadmin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself.")

    sb = get_supabase()
    try:
        res = sb.table(USERS_TABLE).update({"role": body.role}).eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="User not found.")
        logger.info("Role updated: user_id=%s new_role=%s by=%s", user_id, body.role, user.get("id"))
        return {"ok": True, "user_id": user_id, "role": body.role}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update role for user_id=%s", user_id)
        raise HTTPException(status_code=502, detail="Failed to update role.") from None


# ─── Transactions ─────────────────────────────────────────────────────────────

@router.get("/transactions")
def list_all_transactions(
    user: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Superadmin / Finance — all platform transactions."""
    if not _is_finance(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finance or Superadmin required.")

    sb = get_supabase()
    try:
        query = sb.table(PAYMENTS_TABLE).select(
            "id, user_id, payment_type, description, total_amount_paise, status, created_at, plan_id",
            count="exact",
        )
        if status_filter and status_filter != "all":
            query = query.eq("status", status_filter)
        tx_res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        rows: list[dict[str, Any]] = tx_res.data or []

        # Enrich with user names in a single batch query
        user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
        user_map: dict[str, Any] = {}
        if user_ids:
            u_res = sb.table(USERS_TABLE).select("id, full_name, phone").in_("id", user_ids).execute()
            for u in (u_res.data or []):
                user_map[u["id"]] = u

        for row in rows:
            u = user_map.get(row.get("user_id", ""), {})
            row["user_name"] = u.get("full_name") or u.get("phone")

        return {"items": rows, "total": tx_res.count or len(rows)}
    except Exception:
        logger.exception("Failed to list transactions")
        return {"items": [], "total": 0}


# ─── Payouts ──────────────────────────────────────────────────────────────────
# Payouts are stored in the payments table with payment_type='payout'.
# When the admin disburses a commission to a sales member, they create a
# payments row with payment_type='payout' and status='pending'/'paid'.

@router.get("/payouts")
def list_payouts(user: CurrentUser, limit: int = Query(100, ge=1, le=500)) -> dict[str, Any]:
    """Superadmin / Finance — payout queue."""
    if not _is_finance(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finance or Superadmin required.")

    sb = get_supabase()
    try:
        res = sb.table(PAYMENTS_TABLE).select(
            "id, user_id, total_amount_paise, status, payment_type, created_at, paid_at",
        ).eq("payment_type", "payout").order("created_at", desc=True).limit(limit).execute()
        rows: list[dict[str, Any]] = res.data or []

        user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
        user_map: dict[str, Any] = {}
        if user_ids:
            u_res = sb.table(USERS_TABLE).select("id, full_name, phone").in_("id", user_ids).execute()
            for u in (u_res.data or []):
                user_map[u["id"]] = u

        items = []
        for row in rows:
            u = user_map.get(row.get("user_id", ""), {})
            items.append({
                "id": row["id"],
                "user_id": row["user_id"],
                "user_name": u.get("full_name") or u.get("phone"),
                "amount_paise": row.get("total_amount_paise", 0),
                "status": row.get("status", "pending"),
                "method": "bank_transfer",
                "created_at": row.get("created_at"),
                "paid_at": row.get("paid_at"),
            })
        return {"items": items}
    except Exception:
        logger.exception("Failed to list payouts")
        return {"items": []}


@router.post("/payouts/{payout_id}/mark-paid")
def mark_payout_paid(payout_id: str, user: CurrentUser) -> dict[str, Any]:
    """Superadmin / Finance — mark a payout as paid."""
    if not _is_finance(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finance or Superadmin required.")

    from datetime import datetime, timezone
    sb = get_supabase()
    try:
        res = sb.table(PAYMENTS_TABLE).update({
            "status": "paid",
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", payout_id).eq("payment_type", "payout").execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Payout not found.")
        logger.info("Payout marked paid: id=%s by=%s", payout_id, user.get("id"))
        return {"ok": True, "payout_id": payout_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to mark payout paid: id=%s", payout_id)
        raise HTTPException(status_code=502, detail="Failed to update payout.") from None


# ─── KYC queue (SE / Margdarshak applications) ───────────────────────────────

@router.get("/kyc-queue")
def list_kyc_queue(user: CurrentUser, limit: int = Query(100, ge=1, le=500)) -> dict[str, Any]:
    """Superadmin / Admin / Office — pending KYC applications."""
    if not _is_office(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office, Admin, or Superadmin required.")

    sb = get_supabase()
    try:
        res = sb.table(SE_APPLICATIONS_TABLE).select(
            "id, user_id, status, created_at, full_name, phone, kyc_type",
        ).order("created_at", desc=True).limit(limit).execute()
        rows: list[dict[str, Any]] = res.data or []

        # Fetch user_name for rows that don't embed it
        user_ids = [r["user_id"] for r in rows if r.get("user_id") and not r.get("full_name")]
        user_map: dict[str, Any] = {}
        if user_ids:
            u_res = sb.table(USERS_TABLE).select("id, full_name, phone").in_("id", user_ids).execute()
            for u in (u_res.data or []):
                user_map[u["id"]] = u

        items = []
        for row in rows:
            u = user_map.get(row.get("user_id", ""), {})
            items.append({
                "id": row["id"],
                "user_name": row.get("full_name") or u.get("full_name"),
                "phone": row.get("phone") or u.get("phone"),
                "kyc_type": row.get("kyc_type", "se_application"),
                "status": row.get("status", "pending"),
                "submitted_at": row.get("created_at"),
            })
        return {"items": items}
    except Exception:
        logger.exception("Failed to list KYC queue")
        return {"items": []}


@router.post("/kyc-queue/{application_id}/approve")
def approve_kyc(application_id: str, user: CurrentUser) -> dict[str, Any]:
    """Superadmin / Admin / Office — approve a KYC application."""
    if not _is_office(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office, Admin, or Superadmin required.")

    sb = get_supabase()
    try:
        res = sb.table(SE_APPLICATIONS_TABLE).update({
            "status": "approved",
            "reviewed_by": str(user.get("id", "")),
        }).eq("id", application_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Application not found.")
        logger.info("KYC approved: id=%s by=%s", application_id, user.get("id"))
        return {"ok": True, "application_id": application_id, "status": "approved"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to approve KYC: id=%s", application_id)
        raise HTTPException(status_code=502, detail="Failed to approve application.") from None


@router.post("/kyc-queue/{application_id}/reject")
def reject_kyc(application_id: str, user: CurrentUser) -> dict[str, Any]:
    """Superadmin / Admin / Office — reject a KYC application."""
    if not _is_office(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office, Admin, or Superadmin required.")

    sb = get_supabase()
    try:
        res = sb.table(SE_APPLICATIONS_TABLE).update({
            "status": "rejected",
            "reviewed_by": str(user.get("id", "")),
        }).eq("id", application_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Application not found.")
        logger.info("KYC rejected: id=%s by=%s", application_id, user.get("id"))
        return {"ok": True, "application_id": application_id, "status": "rejected"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to reject KYC: id=%s", application_id)
        raise HTTPException(status_code=502, detail="Failed to reject application.") from None


# ─── Support tickets ──────────────────────────────────────────────────────────
# Uses a `support_tickets` table. Returns empty gracefully if not yet created.

SUPPORT_TICKETS_TABLE = "support_tickets"


@router.get("/support-tickets")
def list_support_tickets(
    user: CurrentUser,
    ticket_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    """Superadmin / Admin / Office — open support tickets."""
    if not _is_office(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office, Admin, or Superadmin required.")

    sb = get_supabase()
    try:
        query = sb.table(SUPPORT_TICKETS_TABLE).select(
            "id, user_id, subject, status, priority, created_at",
        )
        if ticket_status and ticket_status != "all":
            query = query.eq("status", ticket_status)
        else:
            query = query.eq("status", "open")
        res = query.order("created_at", desc=True).limit(limit).execute()
        rows: list[dict[str, Any]] = res.data or []

        user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
        user_map: dict[str, Any] = {}
        if user_ids:
            u_res = sb.table(USERS_TABLE).select("id, full_name, phone").in_("id", user_ids).execute()
            for u in (u_res.data or []):
                user_map[u["id"]] = u

        for row in rows:
            u = user_map.get(row.get("user_id", ""), {})
            row["user_name"] = u.get("full_name") or u.get("phone")

        return {"items": rows}
    except Exception:
        # Table may not exist yet — return empty gracefully
        logger.info("support_tickets table not available — returning empty list")
        return {"items": []}


@router.post("/support-tickets/{ticket_id}/close")
def close_support_ticket(ticket_id: str, user: CurrentUser) -> dict[str, Any]:
    """Superadmin / Admin / Office — close a support ticket."""
    if not _is_office(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office, Admin, or Superadmin required.")

    sb = get_supabase()
    try:
        res = sb.table(SUPPORT_TICKETS_TABLE).update({
            "status": "closed",
            "closed_by": str(user.get("id", "")),
        }).eq("id", ticket_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Ticket not found.")
        logger.info("Support ticket closed: id=%s by=%s", ticket_id, user.get("id"))
        return {"ok": True, "ticket_id": ticket_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to close ticket: id=%s", ticket_id)
        raise HTTPException(status_code=502, detail="Failed to close ticket.") from None
