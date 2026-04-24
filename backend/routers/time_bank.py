"""
Samay Bank — Kutumb Map integrated time-banking system.

Branches
  POST  /api/samay/branches/auto-join      auto-join/create the kutumb branch
  POST  /api/samay/branches                create a standalone team branch
  GET   /api/samay/branches                my branches (with my balance)
  GET   /api/samay/branches/{id}/members   member list (hides balances if private)
  PUT   /api/samay/branches/{id}/settings  manager-only settings

Marketplace
  GET   /api/samay/requests                feed: local or global, offer/need/all
  POST  /api/samay/requests                post an offer or a need
  POST  /api/samay/requests/{id}/respond   respond to a post (creates pending txn)
  POST  /api/samay/requests/{id}/assign    original poster picks a responder
  DELETE /api/samay/requests/{id}          close/cancel own post

Transactions
  GET   /api/samay/transactions            my transactions (enriched with names)
  PUT   /api/samay/transactions/{id}       helper_done | cancel | dispute

Ratings + Confirm (the "Simple Handshake")
  POST  /api/samay/transactions/{id}/rate  rate partner; auto-confirms when both rated

Profile (Kutumb ID trust card)
  GET   /api/samay/profile                 my trust card
  GET   /api/samay/profile/{user_id}       any user's public trust card

Admin / Manager
  GET   /api/samay/admin/transactions      all txns in a branch (manager only)
  PUT   /api/samay/admin/transactions/{id}/approve  manual credit release
  GET   /api/samay/admin/flagged           circular-trade flagged transactions
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from constants import (
    SAMAY_BRANCHES_TABLE, SAMAY_BRANCH_MEMBERS_TABLE,
    SAMAY_REQUESTS_TABLE, SAMAY_TRANSACTIONS_TABLE,
    SAMAY_RATINGS_TABLE, SAMAY_PROFILES_TABLE,
    USERS_TABLE,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/samay", tags=["samay_bank"])

GLOBAL_DELAY_MINUTES = 30  # anti-farming: global posts hidden for 30 min
D_SCORE_WINDOW_DAYS = 90   # diversification score rolling window

CATEGORIES = [
    "teaching", "cooking", "childcare", "eldercare",
    "repairs", "transport", "tech", "admin", "health", "general",
]


# ── Pydantic models ────────────────────────────────────────────────────────────

class AutoJoinBody(BaseModel):
    vansha_id: str
    node_id: str | None = None
    display_name: str | None = None


class CreateBranchBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    is_private_ledger: bool = False
    requires_manager_approval: bool = False
    allow_global: bool = True
    negative_limit_hours: float = Field(default=5.0, ge=0, le=100)


class BranchSettingsBody(BaseModel):
    is_private_ledger: bool | None = None
    requires_manager_approval: bool | None = None
    allow_global: bool | None = None
    negative_limit_hours: float | None = None


class CreateRequestBody(BaseModel):
    branch_id: str | None = None
    request_type: str             # 'offer' | 'need'
    scope: str = "local"          # 'local' | 'global'
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    category: str = "general"
    hours_estimate: float | None = Field(default=None, ge=0.5, le=100)


class RespondBody(BaseModel):
    hours: float = Field(ge=0.5, le=100)
    description: str | None = Field(default=None, max_length=500)


class TransactionActionBody(BaseModel):
    action: str   # 'helper_done' | 'cancel' | 'dispute'


class RateBody(BaseModel):
    quality_rating: int = Field(ge=1, le=5)
    behavior_rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _get_member(branch_id: str, user_id: str) -> dict | None:
    r = (
        _sb().table(SAMAY_BRANCH_MEMBERS_TABLE)
        .select("*").eq("branch_id", branch_id).eq("user_id", user_id)
        .limit(1).execute()
    )
    return r.data[0] if r.data else None


def _require_member(branch_id: str, user_id: str) -> dict:
    m = _get_member(branch_id, user_id)
    if not m:
        raise HTTPException(status_code=403, detail="You are not a member of this branch.")
    return m


def _get_or_create_profile(user_id: str, display_name: str | None = None, node_id: str | None = None) -> dict:
    r = _sb().table(SAMAY_PROFILES_TABLE).select("*").eq("user_id", user_id).limit(1).execute()
    if r.data:
        return r.data[0]
    res = _sb().table(SAMAY_PROFILES_TABLE).insert(
        {"user_id": user_id, "node_id": node_id, "display_name": display_name}
    ).execute()
    return res.data[0] if res.data else {"user_id": user_id}


def _enrich_with_names(rows: list[dict], id_fields: list[str]) -> list[dict]:
    """Attach full_name lookups for any user_id fields in rows."""
    if not rows:
        return rows
    uids: set[str] = set()
    for r in rows:
        for f in id_fields:
            if r.get(f):
                uids.add(r[f])
    if not uids:
        return rows
    u_res = _sb().table(USERS_TABLE).select("id,full_name").in_("id", list(uids)).execute()
    name_map = {u["id"]: u.get("full_name") or "Member" for u in (u_res.data or [])}
    for r in rows:
        for f in id_fields:
            if r.get(f):
                r[f.replace("_id", "_name")] = name_map.get(r[f], "Member")
    return rows


def _update_d_score(user_id: str) -> float:
    """D = unique_people_helped / total_completed (90-day window). Updates profile."""
    cutoff = (datetime.utcnow() - timedelta(days=D_SCORE_WINDOW_DAYS)).isoformat()
    txns = (
        _sb().table(SAMAY_TRANSACTIONS_TABLE)
        .select("requester_id")
        .eq("helper_id", user_id).eq("status", "confirmed")
        .gte("created_at", cutoff).execute()
    )
    data = txns.data or []
    total = len(data)
    unique = len({t["requester_id"] for t in data})
    d_score = round(unique / total, 4) if total else 0.0
    is_pillar = d_score >= 0.7
    _sb().table(SAMAY_PROFILES_TABLE).upsert(
        {"user_id": user_id, "d_score": d_score,
         "is_community_pillar": is_pillar, "updated_at": datetime.utcnow().isoformat()},
        on_conflict="user_id",
    ).execute()
    return d_score


def _update_rating_averages(user_id: str) -> None:
    ratings = (
        _sb().table(SAMAY_RATINGS_TABLE)
        .select("quality_rating,behavior_rating")
        .eq("to_user_id", user_id).execute()
    )
    data = ratings.data or []
    if not data:
        return
    n = len(data)
    avg_q = round(sum(r["quality_rating"]  for r in data) / n, 2)
    avg_b = round(sum(r["behavior_rating"] for r in data) / n, 2)
    _sb().table(SAMAY_PROFILES_TABLE).upsert(
        {"user_id": user_id,
         "avg_quality_rating": avg_q, "avg_behavior_rating": avg_b,
         "rating_count": n, "updated_at": datetime.utcnow().isoformat()},
        on_conflict="user_id",
    ).execute()


def _apply_credit_transfer(txn: dict) -> None:
    """
    Zero-sum local transfer or D-score boosted global credit mint.
    Must only be called once per transaction.
    """
    sb = _sb()
    hours = float(txn["hours"])
    helper_id = txn["helper_id"]
    requester_id = txn["requester_id"]
    branch_id = txn.get("branch_id")
    credit_type = txn.get("credit_type", "local")

    if credit_type == "local" and branch_id:
        branch = sb.table(SAMAY_BRANCHES_TABLE).select("negative_limit_hours").eq("id", branch_id).limit(1).execute()
        limit = float(branch.data[0]["negative_limit_hours"]) if branch.data else 5.0

        recv = _get_member(branch_id, requester_id)
        if recv:
            new_bal = float(recv["local_balance"]) - hours
            if new_bal < -limit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Receiver's balance would exceed the -{limit}h deficit limit."
                )
            sb.table(SAMAY_BRANCH_MEMBERS_TABLE).update({"local_balance": new_bal}).eq("branch_id", branch_id).eq("user_id", requester_id).execute()

        prov = _get_member(branch_id, helper_id)
        if prov:
            sb.table(SAMAY_BRANCH_MEMBERS_TABLE).update(
                {"local_balance": float(prov["local_balance"]) + hours}
            ).eq("branch_id", branch_id).eq("user_id", helper_id).execute()

    elif credit_type == "global":
        d_score = _update_d_score(helper_id)
        final_value = round(hours * (1 + d_score), 4)
        sb.table(SAMAY_TRANSACTIONS_TABLE).update({"final_value": final_value}).eq("id", txn["id"]).execute()

        # Credit helper's global profile
        hp = sb.table(SAMAY_PROFILES_TABLE).select("total_global_credits,total_verified_hours").eq("user_id", helper_id).limit(1).execute()
        if hp.data:
            h = hp.data[0]
            sb.table(SAMAY_PROFILES_TABLE).update({
                "total_global_credits":  round(float(h["total_global_credits"]) + final_value, 4),
                "total_verified_hours":  round(float(h["total_verified_hours"]) + hours, 2),
            }).eq("user_id", helper_id).execute()

        # Debit requester's global profile (base hours, not boosted)
        rp = sb.table(SAMAY_PROFILES_TABLE).select("total_global_credits").eq("user_id", requester_id).limit(1).execute()
        if rp.data:
            sb.table(SAMAY_PROFILES_TABLE).update({
                "total_global_credits": round(float(rp.data[0]["total_global_credits"]) - hours, 4),
            }).eq("user_id", requester_id).execute()

    # Update helper's verified hours for local too
    if credit_type == "local":
        hp = sb.table(SAMAY_PROFILES_TABLE).select("total_verified_hours").eq("user_id", helper_id).limit(1).execute()
        if hp.data:
            sb.table(SAMAY_PROFILES_TABLE).update({
                "total_verified_hours": round(float(hp.data[0]["total_verified_hours"]) + hours, 2),
            }).eq("user_id", helper_id).execute()


def _detect_circular_trade(helper_id: str, requester_id: str) -> bool:
    """Flag A→B→C→A patterns within 90 days (direct or triangular)."""
    cutoff = (datetime.utcnow() - timedelta(days=D_SCORE_WINDOW_DAYS)).isoformat()
    # People who recently helped helper_id (helper_id was the requester)
    received = (
        _sb().table(SAMAY_TRANSACTIONS_TABLE)
        .select("helper_id").eq("requester_id", helper_id)
        .eq("status", "confirmed").gte("created_at", cutoff).execute()
    )
    intermediaries = [t["helper_id"] for t in (received.data or [])]
    for mid in intermediaries:
        if mid == requester_id:
            return True   # direct reciprocal
        chain = (
            _sb().table(SAMAY_TRANSACTIONS_TABLE)
            .select("id").eq("helper_id", requester_id).eq("requester_id", mid)
            .eq("status", "confirmed").gte("created_at", cutoff).limit(1).execute()
        )
        if chain.data:
            return True   # triangular: requester→mid→helper
    return False


# ── Branch endpoints ───────────────────────────────────────────────────────────

@router.post("/branches/auto-join")
def auto_join_kutumb(body: AutoJoinBody, user: CurrentUser) -> dict[str, Any]:
    """Auto-join or create the kutumb branch for the given vansha_id."""
    sb = _sb()
    user_id = str(user["id"])

    branch_res = sb.table(SAMAY_BRANCHES_TABLE).select("*").eq("vansha_id", body.vansha_id).limit(1).execute()
    if branch_res.data:
        branch = branch_res.data[0]
    else:
        new_b = sb.table(SAMAY_BRANCHES_TABLE).insert({
            "name": "Kutumb Samay Bank",
            "manager_id": user_id,
            "vansha_id": body.vansha_id,
        }).execute()
        branch = new_b.data[0]

    existing = _get_member(branch["id"], user_id)
    if not existing:
        u_res = sb.table(USERS_TABLE).select("full_name").eq("id", user_id).limit(1).execute()
        dname = body.display_name or (u_res.data[0].get("full_name") if u_res.data else "Member")
        is_manager = branch["manager_id"] == user_id
        sb.table(SAMAY_BRANCH_MEMBERS_TABLE).insert({
            "branch_id": branch["id"],
            "user_id": user_id,
            "node_id": body.node_id,
            "display_name": dname,
            "role": "manager" if is_manager else "member",
        }).execute()
        existing = _get_member(branch["id"], user_id)

    profile = _get_or_create_profile(user_id, existing.get("display_name") if existing else None, body.node_id)
    return {"branch": branch, "member": existing or {}, "profile": profile}


@router.post("/branches", status_code=status.HTTP_201_CREATED)
def create_branch(body: CreateBranchBody, user: CurrentUser) -> dict[str, Any]:
    sb = _sb()
    user_id = str(user["id"])
    res = sb.table(SAMAY_BRANCHES_TABLE).insert({
        "name": body.name, "manager_id": user_id,
        "description": body.description,
        "is_private_ledger": body.is_private_ledger,
        "requires_manager_approval": body.requires_manager_approval,
        "allow_global": body.allow_global,
        "negative_limit_hours": body.negative_limit_hours,
    }).execute()
    branch = res.data[0]
    u_res = sb.table(USERS_TABLE).select("full_name").eq("id", user_id).limit(1).execute()
    dname = u_res.data[0].get("full_name") if u_res.data else "Manager"
    sb.table(SAMAY_BRANCH_MEMBERS_TABLE).insert(
        {"branch_id": branch["id"], "user_id": user_id, "display_name": dname, "role": "manager"}
    ).execute()
    _get_or_create_profile(user_id, dname)
    return branch


@router.get("/branches")
def my_branches(user: CurrentUser) -> list[dict[str, Any]]:
    sb = _sb()
    user_id = str(user["id"])
    mbr = sb.table(SAMAY_BRANCH_MEMBERS_TABLE).select("branch_id,local_balance,role").eq("user_id", user_id).execute()
    if not mbr.data:
        return []
    ids = [m["branch_id"] for m in mbr.data]
    branches = sb.table(SAMAY_BRANCHES_TABLE).select("*").in_("id", ids).execute()
    mbr_map = {m["branch_id"]: m for m in mbr.data}
    result = []
    for b in (branches.data or []):
        b["my_local_balance"] = mbr_map.get(b["id"], {}).get("local_balance", 0)
        b["my_role"] = mbr_map.get(b["id"], {}).get("role", "member")
        result.append(b)
    return result


@router.get("/branches/{branch_id}/members")
def branch_members(branch_id: str, user: CurrentUser) -> list[dict[str, Any]]:
    user_id = str(user["id"])
    _require_member(branch_id, user_id)
    sb = _sb()
    branch = sb.table(SAMAY_BRANCHES_TABLE).select("is_private_ledger,manager_id").eq("id", branch_id).limit(1).execute()
    is_private = branch.data[0]["is_private_ledger"] if branch.data else False
    is_manager = branch.data[0]["manager_id"] == user_id if branch.data else False
    res = sb.table(SAMAY_BRANCH_MEMBERS_TABLE).select("*").eq("branch_id", branch_id).order("local_balance", desc=True).execute()
    members = res.data or []
    if is_private and not is_manager:
        for m in members:
            m["local_balance"] = None   # hidden from non-managers
    return members


@router.put("/branches/{branch_id}/settings")
def update_settings(branch_id: str, body: BranchSettingsBody, user: CurrentUser) -> dict[str, Any]:
    sb = _sb()
    b = sb.table(SAMAY_BRANCHES_TABLE).select("manager_id").eq("id", branch_id).limit(1).execute()
    if not b.data or b.data[0]["manager_id"] != str(user["id"]):
        raise HTTPException(status_code=403, detail="Manager only.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = sb.table(SAMAY_BRANCHES_TABLE).update(updates).eq("id", branch_id).execute()
    return res.data[0] if res.data else {"ok": True}


# ── Marketplace endpoints ──────────────────────────────────────────────────────

@router.get("/requests")
def list_requests(
    branch_id: str | None = Query(None),
    scope: str = Query("local"),
    req_type: str = Query("all"),
    category: str = Query("all"),
    user: CurrentUser = None,
) -> list[dict[str, Any]]:
    sb = _sb()
    user_id = str(user["id"])

    if scope == "local":
        if not branch_id:
            raise HTTPException(status_code=400, detail="branch_id required for local scope.")
        _require_member(branch_id, user_id)
        q = (sb.table(SAMAY_REQUESTS_TABLE).select("*")
             .eq("branch_id", branch_id).eq("scope", "local").eq("status", "open"))
    else:  # global
        now_iso = datetime.utcnow().isoformat()
        q = (sb.table(SAMAY_REQUESTS_TABLE).select("*")
             .eq("scope", "global").eq("status", "open").lte("visible_from", now_iso))

    if req_type != "all":
        q = q.eq("request_type", req_type)
    if category != "all":
        q = q.eq("category", category)

    res = q.order("created_at", desc=True).limit(60).execute()
    rows = res.data or []
    return _enrich_with_names(rows, ["requester_id"])


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_request(body: CreateRequestBody, user: CurrentUser) -> dict[str, Any]:
    sb = _sb()
    user_id = str(user["id"])

    if body.request_type not in ("offer", "need"):
        raise HTTPException(status_code=422, detail="request_type must be 'offer' or 'need'.")
    if body.scope not in ("local", "global"):
        raise HTTPException(status_code=422, detail="scope must be 'local' or 'global'.")
    if body.branch_id:
        _require_member(body.branch_id, user_id)

    visible_from = datetime.utcnow()
    if body.scope == "global":
        visible_from = datetime.utcnow() + timedelta(minutes=GLOBAL_DELAY_MINUTES)

    res = sb.table(SAMAY_REQUESTS_TABLE).insert({
        "requester_id": user_id,
        "branch_id": body.branch_id,
        "request_type": body.request_type,
        "scope": body.scope,
        "title": body.title.strip(),
        "description": body.description,
        "category": body.category if body.category in CATEGORIES else "general",
        "hours_estimate": body.hours_estimate,
        "visible_from": visible_from.isoformat(),
    }).execute()
    if not res.data:
        raise HTTPException(status_code=502, detail="Failed to create post.")
    return res.data[0]


@router.post("/requests/{request_id}/respond", status_code=status.HTTP_201_CREATED)
def respond_to_request(request_id: str, body: RespondBody, user: CurrentUser) -> dict[str, Any]:
    """Creates a pending transaction as a response to a marketplace post."""
    sb = _sb()
    user_id = str(user["id"])

    req = sb.table(SAMAY_REQUESTS_TABLE).select("*").eq("id", request_id).limit(1).execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    r = req.data[0]
    if r["status"] != "open":
        raise HTTPException(status_code=409, detail="This post is no longer open.")
    if r["requester_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot respond to your own post.")

    # Enforce global 30-min delay
    if r["scope"] == "global":
        vf = r["visible_from"]
        if isinstance(vf, str):
            vf = datetime.fromisoformat(vf.replace("Z", "+00:00")).replace(tzinfo=None)
        if vf > datetime.utcnow():
            mins_left = int((vf - datetime.utcnow()).total_seconds() / 60) + 1
            raise HTTPException(status_code=403, detail=f"Post opens in {mins_left} min (anti-farming delay).")

    # Determine roles based on post type
    if r["request_type"] == "need":
        helper_id, requester_id = user_id, r["requester_id"]
    else:  # offer — original poster IS the helper
        helper_id, requester_id = r["requester_id"], user_id

    is_circular = _detect_circular_trade(helper_id, requester_id)
    if is_circular:
        logger.warning("Circular trade flagged: helper=%s requester=%s req=%s", helper_id, requester_id, request_id)

    branch_id = r.get("branch_id")
    requires_approval = False
    if branch_id:
        b = sb.table(SAMAY_BRANCHES_TABLE).select("requires_manager_approval").eq("id", branch_id).limit(1).execute()
        requires_approval = b.data[0]["requires_manager_approval"] if b.data else False

    res = sb.table(SAMAY_TRANSACTIONS_TABLE).insert({
        "request_id": request_id,
        "helper_id": helper_id,
        "requester_id": requester_id,
        "branch_id": branch_id,
        "hours": body.hours,
        "credit_type": "global" if r["scope"] == "global" else "local",
        "description": body.description,
        "requires_manager_approval": requires_approval,
        "is_flagged": is_circular,
        "flag_reason": "Circular trade pattern detected" if is_circular else None,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=502, detail="Failed to create transaction.")
    return res.data[0]


@router.post("/requests/{request_id}/assign")
def assign_responder(request_id: str, txn_id: str = Query(...), user: CurrentUser = None) -> dict[str, Any]:
    """Original poster accepts a specific pending response."""
    sb = _sb()
    user_id = str(user["id"])
    req = sb.table(SAMAY_REQUESTS_TABLE).select("requester_id").eq("id", request_id).limit(1).execute()
    if not req.data or req.data[0]["requester_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the original poster can assign a responder.")

    sb.table(SAMAY_TRANSACTIONS_TABLE).update({"status": "assigned"}).eq("id", txn_id).execute()
    sb.table(SAMAY_REQUESTS_TABLE).update({"status": "assigned"}).eq("id", request_id).execute()
    # Cancel all other pending responses for this post
    sb.table(SAMAY_TRANSACTIONS_TABLE).update({"status": "cancelled"}).eq("request_id", request_id).eq("status", "pending").neq("id", txn_id).execute()

    updated = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    return updated.data[0] if updated.data else {"ok": True}


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def close_request(request_id: str, user: CurrentUser) -> None:
    sb = _sb()
    req = sb.table(SAMAY_REQUESTS_TABLE).select("requester_id,branch_id").eq("id", request_id).limit(1).execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    r = req.data[0]
    is_creator = r["requester_id"] == str(user["id"])
    is_manager = False
    if r.get("branch_id"):
        b = sb.table(SAMAY_BRANCHES_TABLE).select("manager_id").eq("id", r["branch_id"]).limit(1).execute()
        is_manager = b.data[0]["manager_id"] == str(user["id"]) if b.data else False
    if not (is_creator or is_manager):
        raise HTTPException(status_code=403, detail="Not authorized.")
    sb.table(SAMAY_REQUESTS_TABLE).update({"status": "closed"}).eq("id", request_id).execute()


# ── Transaction endpoints ──────────────────────────────────────────────────────

@router.get("/transactions")
def my_transactions(
    branch_id: str | None = Query(None),
    user: CurrentUser = None,
) -> list[dict[str, Any]]:
    sb = _sb()
    user_id = str(user["id"])
    q = (sb.table(SAMAY_TRANSACTIONS_TABLE).select("*")
         .or_(f"helper_id.eq.{user_id},requester_id.eq.{user_id}"))
    if branch_id:
        q = q.eq("branch_id", branch_id)
    res = q.order("created_at", desc=True).limit(100).execute()
    return _enrich_with_names(res.data or [], ["helper_id", "requester_id"])


@router.put("/transactions/{txn_id}")
def update_transaction(txn_id: str, body: TransactionActionBody, user: CurrentUser) -> dict[str, Any]:
    sb = _sb()
    user_id = str(user["id"])
    txn = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    if not txn.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    t = txn.data[0]
    if user_id not in (t["helper_id"], t["requester_id"]):
        raise HTTPException(status_code=403, detail="Not your transaction.")

    if body.action == "helper_done":
        if user_id != t["helper_id"]:
            raise HTTPException(status_code=403, detail="Only the helper can mark work as done.")
        if t["status"] not in ("pending", "assigned"):
            raise HTTPException(status_code=400, detail="Already progressed past this state.")
        sb.table(SAMAY_TRANSACTIONS_TABLE).update({
            "status": "helper_done",
            "helper_confirmed_at": datetime.utcnow().isoformat(),
        }).eq("id", txn_id).execute()

    elif body.action == "cancel":
        if t["status"] == "confirmed":
            raise HTTPException(status_code=400, detail="Cannot cancel a confirmed transaction.")
        sb.table(SAMAY_TRANSACTIONS_TABLE).update({"status": "cancelled"}).eq("id", txn_id).execute()
        if t.get("request_id"):
            sb.table(SAMAY_REQUESTS_TABLE).update({"status": "open", "helper_id": None}).eq("id", t["request_id"]).execute()

    elif body.action == "dispute":
        if t["status"] != "helper_done":
            raise HTTPException(status_code=400, detail="Can only dispute after helper marks done.")
        if user_id != t["requester_id"]:
            raise HTTPException(status_code=403, detail="Only the requester can raise a dispute.")
        sb.table(SAMAY_TRANSACTIONS_TABLE).update({"status": "disputed"}).eq("id", txn_id).execute()

    else:
        raise HTTPException(status_code=422, detail="action must be helper_done, cancel, or dispute.")

    updated = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    return updated.data[0] if updated.data else {"ok": True}


@router.post("/transactions/{txn_id}/rate")
def rate_and_confirm(txn_id: str, body: RateBody, user: CurrentUser) -> dict[str, Any]:
    """
    Submit a quality+behaviour rating for your partner.
    When BOTH parties have rated, credits transfer automatically
    (or pend manager approval if required).
    """
    sb = _sb()
    user_id = str(user["id"])

    txn = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    if not txn.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    t = txn.data[0]
    if t["status"] not in ("helper_done",):
        raise HTTPException(status_code=400, detail="Transaction must be in 'helper_done' state to rate.")
    if user_id not in (t["helper_id"], t["requester_id"]):
        raise HTTPException(status_code=403, detail="Not your transaction.")

    # Prevent self-rating and duplicate ratings
    ratee_id = t["requester_id"] if user_id == t["helper_id"] else t["helper_id"]
    dup = sb.table(SAMAY_RATINGS_TABLE).select("id").eq("transaction_id", txn_id).eq("from_user_id", user_id).limit(1).execute()
    if dup.data:
        raise HTTPException(status_code=409, detail="You have already rated this transaction.")

    sb.table(SAMAY_RATINGS_TABLE).insert({
        "transaction_id": txn_id,
        "from_user_id": user_id,
        "to_user_id": ratee_id,
        "quality_rating": body.quality_rating,
        "behavior_rating": body.behavior_rating,
        "comment": body.comment,
    }).execute()
    _update_rating_averages(ratee_id)

    # Check if BOTH parties have now rated
    all_ratings = sb.table(SAMAY_RATINGS_TABLE).select("from_user_id").eq("transaction_id", txn_id).execute()
    raters = {r["from_user_id"] for r in (all_ratings.data or [])}
    both_rated = t["helper_id"] in raters and t["requester_id"] in raters

    if both_rated:
        if t.get("requires_manager_approval") and not t.get("manager_approved"):
            # Credits stay pending until manager approves
            logger.info("Transaction %s awaiting manager approval", txn_id)
        else:
            _apply_credit_transfer(t)
            sb.table(SAMAY_TRANSACTIONS_TABLE).update({
                "status": "confirmed",
                "requester_confirmed_at": datetime.utcnow().isoformat(),
            }).eq("id", txn_id).execute()
            if t.get("request_id"):
                sb.table(SAMAY_REQUESTS_TABLE).update({"status": "completed"}).eq("id", t["request_id"]).execute()

    updated = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    result = updated.data[0] if updated.data else {"id": txn_id}
    result["both_rated"] = both_rated
    return result


# ── Profile endpoints ──────────────────────────────────────────────────────────

@router.get("/profile")
def my_profile(user: CurrentUser) -> dict[str, Any]:
    return _get_or_create_profile(str(user["id"]))


@router.get("/profile/{uid}")
def public_profile(uid: str, user: CurrentUser) -> dict[str, Any]:
    r = _sb().table(SAMAY_PROFILES_TABLE).select("*").eq("user_id", uid).limit(1).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return r.data[0]


# ── Admin / Manager endpoints ──────────────────────────────────────────────────

def _assert_manager(branch_id: str, user_id: str) -> None:
    b = _sb().table(SAMAY_BRANCHES_TABLE).select("manager_id").eq("id", branch_id).limit(1).execute()
    if not b.data or b.data[0]["manager_id"] != user_id:
        raise HTTPException(status_code=403, detail="Manager only.")


@router.get("/admin/transactions")
def admin_all_transactions(branch_id: str = Query(...), user: CurrentUser = None) -> list[dict[str, Any]]:
    _assert_manager(branch_id, str(user["id"]))
    res = (_sb().table(SAMAY_TRANSACTIONS_TABLE).select("*")
           .eq("branch_id", branch_id).order("created_at", desc=True).execute())
    return _enrich_with_names(res.data or [], ["helper_id", "requester_id"])


@router.put("/admin/transactions/{txn_id}/approve")
def manager_approve(txn_id: str, user: CurrentUser) -> dict[str, Any]:
    sb = _sb()
    txn = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    if not txn.data:
        raise HTTPException(status_code=404, detail="Not found.")
    t = txn.data[0]
    if not t.get("branch_id"):
        raise HTTPException(status_code=400, detail="No branch associated.")
    _assert_manager(t["branch_id"], str(user["id"]))
    _apply_credit_transfer(t)
    sb.table(SAMAY_TRANSACTIONS_TABLE).update({
        "status": "confirmed", "manager_approved": True,
        "manager_approved_at": datetime.utcnow().isoformat(),
    }).eq("id", txn_id).execute()
    if t.get("request_id"):
        sb.table(SAMAY_REQUESTS_TABLE).update({"status": "completed"}).eq("id", t["request_id"]).execute()
    updated = sb.table(SAMAY_TRANSACTIONS_TABLE).select("*").eq("id", txn_id).limit(1).execute()
    return updated.data[0] if updated.data else {"ok": True}


@router.get("/admin/flagged")
def flagged_trades(branch_id: str = Query(...), user: CurrentUser = None) -> list[dict[str, Any]]:
    _assert_manager(branch_id, str(user["id"]))
    res = (_sb().table(SAMAY_TRANSACTIONS_TABLE).select("*")
           .eq("branch_id", branch_id).eq("is_flagged", True).order("created_at", desc=True).execute())
    return _enrich_with_names(res.data or [], ["helper_id", "requester_id"])
