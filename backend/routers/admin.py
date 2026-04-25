"""
Admin APIs — superadmin-gated platform configuration.

GET  /api/admin/pricing-config
    Public (no auth required). Returns the live pricing / package config.
    Falls back to hardcoded defaults if the platform_config row doesn't exist yet.

PUT  /api/admin/pricing-config
    Superadmin / Admin only. Validates and upserts the full PricingConfig blob.
    Frontend type contract: PricingConfig in src/config/packages.config.ts
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from constants import PLATFORM_CONFIG_TABLE, PRICING_CONFIG_ID
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
