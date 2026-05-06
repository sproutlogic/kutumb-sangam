/**
 * Entitlement / tree subscription / sachet API client.
 * Talks to /api/entitlement/*, /api/subscriptions/*, /api/sachets/* endpoints.
 */
import { getApiBaseUrl } from "./api";

function token(): string {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.endsWith("-auth-token"));
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: string };
      if (parsed?.access_token) return parsed.access_token;
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const t = token();
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type TreePlanName = "free" | "basic" | "standard" | "premium";

export interface TreePlan {
  id: string;
  name: TreePlanName;
  display_name: string;
  price_inr_monthly: number;
  price_inr_annual: number;
  gen_up: number;
  gen_down: number;
  max_intentional_nodes: number;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
  description?: string | null;
}

export interface Entitlement {
  plan: TreePlanName;
  plan_display_name: string;
  gen_up: number;
  gen_down: number;
  max_nodes: number;
  features: Record<string, boolean>;
  status: "trial" | "active" | "grace_period" | "expired" | "cancelled";
  valid_until: string | null;
  referral_bonus_up: number;
  referral_bonus_down: number;
  topup_bonus_up: number;
  topup_bonus_down: number;
  has_admin_override: boolean;
  sachet_unlock_count: number;
}

export interface LockedBoundary {
  generation: number;
  locked_count: number;
  node_ids: string[];
  side: "ancestor" | "descendant";
}

export interface VisibleTreePayload {
  entitlement: {
    plan_name: string;
    plan_display: string;
    gen_up: number;
    gen_down: number;
    max_nodes: number;
    features: Record<string, boolean>;
    status: string;
    valid_until: string | null;
  };
  ego: { node_id: string; generation: number } | null;
  persons: Array<Record<string, unknown> & { node_id: string; generation?: number }>;
  unions:  Array<Record<string, unknown>>;
  relationships: Array<{
    id: string;
    vansha_id: string;
    from_node_id: string;
    to_node_id: string;
    type: "parent_of" | "spouse_of";
    subtype: "biological" | "adopted" | "step";
  }>;
  locked_boundary: LockedBoundary[];
  onboarding_required: boolean;
  message?: string;
}

export interface CheckoutResponse {
  ok: boolean;
  order_id: string;
  amount_paise: number;
  amount_inr?: number;
  currency: "INR";
  gateway: string;
  gateway_ready: boolean;
  product?: string;
  plan?: TreePlan;
  billing_period?: "monthly" | "annual";
  tax_breakdown?: Record<string, number | string>;
  instructions?: string;
}

export interface SachetSummary {
  node_unlocks: Array<{ node_id: string; bundle_size: number; price_paid_inr: number; purchased_at: string }>;
  topups:       Array<{ extra_gen_up: number; extra_gen_down: number; valid_until: string; purchased_at: string }>;
  active_topups: Array<unknown>;
  pricing: {
    single_node: number;
    bundle_5: number;
    branch_bundle: number;
    gen_topup: number;
    topup_days: number;
  };
}

// ─── Entitlement ────────────────────────────────────────────────────────────

export const fetchMyEntitlement = () => call<Entitlement>("/api/entitlement/me");

export const fetchVisibleTree = (vanshaId: string) =>
  call<VisibleTreePayload>(`/api/entitlement/tree/${vanshaId}`);

export const grantShare = (body: {
  grantee_node_id: string;
  shared_gen_up: number;
  shared_gen_down: number;
  valid_until?: string;
}) => call<{ ok: boolean; share: unknown }>("/api/entitlement/share", {
  method: "POST",
  body: JSON.stringify(body),
});

export const revokeShare = (shareId: string) =>
  call<{ ok: boolean }>(`/api/entitlement/share/${shareId}`, { method: "DELETE" });

export const sharesGiven    = () => call<{ shares: unknown[] }>("/api/entitlement/shares/given");
export const sharesReceived = () => call<{ shares: unknown[] }>("/api/entitlement/shares/received");

// ─── Subscriptions (tree plans) ─────────────────────────────────────────────

export const fetchTreePlans = () => call<{ plans: TreePlan[] }>("/api/subscriptions/plans");

export const checkoutPlan = (body: {
  plan_id: string;
  billing_period?: "monthly" | "annual";
  billed_name?: string;
  billed_email?: string;
  billed_phone?: string;
  billed_state?: string;
  use_igst?: boolean;
}) => call<CheckoutResponse>("/api/subscriptions/checkout", {
  method: "POST",
  body: JSON.stringify({ billing_period: "monthly", use_igst: true, ...body }),
});

export const verifyPlan = (body: {
  gateway_order_id: string;
  gateway_payment_id?: string;
  gateway_signature?: string;
}) => call<{ ok: boolean; subscription: unknown }>("/api/subscriptions/verify", {
  method: "POST",
  body: JSON.stringify(body),
});

export const fetchMySubscriptions = () =>
  call<{ current: unknown; history: unknown[] }>("/api/subscriptions/my");

export const cancelSubscription = (reason?: string) =>
  call<{ ok: boolean; access_until?: string }>("/api/subscriptions/cancel", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

// ─── Sachets ────────────────────────────────────────────────────────────────

export const checkoutNodeUnlock = (nodeIds: string[]) =>
  call<CheckoutResponse>("/api/sachets/node-unlock/checkout", {
    method: "POST",
    body: JSON.stringify({ node_ids: nodeIds }),
  });

export const verifyNodeUnlock = (body: {
  gateway_order_id: string;
  gateway_payment_id?: string;
}) => call<{ ok: boolean; unlocked_node_ids: string[] }>("/api/sachets/node-unlock/verify", {
  method: "POST",
  body: JSON.stringify(body),
});

export const checkoutBundle = (rootId: string, descendantIds: string[]) =>
  call<CheckoutResponse>("/api/sachets/bundle/checkout", {
    method: "POST",
    body: JSON.stringify({ bundle_root_node_id: rootId, descendant_node_ids: descendantIds }),
  });

export const verifyBundle = (body: { gateway_order_id: string; gateway_payment_id?: string }) =>
  call<{ ok: boolean; unlocked_node_ids: string[] }>("/api/sachets/bundle/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const checkoutTopup = (body: {
  direction?: "up" | "down";
  extra_gens?: number;
  days?: number;
}) => call<CheckoutResponse>("/api/sachets/topup/checkout", {
  method: "POST",
  body: JSON.stringify({ direction: "up", extra_gens: 1, days: 30, ...body }),
});

export const verifyTopup = (body: { gateway_order_id: string; gateway_payment_id?: string }) =>
  call<{ ok: boolean; topup: unknown }>("/api/sachets/topup/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchMySachets = () => call<SachetSummary>("/api/sachets/my");

// ─── Admin (superadmin only) ────────────────────────────────────────────────

export const adminListPlans = () =>
  call<{ plans: TreePlan[] }>("/api/admin/tree-plans");

export const adminCreatePlan = (body: Omit<TreePlan, "id" | "is_active" | "sort_order"> & {
  is_active?: boolean; sort_order?: number;
}) => call<{ ok: boolean; plan: TreePlan }>("/api/admin/tree-plans", {
  method: "POST",
  body: JSON.stringify({ is_active: true, sort_order: 0, ...body }),
});

export const adminUpdatePlan = (planId: string, body: Partial<TreePlan>) =>
  call<{ ok: boolean; plan: TreePlan }>(`/api/admin/tree-plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const adminDeletePlan = (planId: string) =>
  call<{ ok: boolean }>(`/api/admin/tree-plans/${planId}`, { method: "DELETE" });

export const adminListSubscriptions = (params?: {
  status?: string; plan_id?: string; page?: number; per_page?: number;
}) => {
  const q = new URLSearchParams();
  if (params?.status)   q.set("status", params.status);
  if (params?.plan_id)  q.set("plan_id", params.plan_id);
  if (params?.page)     q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ subscriptions: unknown[]; total: number; page: number; per_page: number }>(
    `/api/admin/tree-subscriptions${qs ? "?" + qs : ""}`,
  );
};

export const adminApplyOverride = (
  targetUserId: string,
  body: {
    gen_up?: number;
    gen_down?: number;
    max_nodes?: number;
    reason: string;
    active?: boolean;
  },
) => call<{ ok: boolean; event: unknown }>(`/api/admin/override/${targetUserId}`, {
  method: "POST",
  body: JSON.stringify({ active: true, ...body }),
});

export const adminEventLog = (params?: {
  event_type?: string; target_user_id?: string; page?: number; per_page?: number;
}) => {
  const q = new URLSearchParams();
  if (params?.event_type)     q.set("event_type", params.event_type);
  if (params?.target_user_id) q.set("target_user_id", params.target_user_id);
  if (params?.page)           q.set("page", String(params.page));
  if (params?.per_page)       q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ events: unknown[]; total: number }>(
    `/api/admin/subscription-events${qs ? "?" + qs : ""}`,
  );
};

export const adminSachetAnalytics = () =>
  call<{
    node_unlocks: { total_count: number; total_revenue_inr: number;
                    top_unlocked_node_ids: { node_id: string; count: number }[] };
    topups:       { total_count: number; total_revenue_inr: number };
    shares:       { total_active: number };
  }>("/api/admin/sachet-analytics");

export const adminGstReport = (params?: { start_date?: string; end_date?: string }) => {
  const q = new URLSearchParams();
  if (params?.start_date) q.set("start_date", params.start_date);
  if (params?.end_date)   q.set("end_date",   params.end_date);
  const qs = q.toString();
  return call<{
    rows: Array<Record<string, unknown>>;
    totals: Record<string, number>;
    row_count: number;
    range: { start_date?: string; end_date?: string };
  }>(`/api/admin/gst-report${qs ? "?" + qs : ""}`);
};

export const adminReferralUnlocks = () =>
  call<{
    rows: Array<{ user_id: string; referrals_count: number;
                  extra_gen_up: number; extra_gen_down: number; updated_at: string }>;
    total_users: number;
    total_extra_up: number;
    total_extra_down: number;
  }>("/api/admin/referral-unlocks");
