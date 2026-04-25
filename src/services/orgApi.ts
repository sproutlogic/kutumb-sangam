/**
 * Typed API helpers for Kutumb Pro / Org endpoints.
 * All calls require a valid JWT (Bearer token from Supabase session).
 */

import { getApiBaseUrl } from '@/services/api';

function getToken(): string {
  try {
    const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) { const p = JSON.parse(raw); if (p?.access_token) return p.access_token; }
    }
  } catch { /* ignore */ }
  return '';
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: authHeaders(),
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail ?? `API error ${res.status}`);
  return data as T;
}

/* ── Types ── */

export interface OrgSummary {
  id:            string;
  name:          string;
  slug:          string;
  framework_type: string;
  tier1_alias:   string;
  tier2_alias:   string;
  tier3_alias:   string;
  tier4_alias:   string;
  tier5_alias:   string;
  is_tier2_active: boolean;
  is_tier3_active: boolean;
  is_tier4_active: boolean;
  currency_name:  string;
  currency_emoji: string;
  branding_config: Record<string, unknown>;
  status:         string;
  head_user_id:   string;
  created_at:     string;
  my_tier?:       number;
  my_l_credits?:  number;
  member_count?:  number;
}

export interface OrgMember {
  id:               string;
  org_id:           string;
  user_id:          string;
  tier_level:       number;
  role_label:       string | null;
  l_credits:        number;
  influence_score:  number;
  avg_quality_rating: number | null;
  total_ratings:    number;
  status:           string;
  joined_at:        string;
  // Enriched from users/persons table
  full_name?:       string;
  kutumb_id?:       string;
  phone?:           string;
}

export interface CreateOrgPayload {
  name:            string;
  slug?:           string;
  description?:    string;
  framework_type:  string;
  tier1_alias:     string;
  tier2_alias:     string;
  tier3_alias:     string;
  tier4_alias:     string;
  tier5_alias:     string;
  is_tier2_active: boolean;
  is_tier3_active: boolean;
  is_tier4_active: boolean;
  currency_name:   string;
  currency_emoji:  string;
}

export interface InvitePayload {
  target_kutumb_id?: string;
  target_tier:       number;
  expires_in_days?:  number;
  max_uses?:         number;
}

export interface InviteResult {
  invite_code: string;
  invite_url:  string;
  target_tier: number;
  max_uses:    number | null;
  expires_at:  string | null;
}

export interface EnquiryPayload {
  contact_name:     string;
  contact_email:    string;
  contact_phone?:   string;
  org_name:         string;
  framework_type:   string;
  org_description?: string;
  expected_members?: number;
}

/* ── API calls ── */

export const orgApi = {
  /** Submit a Kutumb Pro access enquiry (no auth required but auth is forwarded if present) */
  enquire: (payload: EnquiryPayload) =>
    apiFetch<{ id: string; message: string }>('/api/orgs/enquire', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** Create a new org (requires kutumb_pro=true on the user) */
  create: (payload: CreateOrgPayload) =>
    apiFetch<OrgSummary>('/api/orgs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** List orgs the current user belongs to */
  myOrgs: () => apiFetch<OrgSummary[]>('/api/orgs/my'),

  /** Get org details by slug */
  get: (slug: string) => apiFetch<OrgSummary>(`/api/orgs/${slug}`),

  /** List members of an org */
  members: (slug: string) => apiFetch<OrgMember[]>(`/api/orgs/${slug}/members`),

  /** Create an invite (targeted or open) */
  invite: (slug: string, payload: InvitePayload) =>
    apiFetch<InviteResult>(`/api/orgs/${slug}/invite`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** Join using an invite code */
  join: (code: string) =>
    apiFetch<{ message: string; org_slug: string }>(`/api/orgs/join/${code}`, {
      method: 'POST',
    }),
};
