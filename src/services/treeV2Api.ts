/**
 * Tree v2 API client — relationship edges, vanshas metadata, canvas offsets.
 * Talks to /api/tree-v2/* endpoints (see backend/routers/tree_v2.py).
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
  return (text ? (JSON.parse(text) as T) : ({} as T));
}

export type EdgeType = "parent_of" | "spouse_of";
export type EdgeSubtype = "biological" | "adopted" | "step";

export interface Relationship {
  id: string;
  vansha_id: string;
  from_node_id: string;
  to_node_id: string;
  type: EdgeType;
  subtype: EdgeSubtype;
  created_at?: string;
}

export interface VanshaMeta {
  vansha_id: string;
  vansh_code: string;
  vansh_name: string | null;
  founder_node_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrityReport {
  node_id: string;
  person: { kutumb_id: string | null; name: string; gender: string | null };
  incoming: Relationship[];
  outgoing: Relationship[];
  issues: string[];
}

export async function listRelationships(vanshaId: string): Promise<Relationship[]> {
  const r = await call<{ relationships: Relationship[] }>(`/api/tree-v2/${vanshaId}/relationships`);
  return r.relationships ?? [];
}

export async function createRelationship(payload: {
  vansha_id: string;
  from_node_id: string;
  to_node_id: string;
  type: EdgeType;
  subtype?: EdgeSubtype;
}): Promise<Relationship> {
  return call<Relationship>("/api/tree-v2/relationships", {
    method: "POST",
    body: JSON.stringify({ subtype: "biological", ...payload }),
  });
}

export async function updateRelationshipSubtype(id: string, subtype: EdgeSubtype): Promise<Relationship> {
  return call<Relationship>(`/api/tree-v2/relationships/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ subtype }),
  });
}

export async function deleteRelationship(id: string): Promise<void> {
  await call<{ ok: boolean }>(`/api/tree-v2/relationships/${id}`, { method: "DELETE" });
}

export async function getVansha(vanshaId: string): Promise<VanshaMeta> {
  return call<VanshaMeta>(`/api/tree-v2/vanshas/${vanshaId}`);
}

export async function getVanshaByCode(code: string): Promise<VanshaMeta> {
  return call<VanshaMeta>(`/api/tree-v2/vanshas/by-code/${encodeURIComponent(code)}`);
}

export async function setNodeOffset(nodeId: string, x: number, y: number): Promise<void> {
  await call<unknown>(`/api/tree-v2/persons/${nodeId}/offset`, {
    method: "PATCH",
    body: JSON.stringify({ canvas_offset_x: x, canvas_offset_y: y }),
  });
}

export async function clearNodeOffset(nodeId: string): Promise<void> {
  await call<unknown>(`/api/tree-v2/persons/${nodeId}/offset`, { method: "DELETE" });
}

export async function getIntegrity(nodeId: string): Promise<IntegrityReport> {
  return call<IntegrityReport>(`/api/tree-v2/persons/${nodeId}/integrity`);
}

export interface PersonV2 {
  node_id: string;
  vansha_id: string;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  title?: string | null;
  common_name?: string | null;
  gender?: string;
  relation?: string;
  generation?: number | null;
  field_privacy?: Record<string, string> | null;
  owner_id?: string | null;
  creator_id?: string | null;
  kutumb_id?: string | null;
  date_of_birth?: string | null;
  ancestral_place?: string | null;
  current_residence?: string | null;
  gotra?: string | null;
  // Vyakti profile fields
  punyatithi?: string;
  marital_status?: string;
  marriage_anniversary?: string | null;
  education?: string;
  janmasthan_village?: string | null;
  janmasthan_city?: string | null;
  mool_niwas_village?: string | null;
  mool_niwas_city?: string;
  nanighar?: string;
  email?: string | null;
  // Kul profile fields
  vansh_label?: string;
  pravara?: string;
  ved_shakha?: string;
  ritual_sutra?: string;
  kul_devi?: string;
  kul_devi_sthan?: string;
  ishta_devta?: string;
  tirth_purohit?: string;
  pravas_history?: string;
  paitrik_niwas?: string;
  gram_devta?: string;
  pidhi_label?: string;
  vivah_sambandh?: string;
  kul_achara?: string;
  manat?: string;
  [key: string]: unknown;
}

export type ProfilePatch = Partial<Omit<PersonV2, "node_id" | "vansha_id" | "owner_id" | "kutumb_id" | "generation">>;

export interface PublicTree {
  vansha: VanshaMeta;
  persons: PersonV2[];
  relationships: Relationship[];
}

export async function getPublicTree(vanshCode: string): Promise<PublicTree> {
  return call<PublicTree>(`/api/tree-v2/vanshas/by-code/${encodeURIComponent(vanshCode)}/public`);
}

export async function createPersonV2(payload: {
  vansha_id: string;
  first_name: string;
  last_name?: string;
  gender: "male" | "female" | "other";
  date_of_birth?: string;
  gotra?: string;
}): Promise<PersonV2> {
  return call<PersonV2>("/api/tree-v2/persons", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPersonProfile(nodeId: string): Promise<PersonV2> {
  return call<PersonV2>(`/api/tree-v2/persons/${nodeId}/profile`);
}

export async function updatePersonProfile(nodeId: string, patch: ProfilePatch): Promise<PersonV2> {
  return call<PersonV2>(`/api/tree-v2/persons/${nodeId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function claimNode(kutumbId: string): Promise<PersonV2> {
  return call<PersonV2>("/api/tree-v2/persons/claim", {
    method: "POST",
    body: JSON.stringify({ kutumb_id: kutumbId }),
  });
}
