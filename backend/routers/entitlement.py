"""
Tree entitlement resolution & visibility API.

Endpoints:
  GET  /api/entitlement/me                   Resolved limits + features for current user.
  GET  /api/entitlement/tree/{vansha_id}     Visible nodes + locked boundary for current user.
  POST /api/entitlement/share                Grant partial view to a connected node.
  DELETE /api/entitlement/share/{share_id}   Revoke a granted share.
  GET  /api/entitlement/shares/given         Shares I have granted.
  GET  /api/entitlement/shares/received      Shares I have received.

The resolver runs the 8-step pipeline from ENTITLEMENT_SYSTEM.md:
  1. Admin override (subscription_events admin_override)
  2. Base plan (active user_subscriptions + tree_plans)
  3. Generation topups (sum of valid gen_topups)
  4. Referral unlocks (referral_unlocks row)
  5. Locate ego node (persons.owner_id = user.id)
  6. Compute visible node set (gen window + sachets + shares)
  7. Boundary nodes for ghost rendering (no PII)
  8. Cache to user_visible_nodes (fire-and-forget)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from constants import (
    ENTITLEMENT_SHARES_TABLE,
    GEN_TOPUPS_TABLE,
    NODE_UNLOCKS_TABLE,
    PERSONS_TABLE,
    REFERRAL_UNLOCKS_TABLE,
    SUBSCRIPTION_EVENTS_TABLE,
    TREE_PLANS_TABLE,
    USER_SUBSCRIPTIONS_TABLE,
    USER_VISIBLE_NODES_TABLE,
    VANSHA_ID_COLUMN,
)
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/entitlement", tags=["entitlement"])


# ─── Pydantic models ─────────────────────────────────────────────────────────

class EntitlementResponse(BaseModel):
    plan: str
    plan_display_name: str
    gen_up: int
    gen_down: int
    max_nodes: int
    features: dict[str, bool]
    status: str
    valid_until: Optional[datetime] = None
    referral_bonus_up: int = 0
    referral_bonus_down: int = 0
    topup_bonus_up: int = 0
    topup_bonus_down: int = 0
    has_admin_override: bool = False
    sachet_unlock_count: int = 0


class ShareCreate(BaseModel):
    grantee_node_id: UUID
    shared_gen_up: int = Field(ge=0, le=5, default=1)
    shared_gen_down: int = Field(ge=0, le=5, default=1)
    valid_until: Optional[datetime] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

FREE_PLAN_FALLBACK = {
    "name": "free",
    "display_name": "Free",
    "gen_up": 1,
    "gen_down": 1,
    "max_intentional_nodes": 21,
    "features": {
        "pdf_export": False,
        "matrimony_matching": False,
        "bridge_tree": False,
        "bulk_import": False,
        "api_access": False,
    },
}


def _str_id(v: Any) -> str:
    return str(v) if v is not None else ""


def _resolve_active_plan(sb, user_id: str) -> dict[str, Any]:
    """Find active subscription, join with plan. Fallback to free if none."""
    sub = (
        sb.table(USER_SUBSCRIPTIONS_TABLE)
        .select("*, tree_plans(*)")
        .eq("user_id", user_id)
        .in_("status", ["trial", "active", "grace_period"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if sub.data and sub.data[0].get("tree_plans"):
        return {
            "subscription": sub.data[0],
            "plan": sub.data[0]["tree_plans"],
        }
    # Fallback: load free plan from DB
    free = (
        sb.table(TREE_PLANS_TABLE)
        .select("*")
        .eq("name", "free")
        .limit(1)
        .execute()
    )
    plan = free.data[0] if free.data else FREE_PLAN_FALLBACK
    return {"subscription": None, "plan": plan}


def _resolve_admin_override(sb, user_id: str) -> Optional[dict[str, Any]]:
    """Latest admin_override event metadata (if any)."""
    try:
        res = (
            sb.table(SUBSCRIPTION_EVENTS_TABLE)
            .select("metadata, created_at")
            .eq("user_id", user_id)
            .eq("event_type", "admin_override")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0].get("metadata") or {}
    except Exception:
        logger.warning("subscription_events query failed — skipping admin override", exc_info=True)
    return None


def _sum_active_topups(sb, user_id: str) -> tuple[int, int]:
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = (
            sb.table(GEN_TOPUPS_TABLE)
            .select("extra_gen_up, extra_gen_down, valid_until")
            .eq("user_id", user_id)
            .gt("valid_until", now_iso)
            .execute()
        )
        rows = res.data or []
        return (
            sum(int(r.get("extra_gen_up") or 0) for r in rows),
            sum(int(r.get("extra_gen_down") or 0) for r in rows),
        )
    except Exception:
        logger.warning("gen_topups query failed — returning zero bonus", exc_info=True)
        return (0, 0)


def _referral_bonus(sb, user_id: str) -> tuple[int, int]:
    try:
        res = (
            sb.table(REFERRAL_UNLOCKS_TABLE)
            .select("extra_gen_up, extra_gen_down")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return (
                int(res.data[0].get("extra_gen_up") or 0),
                int(res.data[0].get("extra_gen_down") or 0),
            )
    except Exception:
        logger.warning("referral_unlocks query failed — returning zero bonus", exc_info=True)
    return (0, 0)


def _sachet_unlocks(sb, user_id: str) -> list[str]:
    try:
        res = (
            sb.table(NODE_UNLOCKS_TABLE)
            .select("node_id")
            .eq("user_id", user_id)
            .execute()
        )
        return [_str_id(r["node_id"]) for r in (res.data or [])]
    except Exception:
        logger.warning("node_unlocks query failed — returning empty list", exc_info=True)
        return []


def _ego_node(sb, user_id: str, vansha_id: str) -> Optional[dict[str, Any]]:
    res = (
        sb.table(PERSONS_TABLE)
        .select("node_id, generation, vansha_id, owner_id")
        .eq("owner_id", user_id)
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _shared_nodes_received(sb, user_id: str) -> list[dict[str, Any]]:
    """Active shares pointing to this user."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = (
            sb.table(ENTITLEMENT_SHARES_TABLE)
            .select("*")
            .eq("grantee_user_id", user_id)
            .is_("revoked_at", "null")
            .or_(f"valid_until.is.null,valid_until.gt.{now_iso}")
            .execute()
        )
        return res.data or []
    except Exception:
        logger.warning("entitlement_shares query failed — returning empty", exc_info=True)
        return []


def _resolve_entitlement(sb, user_id: str) -> dict[str, Any]:
    """Run the 8-step entitlement pipeline. Returns resolved limits."""
    base = _resolve_active_plan(sb, user_id)
    plan = base["plan"]
    sub  = base["subscription"]

    base_up   = int(plan.get("gen_up") or 1)
    base_down = int(plan.get("gen_down") or 1)
    max_nodes = int(plan.get("max_intentional_nodes") or 21)
    features  = plan.get("features") or {}

    topup_up, topup_down = _sum_active_topups(sb, user_id)
    ref_up,   ref_down   = _referral_bonus(sb, user_id)
    override = _resolve_admin_override(sb, user_id)

    if override and override.get("active") is not False:
        base_up   = int(override.get("gen_up", base_up))
        base_down = int(override.get("gen_down", base_down))
        if "max_nodes" in override:
            max_nodes = int(override["max_nodes"])

    total_up   = base_up + topup_up + ref_up
    total_down = base_down + topup_down + ref_down

    return {
        "plan_name":       plan.get("name", "free"),
        "plan_display":    plan.get("display_name", "Free"),
        "gen_up":          total_up,
        "gen_down":        total_down,
        "base_gen_up":     base_up,
        "base_gen_down":   base_down,
        "topup_up":        topup_up,
        "topup_down":      topup_down,
        "ref_up":          ref_up,
        "ref_down":        ref_down,
        "max_nodes":       max_nodes,
        "features":        features,
        "status":          (sub.get("status") if sub else "active"),
        "valid_until":     (sub.get("valid_until") if sub else None),
        "has_override":    bool(override),
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/me")
def get_my_entitlement(user: CurrentUser) -> EntitlementResponse:
    """Return resolved limits + features for the current user."""
    uid = _str_id(user["id"])
    sb  = get_supabase()
    e   = _resolve_entitlement(sb, uid)
    sachets = _sachet_unlocks(sb, uid)

    return EntitlementResponse(
        plan=e["plan_name"],
        plan_display_name=e["plan_display"],
        gen_up=e["gen_up"],
        gen_down=e["gen_down"],
        max_nodes=e["max_nodes"],
        features=e["features"],
        status=e["status"],
        valid_until=e["valid_until"],
        referral_bonus_up=e["ref_up"],
        referral_bonus_down=e["ref_down"],
        topup_bonus_up=e["topup_up"],
        topup_bonus_down=e["topup_down"],
        has_admin_override=e["has_override"],
        sachet_unlock_count=len(sachets),
    )


@router.get("/tree/{vansha_id}")
def get_visible_tree(vansha_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """
    Return the entitled tree window for the current user in this vansha.

    Response shape:
      {
        entitlement: { ... resolved limits ... },
        ego: { node_id, generation } | null,
        persons: [...],            # within window + sachet unlocks + shares
        unions: [...],
        relationships: [...],
        locked_boundary: [{node_id, generation, locked_count}]  # no PII
      }
    """
    uid       = _str_id(user["id"])
    vansha_id = _str_id(vansha_id)
    sb        = get_supabase()

    e = _resolve_entitlement(sb, uid)
    ego = _ego_node(sb, uid, vansha_id)

    if not ego:
        # No claimed node — return the full vansha without a generation window
        all_persons_res = (
            sb.table(PERSONS_TABLE)
            .select("*")
            .eq(VANSHA_ID_COLUMN, vansha_id)
            .execute()
        )
        all_persons = all_persons_res.data or []
        all_ids = [_str_id(p["node_id"]) for p in all_persons]
        rels_res = (
            sb.table("relationships")
            .select("*")
            .eq(VANSHA_ID_COLUMN, vansha_id)
            .in_("from_node_id", all_ids)
            .execute()
        ) if all_ids else type("_", (), {"data": []})()
        rels = [r for r in (rels_res.data or []) if _str_id(r.get("to_node_id")) in set(all_ids)]
        unions_res = (
            sb.table("unions")
            .select("*")
            .eq(VANSHA_ID_COLUMN, vansha_id)
            .execute()
        )
        return {
            "entitlement":       e,
            "ego":               None,
            "persons":           all_persons,
            "unions":            unions_res.data or [],
            "relationships":     rels,
            "locked_boundary":   [],
            "onboarding_required": False,
        }

    ego_gen      = int(ego.get("generation") or 0)
    gen_low      = ego_gen - e["gen_up"]
    gen_high     = ego_gen + e["gen_down"]

    # Fetch persons in vansha within visible gen range
    persons_res = (
        sb.table(PERSONS_TABLE)
        .select("*")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .gte("generation", gen_low)
        .lte("generation", gen_high)
        .execute()
    )
    in_window = persons_res.data or []

    # Cap at max_nodes (exclude placeholders from count if column exists)
    if e["max_nodes"] and e["max_nodes"] < 999999:
        non_placeholder = [p for p in in_window if not p.get("is_placeholder")]
        if len(non_placeholder) > e["max_nodes"]:
            in_window = non_placeholder[: e["max_nodes"]]

    in_window_ids = {_str_id(p["node_id"]) for p in in_window}

    # Add sachet unlocks (ignore gen range)
    sachet_ids = set(_sachet_unlocks(sb, uid))
    extra_ids  = sachet_ids - in_window_ids
    if extra_ids:
        extra_res = (
            sb.table(PERSONS_TABLE)
            .select("*")
            .in_("node_id", list(extra_ids))
            .eq(VANSHA_ID_COLUMN, vansha_id)
            .execute()
        )
        in_window.extend(extra_res.data or [])
        in_window_ids |= {_str_id(p["node_id"]) for p in (extra_res.data or [])}

    # Add shared nodes (received shares — within granter's window)
    shares = _shared_nodes_received(sb, uid)
    for s in shares:
        share_root = _str_id(s.get("granter_node_id"))
        if not share_root or share_root in in_window_ids:
            continue
        # Pull the granter root + their window (best effort — no recursion)
        sg = sb.table(PERSONS_TABLE).select("*").eq("node_id", share_root).limit(1).execute()
        if sg.data:
            row = sg.data[0]
            if _str_id(row.get(VANSHA_ID_COLUMN)) == vansha_id:
                in_window.append(row)
                in_window_ids.add(share_root)

    # Compute locked boundary (1 gen beyond each side, persons exist there)
    locked_boundary: list[dict[str, Any]] = []
    boundary_lo = gen_low - 1
    boundary_hi = gen_high + 1
    boundary_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id, generation, vansha_id")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .in_("generation", [boundary_lo, boundary_hi])
        .execute()
    )
    boundary_rows = boundary_res.data or []

    # Group boundary nodes by generation; emit count only (no PII)
    by_gen: dict[int, list[dict[str, Any]]] = {}
    for r in boundary_rows:
        if _str_id(r["node_id"]) in in_window_ids or _str_id(r["node_id"]) in sachet_ids:
            continue
        g = int(r.get("generation") or 0)
        by_gen.setdefault(g, []).append(r)

    for g, rows in by_gen.items():
        locked_boundary.append({
            "generation": g,
            "locked_count": len(rows),
            "node_ids":     [_str_id(r["node_id"]) for r in rows],
            "side":         "ancestor" if g < ego_gen else "descendant",
        })

    # Edges within the window only
    in_window_id_list = list(in_window_ids)
    rels_res = (
        sb.table("relationships")
        .select("*")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .in_("from_node_id", in_window_id_list)
        .execute()
    )
    rels = [r for r in (rels_res.data or [])
            if _str_id(r.get("to_node_id")) in in_window_ids]

    unions_res = (
        sb.table("unions")
        .select("*")
        .eq(VANSHA_ID_COLUMN, vansha_id)
        .execute()
    )
    unions = [
        u for u in (unions_res.data or [])
        if _str_id(u.get("male_node_id")) in in_window_ids
           or _str_id(u.get("female_node_id")) in in_window_ids
    ]

    # Async cache (fire-and-forget — best effort)
    try:
        sb.table(USER_VISIBLE_NODES_TABLE).upsert({
            "user_id":               uid,
            "vansha_id":             vansha_id,
            "node_ids":              list(in_window_ids),
            "locked_boundary_nodes": locked_boundary,
            "ego_node_id":           _str_id(ego["node_id"]),
            "ego_generation":        ego_gen,
            "effective_gen_up":      e["gen_up"],
            "effective_gen_down":    e["gen_down"],
            "effective_max_nodes":   e["max_nodes"],
            "computed_at":           datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()
    except Exception:
        logger.exception("Failed to cache user_visible_nodes for user_id=%s", uid)

    return {
        "entitlement":       e,
        "ego":               {"node_id": _str_id(ego["node_id"]), "generation": ego_gen},
        "persons":           in_window,
        "unions":            unions,
        "relationships":     rels,
        "locked_boundary":   locked_boundary,
        "onboarding_required": False,
    }


# ─── Sharing ─────────────────────────────────────────────────────────────────

@router.post("/share")
def grant_share(body: ShareCreate, user: CurrentUser) -> dict[str, Any]:
    """
    Grant a share from the current user's ego node to a target node.
    Distance must be ≤ 2 hops via the relationships graph.
    """
    uid = _str_id(user["id"])
    sb  = get_supabase()

    # Find granter's ego node (any vansha — but require shared vansha with grantee)
    granter = (
        sb.table(PERSONS_TABLE)
        .select("node_id, vansha_id")
        .eq("owner_id", uid)
        .limit(1)
        .execute()
    )
    if not granter.data:
        raise HTTPException(status_code=400, detail="You must claim a node before sharing.")
    granter_node_id = _str_id(granter.data[0]["node_id"])
    granter_vansha  = _str_id(granter.data[0]["vansha_id"])

    grantee_id = _str_id(body.grantee_node_id)
    grantee_res = (
        sb.table(PERSONS_TABLE)
        .select("node_id, vansha_id, owner_id")
        .eq("node_id", grantee_id)
        .limit(1)
        .execute()
    )
    if not grantee_res.data:
        raise HTTPException(status_code=404, detail="Grantee node not found.")
    grantee_owner = _str_id(grantee_res.data[0].get("owner_id"))
    if not grantee_owner:
        raise HTTPException(status_code=400, detail="Grantee node has no claimed owner.")
    grantee_vansha = _str_id(grantee_res.data[0].get("vansha_id"))
    if grantee_vansha != granter_vansha:
        raise HTTPException(status_code=400, detail="Cannot share across vanshas.")

    # Distance check via graph_distance() helper
    dist_res = sb.rpc("graph_distance", {
        "start_node": granter_node_id,
        "end_node":   grantee_id,
        "max_hops":   2,
    }).execute()
    dist = dist_res.data if isinstance(dist_res.data, int) else -1
    if dist < 0 or dist > 2:
        raise HTTPException(status_code=400,
            detail="Share recipient must be within 2 relationship hops.")

    # Cap shared_gen_up/down at granter's resolved limits
    e = _resolve_entitlement(sb, uid)
    capped_up   = min(body.shared_gen_up,   e["gen_up"])
    capped_down = min(body.shared_gen_down, e["gen_down"])

    row = {
        "granter_user_id":    uid,
        "granter_node_id":    granter_node_id,
        "grantee_user_id":    grantee_owner,
        "grantee_node_id":    grantee_id,
        "shared_gen_up":      capped_up,
        "shared_gen_down":    capped_down,
        "max_hops_verified":  dist,
        "valid_until":        body.valid_until.isoformat() if body.valid_until else None,
    }
    try:
        res = sb.table(ENTITLEMENT_SHARES_TABLE).upsert(row,
            on_conflict="granter_node_id,grantee_node_id").execute()
    except Exception as exc:
        logger.exception("Share creation failed")
        raise HTTPException(status_code=500, detail="Could not create share.") from exc

    # Audit event
    sb.table(SUBSCRIPTION_EVENTS_TABLE).insert({
        "user_id":    uid,
        "event_type": "share_granted",
        "metadata":   {"share_id": res.data[0]["id"] if res.data else None,
                       "grantee_user_id": grantee_owner,
                       "shared_gen_up": capped_up,
                       "shared_gen_down": capped_down},
        "created_by": uid,
    }).execute()

    return {"ok": True, "share": res.data[0] if res.data else None}


@router.delete("/share/{share_id}")
def revoke_share(share_id: UUID, user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()

    share_res = (
        sb.table(ENTITLEMENT_SHARES_TABLE)
        .select("*")
        .eq("id", str(share_id))
        .limit(1)
        .execute()
    )
    if not share_res.data:
        raise HTTPException(status_code=404, detail="Share not found.")
    share = share_res.data[0]
    if _str_id(share.get("granter_user_id")) != uid:
        raise HTTPException(status_code=403, detail="Only the granter can revoke a share.")

    sb.table(ENTITLEMENT_SHARES_TABLE).update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(share_id)).execute()

    sb.table(SUBSCRIPTION_EVENTS_TABLE).insert({
        "user_id":    uid,
        "event_type": "share_revoked",
        "metadata":   {"share_id": str(share_id)},
        "created_by": uid,
    }).execute()

    return {"ok": True}


@router.get("/shares/given")
def shares_i_gave(user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()
    res = (
        sb.table(ENTITLEMENT_SHARES_TABLE)
        .select("*")
        .eq("granter_user_id", uid)
        .is_("revoked_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return {"shares": res.data or []}


@router.get("/shares/received")
def shares_i_got(user: CurrentUser) -> dict[str, Any]:
    uid = _str_id(user["id"])
    sb  = get_supabase()
    res = (
        sb.table(ENTITLEMENT_SHARES_TABLE)
        .select("*")
        .eq("grantee_user_id", uid)
        .is_("revoked_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return {"shares": res.data or []}
