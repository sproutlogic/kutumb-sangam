import { useState, useCallback, useEffect } from 'react';

type LabelsMap = Record<string, string>; // nodeId → personal label

const storageKey = (uid: string) => `kutumb_rlabels_${uid}`;

function loadFromStorage(uid: string): LabelsMap {
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Per-account personal labels for tree nodes.
 * Each user stores their own name for every node (e.g. "पिताजी", "बप्पा", "Chachu").
 * Backed by localStorage; wire setLabel to an API call when the backend table is ready.
 */
export function usePersonalLabels(userId: string | null | undefined) {
  const uid = userId ?? 'guest';

  const [labels, setLabels] = useState<LabelsMap>(() => loadFromStorage(uid));

  // Reload when user switches
  useEffect(() => {
    setLabels(loadFromStorage(uid));
  }, [uid]);

  const setLabel = useCallback(
    (nodeId: string, label: string) => {
      setLabels(prev => {
        const next = { ...prev, [nodeId]: label.trim() };
        localStorage.setItem(storageKey(uid), JSON.stringify(next));
        return next;
      });
      // TODO: POST /api/node-relation-labels { vansha_id, node_id, label } when backend table ready
    },
    [uid],
  );

  const getLabel = useCallback((nodeId: string): string => labels[nodeId] ?? '', [labels]);

  return { labels, setLabel, getLabel };
}
