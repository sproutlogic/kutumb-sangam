/**
 * Central HTTP client for the FastAPI backend (Vanshavali tree API).
 * Configure `VITE_API_BASE_URL` in `.env` (defaults to local dev server).
 */

import type { MatrimonyProfile } from "@/engine/types";
import { mergeMatrimonyProfile } from "@/engine/matrimonyDefaults";

const DEFAULT_BASE = "http://127.0.0.1:8000";
const CURRENT_VANSHA_STORAGE_KEY = "kutumb_current_vansha_id";

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  return (typeof fromEnv === "string" && fromEnv.trim() !== "" ? fromEnv : DEFAULT_BASE).replace(/\/$/, "");
}

function readPersistedVanshaId(): string {
  try {
    return (localStorage.getItem(CURRENT_VANSHA_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function getPersistedVanshaId(): string {
  return readPersistedVanshaId();
}

export function setPersistedVanshaId(vanshaId: string): void {
  const normalized = vanshaId.trim();
  if (!normalized) return;
  try {
    localStorage.setItem(CURRENT_VANSHA_STORAGE_KEY, normalized);
  } catch {
    /* ignore private mode / quota errors */
  }
}

/** Returns the current Supabase access token if a session exists, or an empty string. */
function getAccessToken(): string {
  try {
    // supabase-js stores the session in localStorage under "sb-<project>-auth-token"
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

/** Browser `fetch` throws TypeError with "Failed to fetch" when the API is down or unreachable. */
async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...authHeader,
      },
    });
  } catch (e) {
    if (e instanceof TypeError) {
      const base = getApiBaseUrl();
      const isLocal = base.includes("127.0.0.1") || base.includes("localhost");
      const hint = isLocal
        ? `Start the FastAPI server: python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`
        : `The server at ${base} is unreachable. It may be starting up — wait a moment and retry.`;
      throw new Error(`Cannot reach API. ${hint}`);
    }
    throw e;
  }
}

/** Resolves vansha UUID for API calls: URL param first, then `VITE_DEFAULT_VANSHA_ID`. */
export function resolveVanshaIdForApi(explicit?: string | null): string {
  const candidates = [explicit ?? "", import.meta.env.VITE_DEFAULT_VANSHA_ID ?? "", readPersistedVanshaId()];
  for (const c of candidates) {
    const normalized = String(c).trim();
    if (normalized) return normalized;
  }
  return "";
}

/** Loose UUID check aligned with FastAPI `UUID` path params (8-4-4-4-12 hex). */
export function isValidVanshaUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function requireValidVanshaUuid(value: string): void {
  if (!isValidVanshaUuid(value)) {
    throw new Error(
      'Vansha id must be a valid UUID from your database. Set VITE_DEFAULT_VANSHA_ID in .env or open /tree?vansha_id=<uuid>. Template text like "your-vansha-uuid" will not work.',
    );
  }
}

/** Response shape from GET /api/tree/{vansha_id} and POST /api/tree/bridge */
export interface VanshaTreePayload {
  vansha_id: string;
  unions: Record<string, unknown>[];
  persons: Record<string, unknown>[];
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: string | unknown };
      if (typeof j?.detail === "string") detail = j.detail;
      else if (Array.isArray(j?.detail)) {
        const parts = j.detail.map((item: unknown) => {
          if (item && typeof item === "object" && "msg" in item && typeof (item as { msg: unknown }).msg === "string") {
            return (item as { msg: string }).msg;
          }
          return JSON.stringify(item);
        });
        detail = parts.join("; ");
      } else if (j?.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* keep raw text */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON from server");
  }
}

/**
 * Loads all unions and persons for a vansha (sorted unions from the backend).
 */
export async function fetchVanshaTree(vansha_id: string): Promise<VanshaTreePayload> {
  const raw = vansha_id.trim();
  requireValidVanshaUuid(raw);
  const id = encodeURIComponent(raw);
  const url = `${getApiBaseUrl()}/api/tree/${id}`;
  const res = await fetchApi(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = (await parseJsonOrThrow(res)) as VanshaTreePayload;
  if (!data || typeof data.vansha_id !== "string") {
    throw new Error("Unexpected tree response shape");
  }
  setPersistedVanshaId(data.vansha_id);
  return data;
}

export interface BootstrapTreePayload {
  tree_name: string;
  gotra?: string;
  father_name?: string;
  mother_name?: string;
  spouse_name?: string;
  identity: {
    given_name: string;
    middle_name?: string;
    surname: string;
    date_of_birth: string;
    ancestral_place: string;
    current_residence: string;
    gender?: string;
  };
}

/** Creates onboarding tree rows in backend and returns canonical tree payload. */
export async function bootstrapOnboardingTree(payload: BootstrapTreePayload): Promise<VanshaTreePayload> {
  const url = `${getApiBaseUrl()}/api/tree/bootstrap`;
  const res = await fetchApi(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await parseJsonOrThrow(res)) as VanshaTreePayload;
  if (!data || typeof data.vansha_id !== "string") {
    throw new Error("Unexpected bootstrap response shape");
  }
  setPersistedVanshaId(data.vansha_id);
  return data;
}

/**
 * Matrimonial bridge: load paternal vansha data by the female's `origin_vansha_id`.
 */
export interface CreatePersonPayload {
  vansha_id: string;
  first_name: string;
  last_name: string;
  /** ISO YYYY-MM-DD */
  date_of_birth: string;
  ancestral_place: string;
  current_residence: string;
  gender: string;
  relation: string;
  /** Ignored when anchor_node_id is set (server computes from Vruksha rules). */
  relative_gen_index: number;
  branch?: string;
  gotra?: string;
  mool_niwas?: string;
  parent_node_id?: string;
  /** Selected tree node: required for Vruksha Add Member flow. */
  anchor_node_id?: string | null;
  /** Optional names for inferred placeholder parent when no marital union exists yet. */
  father_name?: string | null;
  mother_name?: string | null;
}

/**
 * Inserts a new person into the current vansha (POST /api/person).
 */
export async function createPerson(payload: CreatePersonPayload): Promise<{ ok: boolean; node_id: string }> {
  const vid = resolveVanshaIdForApi(payload.vansha_id);
  if (!vid) {
    throw new Error(
      "Missing vansha_id. Open the tree with a vansha or set VITE_DEFAULT_VANSHA_ID in your environment.",
    );
  }
  requireValidVanshaUuid(vid);
  const url = `${getApiBaseUrl()}/api/person`;
  const res = await fetchApi(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vansha_id: vid,
      first_name: payload.first_name,
      last_name: payload.last_name,
      date_of_birth: payload.date_of_birth,
      ancestral_place: payload.ancestral_place,
      current_residence: payload.current_residence,
      gender: payload.gender,
      relation: payload.relation,
      relative_gen_index: payload.relative_gen_index,
      branch: payload.branch ?? "main",
      gotra: payload.gotra ?? "",
      mool_niwas: payload.mool_niwas ?? "",
      parent_node_id: payload.parent_node_id ?? null,
      anchor_node_id: payload.anchor_node_id?.trim() || null,
      father_name: payload.father_name?.trim() || null,
      mother_name: payload.mother_name?.trim() || null,
    }),
  });
  const data = (await parseJsonOrThrow(res)) as { ok?: boolean; node_id?: string };
  return { ok: !!data.ok, node_id: data.node_id ?? "" };
}

export async function fetchMatrimonialBridge(origin_vansha_id: string): Promise<VanshaTreePayload> {
  requireValidVanshaUuid(origin_vansha_id);
  const url = `${getApiBaseUrl()}/api/tree/bridge`;
  const res = await fetchApi(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ origin_vansha_id: origin_vansha_id.trim() }),
  });
  const data = (await parseJsonOrThrow(res)) as VanshaTreePayload;
  if (!data || typeof data.vansha_id !== "string") {
    throw new Error("Unexpected bridge response shape");
  }
  return data;
}

/** Link two existing persons as husband and wife (POST /api/union/spouse). */
export async function linkExistingSpouses(params: {
  vansha_id: string;
  anchor_node_id: string;
  spouse_node_id: string;
}): Promise<{ ok: boolean; already_linked?: boolean }> {
  const vid = resolveVanshaIdForApi(params.vansha_id);
  if (!vid) {
    throw new Error("Missing vansha_id. Open the tree with a vansha or set VITE_DEFAULT_VANSHA_ID.");
  }
  requireValidVanshaUuid(vid);
  requireValidVanshaUuid(params.anchor_node_id.trim());
  requireValidVanshaUuid(params.spouse_node_id.trim());

  const res = await fetchApi(`${getApiBaseUrl()}/api/union/spouse`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vansha_id: vid,
      anchor_node_id: params.anchor_node_id.trim(),
      spouse_node_id: params.spouse_node_id.trim(),
    }),
  });
  const data = (await parseJsonOrThrow(res)) as { ok?: boolean; already_linked?: boolean };
  return { ok: !!data.ok, already_linked: data.already_linked };
}

/** Load persisted matrimony preferences for a vansha (null if none). */
export async function fetchMatrimonyProfile(vansha_id: string): Promise<MatrimonyProfile | null> {
  const vid = resolveVanshaIdForApi(vansha_id);
  if (!vid) return null;
  requireValidVanshaUuid(vid);
  const id = encodeURIComponent(vid);
  const res = await fetchApi(`${getApiBaseUrl()}/api/matrimony/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = (await parseJsonOrThrow(res)) as { profile?: unknown };
  if (data.profile == null) return null;
  return mergeMatrimonyProfile(data.profile);
}

/** Upsert matrimony profile JSON for this vansha. */
export async function saveMatrimonyProfile(vansha_id: string, profile: MatrimonyProfile): Promise<void> {
  const vid = resolveVanshaIdForApi(vansha_id);
  if (!vid) {
    throw new Error("Missing vansha_id. Set VITE_DEFAULT_VANSHA_ID or open the app with ?vansha_id=…");
  }
  requireValidVanshaUuid(vid);
  const id = encodeURIComponent(vid);
  const res = await fetchApi(`${getApiBaseUrl()}/api/matrimony/${id}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile: {
        ...profile,
        kundaliData: { ...profile.kundaliData },
      },
    }),
  });
  await parseJsonOrThrow(res);
}

// ── Harit Circle / Mitra Earnings ────────────────────────────────────────────

export interface HaritCircle {
  id: string;
  name: string;
  paryavaran_mitra_user_id: string;
  location_name: string | null;
  location_lat: number | null;
  location_lon: number | null;
  vansha_ids: string[];
  created_at: string;
}

export interface MitraEarnings {
  total_net_earned: number;
  by_ceremony: Record<string, number>;
  transactions: { ceremony_type: string; net_amount: number; status: string }[];
}

export async function fetchHaritCircles(): Promise<HaritCircle[]> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/prakriti/circles`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as HaritCircle[];
  } catch { return []; }
}

export async function createHaritCircle(body: {
  name: string;
  location_name?: string;
}): Promise<{ ok: boolean }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/prakriti/circles`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await parseJsonOrThrow(res)) as { ok: boolean };
}

export async function fetchMitraEarnings(): Promise<MitraEarnings | null> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/prakriti/ceremony/my-earnings`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as MitraEarnings;
  } catch { return null; }
}

export async function logEcoCeremony(body: {
  ceremony_type: string;
  vansha_id?: string;
}): Promise<{ ok: boolean; gross_amount: number; net_amount: number }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/prakriti/ceremony`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await parseJsonOrThrow(res)) as { ok: boolean; gross_amount: number; net_amount: number };
}

// ── Prakriti Score ────────────────────────────────────────────────────────────

export interface PrakritiScore {
  vansha_id: string;
  trees_planted: number;
  eco_hours: number;
  pledges_completed: number;
  score: number;
}

/** Fetch live Prakriti Score for a vansha (eco_hours computed from samay_transactions). */
export async function fetchPrakritiScore(vansha_id: string): Promise<PrakritiScore | null> {
  const vid = resolveVanshaIdForApi(vansha_id);
  if (!vid || !isValidVanshaUuid(vid)) return null;
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/prakriti/score/${encodeURIComponent(vid)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as PrakritiScore;
  } catch {
    return null;
  }
}

/** Persist Pandit verification request for a member node. */
export async function requestPanditVerification(params: {
  vansha_id?: string | null;
  node_id: string;
  requested_by?: string | null;
}): Promise<{ ok: boolean; already_pending?: boolean; request_id?: string }> {
  const vid = resolveVanshaIdForApi(params.vansha_id);
  if (!vid) {
    throw new Error("Missing vansha_id. Open tree with a vansha first.");
  }
  requireValidVanshaUuid(vid);
  requireValidVanshaUuid(params.node_id.trim());
  const requestedBy = (params.requested_by ?? "").trim();
  if (requestedBy) requireValidVanshaUuid(requestedBy);

  const res = await fetchApi(`${getApiBaseUrl()}/api/verification/request`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vansha_id: vid,
      node_id: params.node_id.trim(),
      requested_by: requestedBy || null,
    }),
  });
  const data = (await parseJsonOrThrow(res)) as { ok?: boolean; already_pending?: boolean; request_id?: string };
  return {
    ok: !!data.ok,
    already_pending: data.already_pending,
    request_id: data.request_id,
  };
}
