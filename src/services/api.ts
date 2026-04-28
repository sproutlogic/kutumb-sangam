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
  middle_name?: string;
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
      middle_name: payload.middle_name?.trim() || null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Eco-Panchang APIs
// ─────────────────────────────────────────────────────────────────────────────

export interface TithiDefinition {
  id: number;
  paksha: "shukla" | "krishna";
  tithi_number: number;
  name_sanskrit: string;
  name_hindi: string;
  name_common: string;
  eco_significance: string;
  plant_action: string | null;
  water_action: string | null;
  avoid_action: string | null;
  nature_observation: string | null;
  sewa_category: string;
  community_action: string;
  ceremony_type_hint: string | null;
}

export interface EcoRecommendation {
  primary: string;
  plant: string;
  water: string;
  avoid: string;
  observe: string;
  community: string;
}

export interface TodayPanchang {
  date: string;
  tithi: TithiDefinition;
  nakshatra: string | null;
  yoga: string | null;
  masa: string | null;
  samvat_year: number | null;
  paksha: "shukla" | "krishna";
  special_flag: string | null;
  is_kshaya: boolean;
  is_adhika: boolean;
  sunrise_ts: string | null;
  ref_lat: number;
  ref_lon: number;
  eco_recommendation: EcoRecommendation;
}

export interface PanchangCalendarRow {
  id: string;
  gregorian_date: string;
  tithi_id: number;
  tithis?: TithiDefinition;
  paksha: "shukla" | "krishna";
  nakshatra: string | null;
  yoga: string | null;
  masa_name: string | null;
  samvat_year: number | null;
  special_flag: string | null;
  is_kshaya: boolean;
  is_adhika: boolean;
  sunrise_ts: string | null;
  ref_lat: number;
  ref_lon: number;
}

/** Today's tithi + eco recommendation. lat/lon optional — defaults to Ujjain. */
export async function fetchTodayPanchang(
  lat?: number,
  lon?: number,
): Promise<TodayPanchang | null> {
  try {
    const params = new URLSearchParams();
    if (lat !== undefined) params.set("lat", String(lat));
    if (lon !== undefined) params.set("lon", String(lon));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetchApi(`${getApiBaseUrl()}/api/panchang/today${qs}`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as TodayPanchang;
  } catch {
    return null;
  }
}

/** All 30 tithi definitions (public, rarely changes). */
export async function fetchTithis(): Promise<TithiDefinition[]> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/panchang/tithis`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as TithiDefinition[];
  } catch {
    return [];
  }
}

/** Rolling calendar window. Defaults to today → today+7. Max 90 days. */
export async function fetchPanchangCalendar(
  from?: string,
  to?: string,
): Promise<PanchangCalendarRow[]> {
  try {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetchApi(`${getApiBaseUrl()}/api/panchang/calendar${qs}`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as PanchangCalendarRow[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eco-Sewa APIs (Tier 1 self-reported)
// ─────────────────────────────────────────────────────────────────────────────

export type EcoSewaActionType =
  | "tree_watered" | "tree_planted_self" | "waste_segregated"
  | "animal_water" | "eco_pledge" | "community_clean"
  | "composting" | "solar_action" | "water_harvesting";

export type EcoSewaStatus = "pending" | "vouched" | "disputed" | "rejected";

export interface EcoSewaLog {
  id: string;
  vansha_id: string;
  reported_by_uid: string;
  action_type: EcoSewaActionType;
  action_date: string;
  location_text: string | null;
  notes: string | null;
  photo_url: string | null;
  tithi_id: number | null;
  status: EcoSewaStatus;
  vouched_by_uid: string | null;
  vouched_at: string | null;
  dispute_reason: string | null;
  score_contribution: number;
  created_at: string;
  updated_at: string;
}

export interface LogSewaPayload {
  action_type: EcoSewaActionType;
  action_date?: string;
  location_text?: string;
  notes?: string;
  photo_url?: string;
}

export async function logEcoSewa(
  payload: LogSewaPayload,
): Promise<{ ok: boolean; log_id: string; status: string; score_contribution: number; message: string }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/eco-sewa/log`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await parseJsonOrThrow(res)) as {
    ok: boolean; log_id: string; status: string; score_contribution: number; message: string;
  };
}

export async function fetchEcoSewaLogs(
  vansha_id?: string,
  limit = 50,
): Promise<EcoSewaLog[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (vansha_id) params.set("vansha_id", vansha_id);
    const res = await fetchApi(`${getApiBaseUrl()}/api/eco-sewa/logs?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as EcoSewaLog[];
  } catch {
    return [];
  }
}

export async function vouchEcoSewaLog(
  log_id: string,
): Promise<{ ok: boolean; new_status: string; score_contribution: number; eco_hours_delta: number }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/eco-sewa/logs/${encodeURIComponent(log_id)}/vouch`, {
    method: "PATCH",
    headers: { Accept: "application/json" },
  });
  return (await parseJsonOrThrow(res)) as {
    ok: boolean; new_status: string; score_contribution: number; eco_hours_delta: number;
  };
}

export async function disputeEcoSewaLog(
  log_id: string,
  reason: string,
): Promise<{ ok: boolean; new_status: string }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/eco-sewa/logs/${encodeURIComponent(log_id)}/dispute`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return (await parseJsonOrThrow(res)) as { ok: boolean; new_status: string };
}

export interface EcoSewaStats {
  vansha_id: string;
  total_actions: number;
  vouched: number;
  pending: number;
  disputed: number;
  total_score_contrib: number;
  by_action_type: Record<string, number>;
}

export async function fetchEcoSewaStats(vansha_id: string): Promise<EcoSewaStats | null> {
  try {
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/eco-sewa/stats/${encodeURIComponent(vansha_id)}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as EcoSewaStats;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eco Service APIs (Tier 2 verified)
// ─────────────────────────────────────────────────────────────────────────────

export type ServicePackageId = "taruvara" | "dashavruksha" | "jala_setu";

export interface ServicePackage {
  id: ServicePackageId;
  name_sanskrit: string;
  name_english: string;
  description: string;
  price_paise: number;
  price_inr: number;
  tree_count: number;
  care_months: number;
  includes_water_station: boolean;
  is_active: boolean;
}

export interface ServiceOrder {
  id: string;
  vansha_id: string;
  user_id: string;
  package_id: ServicePackageId;
  payment_id: string | null;
  payment_status: string;
  delivery_location_text: string;
  delivery_lat: number | null;
  delivery_lon: number | null;
  preferred_date: string | null;
  vendor_id: string | null;
  status: string;
  care_schedule: CareMilestone[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  service_packages?: Pick<ServicePackage, "name_english" | "name_sanskrit" | "tree_count" | "includes_water_station">;
}

export interface CareMilestone {
  month: number;
  due_date: string;
  status: "pending" | "notified" | "completed";
  proof_id: string | null;
}

export async function fetchServicePackages(): Promise<ServicePackage[]> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/services/packages`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as ServicePackage[];
  } catch {
    return [];
  }
}

export interface CreateServiceOrderPayload {
  package_id: ServicePackageId;
  delivery_location_text: string;
  delivery_lat?: number;
  delivery_lon?: number;
  preferred_date?: string;
  use_igst?: boolean;
  billed_name?: string;
  billed_email?: string;
  billed_phone?: string;
  gstin?: string;
}

export async function createServiceOrder(
  payload: CreateServiceOrderPayload,
): Promise<{ ok: boolean; service_order_id: string; payment_id: string; total_paise: number; display_total: string }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/services/create-order`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await parseJsonOrThrow(res)) as {
    ok: boolean; service_order_id: string; payment_id: string; total_paise: number; display_total: string;
  };
}

export async function fetchMyServiceOrders(): Promise<ServiceOrder[]> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/services/orders`, {
      headers: { Accept: "application/json" },
    });
    return (await parseJsonOrThrow(res)) as ServiceOrder[];
  } catch {
    return [];
  }
}

export async function fetchServiceOrderDetail(order_id: string): Promise<ServiceOrder | null> {
  try {
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/services/orders/${encodeURIComponent(order_id)}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as ServiceOrder;
  } catch {
    return null;
  }
}

export async function vendorAcceptOrder(
  order_id: string,
): Promise<{ ok: boolean; new_status: string }> {
  const res = await fetchApi(
    `${getApiBaseUrl()}/api/services/orders/${encodeURIComponent(order_id)}/accept`,
    { method: "PATCH", headers: { Accept: "application/json" } },
  );
  return (await parseJsonOrThrow(res)) as { ok: boolean; new_status: string };
}

export interface ProofUploadPayload {
  photo_urls: string[];
  geo_lat: number;
  geo_lon: number;
  geo_accuracy_m?: number;
  captured_at: string;
  vendor_notes?: string;
  submission_type?: string;
}

export async function uploadOrderProof(
  order_id: string,
  payload: ProofUploadPayload,
): Promise<{ ok: boolean; proof_id: string; auto_approved: boolean; geo_ok: boolean; time_ok: boolean; status: string; message: string }> {
  const res = await fetchApi(
    `${getApiBaseUrl()}/api/services/orders/${encodeURIComponent(order_id)}/proof`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return (await parseJsonOrThrow(res)) as {
    ok: boolean; proof_id: string; auto_approved: boolean;
    geo_ok: boolean; time_ok: boolean; status: string; message: string;
  };
}

export async function reviewOrderProof(
  order_id: string,
  approved: boolean,
  rejection_reason?: string,
): Promise<{ ok: boolean; result: "approved" | "rejected" }> {
  const res = await fetchApi(
    `${getApiBaseUrl()}/api/services/orders/${encodeURIComponent(order_id)}/proof/review`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ approved, rejection_reason }),
    },
  );
  return (await parseJsonOrThrow(res)) as { ok: boolean; result: "approved" | "rejected" };
}

export async function fetchVendorDashboard(limit = 20): Promise<{
  vendor: Record<string, unknown>;
  orders: ServiceOrder[];
  total: number;
  by_status: Record<string, number>;
} | null> {
  try {
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/services/vendor/dashboard?limit=${limit}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as {
      vendor: Record<string, unknown>;
      orders: ServiceOrder[];
      total: number;
      by_status: Record<string, number>;
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Green Legacy APIs (public)
// ─────────────────────────────────────────────────────────────────────────────

export interface GreenLegacyProfile {
  vansha_id: string;
  family_name: string;
  location: string;
  member_count: number;
  verified_trees: number;
  verified_pledges: number;
  prakriti_score: number;
  sewa_actions_total: number;
  sewa_actions_vouched: number;
  sewa_score_contrib: number;
  orders_completed: number;
  trees_via_service: number;
  green_legacy_score: number;
  last_activity_at: string | null;
  share_url: string;
}

export interface GreenLegacyEvent {
  source: "eco_sewa" | "verified" | "ceremony";
  action_type: string;
  event_date: string;
  notes: string | null;
  photo_url: string | null;
  points: number;
  tithi_id: number | null;
  created_at: string;
}

export async function fetchGreenLegacyProfile(
  vansha_id: string,
): Promise<GreenLegacyProfile | null> {
  try {
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/green-legacy/${encodeURIComponent(vansha_id)}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as GreenLegacyProfile;
  } catch {
    return null;
  }
}

export async function fetchGreenLegacyTimeline(
  vansha_id: string,
  limit = 50,
  offset = 0,
): Promise<GreenLegacyEvent[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/green-legacy/${encodeURIComponent(vansha_id)}/timeline?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as GreenLegacyEvent[];
  } catch {
    return [];
  }
}

export async function fetchGreenLegacyGenerations(
  vansha_id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/green-legacy/${encodeURIComponent(vansha_id)}/generations`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content APIs (admin review queue + public published)
// ─────────────────────────────────────────────────────────────────────────────

export type ContentType = "blog_post" | "ig_caption" | "yt_short";
export type ContentStatus = "draft" | "approved" | "published" | "rejected";

export interface GeneratedContentItem {
  id: string;
  panchang_date: string;
  tithi_id: number;
  content_type: ContentType;
  vansha_id: string | null;
  family_name: string | null;
  location: string | null;
  title: string;
  subtitle: string | null;
  body: string;
  hashtags: string[] | null;
  status: ContentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
}

export async function fetchContentQueue(params?: {
  content_type?: ContentType;
  limit?: number;
  offset?: number;
}): Promise<{ items: GeneratedContentItem[]; total: number }> {
  try {
    const qs = new URLSearchParams();
    if (params?.content_type) qs.set("content_type", params.content_type);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/content/queue?${qs.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as { items: GeneratedContentItem[]; total: number };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function approveContent(
  content_id: string,
  publish_now = false,
): Promise<{ ok: boolean; new_status: string }> {
  const res = await fetchApi(
    `${getApiBaseUrl()}/api/content/${encodeURIComponent(content_id)}/approve`,
    {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ publish_now }),
    },
  );
  return (await parseJsonOrThrow(res)) as { ok: boolean; new_status: string };
}

export async function rejectContent(
  content_id: string,
  reason: string,
): Promise<{ ok: boolean }> {
  const res = await fetchApi(
    `${getApiBaseUrl()}/api/content/${encodeURIComponent(content_id)}/reject`,
    {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  return (await parseJsonOrThrow(res)) as { ok: boolean };
}

export async function triggerContentGeneration(): Promise<{ ok: boolean; inserted: number; message: string }> {
  const res = await fetchApi(`${getApiBaseUrl()}/api/content/generate`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  return (await parseJsonOrThrow(res)) as { ok: boolean; inserted: number; message: string };
}

export async function fetchPublishedContent(params?: {
  content_type?: ContentType;
  vansha_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: GeneratedContentItem[]; content_type: ContentType }> {
  try {
    const qs = new URLSearchParams();
    qs.set("content_type", params?.content_type ?? "blog_post");
    if (params?.vansha_id) qs.set("vansha_id", params.vansha_id);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const res = await fetchApi(
      `${getApiBaseUrl()}/api/content/published?${qs.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    return (await parseJsonOrThrow(res)) as { items: GeneratedContentItem[]; content_type: ContentType };
  } catch {
    return { items: [], content_type: params?.content_type ?? "blog_post" };
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  try {
    const res = await fetchApi(`${getApiBaseUrl()}/api/notifications?limit=${limit}`);
    return (await parseJsonOrThrow(res)) as AppNotification[];
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetchApi(`${getApiBaseUrl()}/api/notifications/${id}/read`, { method: "PATCH" });
  } catch { /* non-fatal */ }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await fetchApi(`${getApiBaseUrl()}/api/notifications/read-all`, { method: "POST" });
  } catch { /* non-fatal */ }
}
