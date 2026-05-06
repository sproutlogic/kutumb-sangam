/**
 * Tree-entitlement context — resolved limits + features for the current user.
 *
 * Distinct from PlanContext (which governs Paryavaran Mitra membership). This
 * one is specifically about tree visibility: gen_up / gen_down / max_nodes /
 * sachet unlocks / referral bonus. Consumed by TreeCanvasV2 and any UI that
 * gates tree features (matrimony bridge, PDF export, etc.).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchMyEntitlement, type Entitlement } from "@/services/entitlementApi";
import { useAuth } from "@/contexts/AuthContext";

interface EntitlementContextValue {
  entitlement: Entitlement | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  totalGenUp: number;
  totalGenDown: number;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used inside <EntitlementProvider>");
  return ctx;
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { appUser, loading: authLoading } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!appUser?.id) {
      setEntitlement(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyEntitlement();
      setEntitlement(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load entitlement";
      setError(msg);
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, [appUser?.id]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const hasFeature = useCallback(
    (key: string) => Boolean(entitlement?.features?.[key]),
    [entitlement],
  );

  const totalGenUp   = entitlement ? entitlement.gen_up   : 1;
  const totalGenDown = entitlement ? entitlement.gen_down : 1;

  const value: EntitlementContextValue = {
    entitlement,
    loading,
    error,
    refresh,
    hasFeature,
    totalGenUp,
    totalGenDown,
  };

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}
