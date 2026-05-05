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
