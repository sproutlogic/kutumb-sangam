"""
MFA approval APIs for SE onboarding and transactions.

Onboarding (3 steps):
  Step 1 — office:     POST /api/approval/onboarding/{id}/step/1
  Step 2 — finance:    POST /api/approval/onboarding/{id}/step/2
  Step 3 — admin:      POST /api/approval/onboarding/{id}/step/3  (releases SE role)

Transaction payin/payout (4 steps):
  Step 1 — office:     POST /api/approval/transaction/{id}/step/1
  Step 2 — finance:    POST /api/approval/transaction/{id}/step/2
  Step 3 — admin:      POST /api/approval/transaction/{id}/step/3
  Step 4 — superadmin: POST /api/approval/transaction/{id}/step/4  (releases funds)

GET /api/approval/onboarding          — list SE applications with approval state
GET /api/approval/transactions        — list transactions with approval state
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from constants import (
    ONBOARDING_APPROVALS_TABLE,
    SE_APPLICATIONS_TABLE,
    TRANSACTION_APPROVALS_TABLE,
    TRANSACTIONS_TABLE,
    USERS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/approval", tags=["approval"])

# Maps each step number to the role that must perform it
ONBOARDING_STEP_ROLE: dict[int, str] = {1: "office", 2: "finance", 3: "admin"}
TRANSACTION_STEP_ROLE: dict[int, str] = {1: "office", 2: "finance", 3: "admin", 4: "superadmin"}

# Status written to the parent table when a step is approved
ONBOARDING_STEP_STATUS: dict[int, str] = {
    1: "office_approved",
    2: "finance_approved",
    3: "approved",        # final — triggers role promotion to 'se'
}
TRANSACTION_STEP_STATUS: dict[int, str] = {
    1: "office_approved",
    2: "finance_approved",
    3: "admin_approved",
    4: "released",        # final — funds released
}


class ApprovalBody(BaseModel):
    action: str          # "approved" | "rejected"
    notes: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _assert_role(user: dict[str, Any], required: str) -> None:
    role = user.get("role", "")
    # superadmin can act as any role
    if role != required and role != "superadmin":
        raise HTTPException(status_code=403, detail=f"Role '{required}' required for this step.")


def _assert_action(action: str) -> None:
    if action not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="action must be 'approved' or 'rejected'.")


# ── Onboarding approvals ───────────────────────────────────────────────────────

@router.get("/onboarding")
def list_onboarding(user: CurrentUser) -> list[dict[str, Any]]:
    if user.get("role") not in ("office", "finance", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorised.")
    sb = get_supabase()
    apps = sb.table(SE_APPLICATIONS_TABLE).select("*").order("created_at", desc=True).execute()
    if not apps.data:
        return []
    app_ids = [a["id"] for a in apps.data]
    steps_res = (
        sb.table(ONBOARDING_APPROVALS_TABLE)
        .select("*")
        .in_("application_id", app_ids)
        .execute()
    )
    steps_by_app: dict[str, list[dict]] = {}
    for s in (steps_res.data or []):
        steps_by_app.setdefault(s["application_id"], []).append(s)
    return [{"application": a, "approval_steps": steps_by_app.get(a["id"], [])} for a in apps.data]


@router.post("/onboarding/{application_id}/step/{step}")
def approve_onboarding_step(
    application_id: str,
    step: int,
    body: ApprovalBody,
    user: CurrentUser,
) -> dict[str, Any]:
    if step not in ONBOARDING_STEP_ROLE:
        raise HTTPException(status_code=400, detail="step must be 1, 2, or 3.")
    _assert_action(body.action)
    required_role = ONBOARDING_STEP_ROLE[step]
    _assert_role(user, required_role)

    sb = get_supabase()

    # Verify application exists
    app_res = sb.table(SE_APPLICATIONS_TABLE).select("id,status,user_id").eq("id", application_id).limit(1).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Application not found.")
    app = app_res.data[0]
    if app["status"] in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail=f"Application already resolved: {app['status']}.")

    # Verify previous step is approved (unless step 1)
    if step > 1:
        prev_res = (
            sb.table(ONBOARDING_APPROVALS_TABLE)
            .select("status")
            .eq("application_id", application_id)
            .eq("step", step - 1)
            .limit(1)
            .execute()
        )
        if not prev_res.data or prev_res.data[0]["status"] != "approved":
            raise HTTPException(status_code=409, detail=f"Step {step - 1} must be approved first.")

    now = _now()
    # Upsert this step's approval row
    sb.table(ONBOARDING_APPROVALS_TABLE).upsert({
        "id": str(uuid.uuid4()),
        "application_id": application_id,
        "step": step,
        "step_role": required_role,
        "status": body.action,
        "reviewed_by": str(user["id"]),
        "reviewed_at": now,
        "notes": body.notes,
    }, on_conflict="application_id,step").execute()

    # Update parent application status
    parent_status = ONBOARDING_STEP_STATUS[step] if body.action == "approved" else "rejected"
    sb.table(SE_APPLICATIONS_TABLE).update({"status": parent_status}).eq("id", application_id).execute()

    # On final approval, promote user to SE role
    if body.action == "approved" and step == 3:
        sb.table(USERS_TABLE).update({"role": "se"}).eq("id", app["user_id"]).execute()

    return {"ok": True, "step": step, "action": body.action, "application_id": application_id}


# ── Transaction approvals ──────────────────────────────────────────────────────

@router.get("/transactions")
def list_transactions(user: CurrentUser) -> list[dict[str, Any]]:
    if user.get("role") not in ("office", "finance", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorised.")
    sb = get_supabase()
    txns = sb.table(TRANSACTIONS_TABLE).select("*").order("created_at", desc=True).execute()
    if not txns.data:
        return []
    txn_ids = [t["id"] for t in txns.data]
    steps_res = (
        sb.table(TRANSACTION_APPROVALS_TABLE)
        .select("*")
        .in_("transaction_id", txn_ids)
        .execute()
    )
    steps_by_txn: dict[str, list[dict]] = {}
    for s in (steps_res.data or []):
        steps_by_txn.setdefault(s["transaction_id"], []).append(s)
    return [{"transaction": t, "approval_steps": steps_by_txn.get(t["id"], [])} for t in txns.data]


@router.post("/transaction/{transaction_id}/step/{step}")
def approve_transaction_step(
    transaction_id: str,
    step: int,
    body: ApprovalBody,
    user: CurrentUser,
) -> dict[str, Any]:
    if step not in TRANSACTION_STEP_ROLE:
        raise HTTPException(status_code=400, detail="step must be 1, 2, 3, or 4.")
    _assert_action(body.action)
    required_role = TRANSACTION_STEP_ROLE[step]
    _assert_role(user, required_role)

    sb = get_supabase()

    txn_res = sb.table(TRANSACTIONS_TABLE).select("id,status").eq("id", transaction_id).limit(1).execute()
    if not txn_res.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    txn = txn_res.data[0]
    if txn["status"] in ("released", "rejected"):
        raise HTTPException(status_code=409, detail=f"Transaction already resolved: {txn['status']}.")

    if step > 1:
        prev_res = (
            sb.table(TRANSACTION_APPROVALS_TABLE)
            .select("status")
            .eq("transaction_id", transaction_id)
            .eq("step", step - 1)
            .limit(1)
            .execute()
        )
        if not prev_res.data or prev_res.data[0]["status"] != "approved":
            raise HTTPException(status_code=409, detail=f"Step {step - 1} must be approved first.")

    now = _now()
    sb.table(TRANSACTION_APPROVALS_TABLE).upsert({
        "id": str(uuid.uuid4()),
        "transaction_id": transaction_id,
        "step": step,
        "step_role": required_role,
        "status": body.action,
        "reviewed_by": str(user["id"]),
        "reviewed_at": now,
        "notes": body.notes,
    }, on_conflict="transaction_id,step").execute()

    parent_status = TRANSACTION_STEP_STATUS[step] if body.action == "approved" else "rejected"
    sb.table(TRANSACTIONS_TABLE).update({"status": parent_status}).eq("id", transaction_id).execute()

    return {"ok": True, "step": step, "action": body.action, "transaction_id": transaction_id}
