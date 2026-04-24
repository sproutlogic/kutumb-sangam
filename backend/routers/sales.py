"""
Sales dashboard APIs.

GET /api/sales/dashboard
    Returns centrally-stored payout settings plus sales rows visible to the caller.
    Visibility rule: each role can view only one level below.

PUT /api/sales/settings
    Superadmin/Admin only. Updates global pricing/commission settings.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from constants import SALES_PERFORMANCE_TABLE, SALES_SETTINGS_TABLE, SE_APPLICATIONS_TABLE, USERS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sales", tags=["sales"])

SALES_SETTINGS_ID = "global"
VISIBLE_CHILD_ROLE: dict[str, str | None] = {
    "superadmin": "np",
    "admin": "np",
    "np": "zp",
    "zp": "rp",
    "rp": "cp",
    "cp": "se",
    "se": None,
}


class SalesSettingsBody(BaseModel):
    product_price: float = Field(ge=0)
    se_direct_incentive: float = Field(ge=0)
    cp_override: float = Field(ge=0)
    rp_trade_discount: float = Field(ge=0, le=100)
    zp_trade_discount: float = Field(ge=0, le=100)
    np_trade_discount: float = Field(ge=0, le=100)


def _is_superadmin(user: dict[str, Any]) -> bool:
    return user.get("role") in ("superadmin", "admin")


def _default_settings() -> dict[str, float]:
    return {
        "product_price": 999.0,
        "se_direct_incentive": 200.0,
        "cp_override": 100.0,
        "rp_trade_discount": 35.0,
        "zp_trade_discount": 38.0,
        "np_trade_discount": 40.0,
    }


@router.get("/dashboard")
def sales_dashboard(user: CurrentUser) -> dict[str, Any]:
    role = str(user.get("role") or "user")
    visible_role = VISIBLE_CHILD_ROLE.get(role)
    sb = get_supabase()

    settings_res = sb.table(SALES_SETTINGS_TABLE).select("*").eq("id", SALES_SETTINGS_ID).limit(1).execute()
    settings_row = settings_res.data[0] if settings_res.data else {"id": SALES_SETTINGS_ID, **_default_settings()}

    visible_rows: list[dict[str, Any]] = []
    totals = {"personal_sales": 0, "team_sales": 0, "pending_support_cases": 0}
    if visible_role:
        users_res = (
            sb.table(USERS_TABLE)
            .select("id,full_name,role")
            .eq("role", visible_role)
            .order("created_at", desc=False)
            .execute()
        )
        users = users_res.data or []
        user_ids = [u["id"] for u in users]
        perf_map: dict[str, dict[str, Any]] = {}
        if user_ids:
            perf_res = (
                sb.table(SALES_PERFORMANCE_TABLE)
                .select("user_id,personal_sales,team_sales,pending_support_cases")
                .in_("user_id", user_ids)
                .execute()
            )
            perf_map = {p["user_id"]: p for p in (perf_res.data or [])}

        for u in users:
            perf = perf_map.get(u["id"]) or {}
            personal_sales = int(perf.get("personal_sales") or 0)
            team_sales = int(perf.get("team_sales") or 0)
            pending_support_cases = int(perf.get("pending_support_cases") or 0)
            visible_rows.append(
                {
                    "user_id": u["id"],
                    "name": u.get("full_name") or f"{visible_role.upper()} Member",
                    "level": visible_role,
                    "personal_sales": personal_sales,
                    "team_sales": team_sales,
                    "pending_support_cases": pending_support_cases,
                }
            )
            totals["personal_sales"] += personal_sales
            totals["team_sales"] += team_sales
            totals["pending_support_cases"] += pending_support_cases

    return {
        "my_role": role,
        "visible_role": visible_role,
        "can_edit_settings": _is_superadmin(user),
        "settings": {
            "product_price": float(settings_row.get("product_price", 999)),
            "se_direct_incentive": float(settings_row.get("se_direct_incentive", 200)),
            "cp_override": float(settings_row.get("cp_override", 100)),
            "rp_trade_discount": float(settings_row.get("rp_trade_discount", 35)),
            "zp_trade_discount": float(settings_row.get("zp_trade_discount", 38)),
            "np_trade_discount": float(settings_row.get("np_trade_discount", 40)),
        },
        "rows": visible_rows,
        "totals": totals,
    }


_RECRUITABLE_ROLES = {"se", "cp", "rp", "zp", "np", "admin", "superadmin"}


class SEApplicationBody(BaseModel):
    referral_code: str = Field(min_length=1, max_length=100)
    aadhaar_last4: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
    aadhaar_name: str = Field(min_length=2, max_length=200)
    aadhaar_dob: str = Field(min_length=8, max_length=10)   # YYYY-MM-DD
    kyc_consent: bool
    bank_account_no: str = Field(min_length=9, max_length=18)
    bank_ifsc: str = Field(min_length=11, max_length=11)
    bank_holder_name: str = Field(min_length=2, max_length=200)


@router.post("/apply-se")
def apply_se(body: SEApplicationBody, user: CurrentUser) -> dict[str, Any]:
    """Submit a Sales Executive enrollment application."""
    if not body.kyc_consent:
        raise HTTPException(status_code=400, detail="Aadhaar KYC consent is required.")

    import re
    ifsc = body.bank_ifsc.upper()
    if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc):
        raise HTTPException(status_code=422, detail="Invalid IFSC code format (e.g. SBIN0001234).")

    sb = get_supabase()

    # One application per user
    existing = (
        sb.table(SE_APPLICATIONS_TABLE)
        .select("id,status")
        .eq("user_id", str(user["id"]))
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"You already have an application with status: {existing.data[0]['status']}.",
        )

    # Validate referral code against users table (referral_code = recruiter's user_id)
    referrer_res = (
        sb.table(USERS_TABLE)
        .select("id,role")
        .eq("id", body.referral_code)
        .limit(1)
        .execute()
    )
    if not referrer_res.data:
        raise HTTPException(status_code=404, detail="Referral code not found. Ask your referrer for their Kutumb Map User ID.")
    referrer = referrer_res.data[0]
    if referrer.get("role") not in _RECRUITABLE_ROLES:
        raise HTTPException(status_code=400, detail="Referral code belongs to a non-sales member.")

    try:
        sb.table(SE_APPLICATIONS_TABLE).insert(
            {
                "user_id": str(user["id"]),
                "referral_code": body.referral_code,
                "referred_by_id": referrer["id"],
                "aadhaar_last4": body.aadhaar_last4,
                "aadhaar_name": body.aadhaar_name,
                "aadhaar_dob": body.aadhaar_dob,
                "bank_account_no": body.bank_account_no,
                "bank_ifsc": ifsc,
                "bank_holder_name": body.bank_holder_name,
            }
        ).execute()
    except Exception:
        logger.exception("Failed to insert SE application for user_id=%s", user.get("id"))
        raise HTTPException(status_code=502, detail="Could not save application. Please try again.") from None

    logger.info("SE application submitted user_id=%s referred_by=%s", user.get("id"), referrer["id"])
    return {"ok": True, "status": "pending"}


@router.get("/wallet")
def get_wallet(user: CurrentUser) -> dict[str, Any]:
    """Returns earnings wallet data for the authenticated sales member."""
    user_id = str(user["id"])
    role = str(user.get("role") or "user")
    sb = get_supabase()

    perf_res = (
        sb.table(SALES_PERFORMANCE_TABLE)
        .select("personal_sales,team_sales,pending_support_cases")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    perf = perf_res.data[0] if perf_res.data else {}

    settings_res = (
        sb.table(SALES_SETTINGS_TABLE)
        .select("se_direct_incentive,cp_override")
        .eq("id", SALES_SETTINGS_ID)
        .limit(1)
        .execute()
    )
    settings = settings_res.data[0] if settings_res.data else {}
    se_rate = float(settings.get("se_direct_incentive") or 200.0)
    cp_rate = float(settings.get("cp_override") or 100.0)

    rate_map = {"se": se_rate, "cp": cp_rate, "rp": 0.0, "zp": 0.0, "np": 0.0}
    rate = rate_map.get(role, 0.0)

    personal_sales = int(perf.get("personal_sales") or 0)
    estimated_earnings = personal_sales * rate

    app_res = (
        sb.table(SE_APPLICATIONS_TABLE)
        .select("status,created_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    application = app_res.data[0] if app_res.data else None

    return {
        "role": role,
        "referral_code": user_id,
        "personal_sales": personal_sales,
        "team_sales": int(perf.get("team_sales") or 0),
        "rate_per_sale": rate,
        "estimated_earnings": estimated_earnings,
        "application_status": application["status"] if application else None,
    }


@router.put("/settings")
def update_sales_settings(body: SalesSettingsBody, user: CurrentUser) -> dict[str, Any]:
    if not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin/Admin role required.")

    payload = {
        "id": SALES_SETTINGS_ID,
        "product_price": body.product_price,
        "se_direct_incentive": body.se_direct_incentive,
        "cp_override": body.cp_override,
        "rp_trade_discount": body.rp_trade_discount,
        "zp_trade_discount": body.zp_trade_discount,
        "np_trade_discount": body.np_trade_discount,
    }
    sb = get_supabase()
    try:
        sb.table(SALES_SETTINGS_TABLE).upsert(payload).execute()
    except Exception:
        logger.exception("Failed to upsert sales settings")
        raise HTTPException(status_code=502, detail="Failed to save sales settings.") from None

    return {"ok": True, "settings": payload}
