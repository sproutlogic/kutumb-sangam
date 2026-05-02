import { useState, useCallback, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '@/services/api';

type LabelsMap = Record<string, string>; // nodeId → personal label

const cacheKey = (uid: string) => `kutumb_rlabels_${uid}`;

function readCache(uid: string): LabelsMap {
  try { return JSON.parse(localStorage.getItem(cacheKey(uid)) ?? '{}'); }
  catch { return {}; }
}

function writeCache(uid: string, map: LabelsMap) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(map)); }
  catch { /* storage full — non-fatal */ }
}

function getAccessToken(): string {
  try {
    const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
    for (const key of keys) {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string };
      if (parsed?.access_token) return parsed.access_token;
    }
  } catch { /* ignore */ }
  return '';
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Per-account personal relation labels.
 * Loads from the server on mount (keyed by vansha_id when provided).
 * Writes optimistically to localStorage + fires POST to backend.
 * Falls back gracefully when offline or unauthenticated.
 */
export function usePersonalLabels(
  userId: string | null | undefined,
  vanshaId?: string | null,
) {
  const uid = userId ?? 'guest';

  const [labels, setLabels] = useState<LabelsMap>(() => readCache(uid));
  const synced = useRef(false);

  // Load all labels from backend when vanshaId is known
  useEffect(() => {
    if (!vanshaId || !userId || synced.current) return;
    synced.current = true;

    apiFetch(`/api/node-relation-labels/${vanshaId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { labels?: LabelsMap } | null) => {
        if (!data?.labels) return;
        // Merge: server is source of truth; keep any local-only keys as fallback
        const merged: LabelsMap = { ...readCache(uid), ...data.labels };
        setLabels(merged);
        writeCache(uid, merged);
      })
      .catch(() => { /* offline — use cache */ });
  }, [userId, vanshaId, uid]);

  // Reset when user switches
  useEffect(() => {
    synced.current = false;
    setLabels(readCache(uid));
  }, [uid]);

  const setLabel = useCallback(
    (nodeId: string, label: string, labelVanshaId?: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;

      // Optimistic local update immediately
      setLabels(prev => {
        const next = { ...prev, [nodeId]: trimmed };
        writeCache(uid, next);
        return next;
      });

      // Persist to backend
      const vid = labelVanshaId ?? vanshaId;
      if (!userId || !vid) return;

      apiFetch('/api/node-relation-labels', {
        method: 'POST',
        body: JSON.stringify({ vansha_id: vid, node_id: nodeId, label: trimmed }),
      }).catch(() => { /* offline — localStorage already updated */ });
    },
    [uid, userId, vanshaId],
  );

  const removeLabel = useCallback(
    (nodeId: string) => {
      setLabels(prev => {
        const next = { ...prev };
        delete next[nodeId];
        writeCache(uid, next);
        return next;
      });

      if (!userId) return;
      apiFetch(`/api/node-relation-labels/${nodeId}`, { method: 'DELETE' })
        .catch(() => { /* offline — cache already cleared */ });
    },
    [uid, userId],
  );

  const getLabel = useCallback((nodeId: string): string => labels[nodeId] ?? '', [labels]);

  return { labels, setLabel, removeLabel, getLabel };
}
