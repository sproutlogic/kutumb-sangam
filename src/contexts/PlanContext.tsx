import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  PlanId, EntitlementKey, plans,
  defaultPricingConfig,
  type PricingConfig,
} from '@/config/packages.config';
import { useTree } from '@/contexts/TreeContext';
import { computeTreeDepth } from '@/engine/scoring';
import { BETA_ALL_ACCESS, BETA_DEFAULT_PLAN } from '@/config/featureFlags';
import { getApiBaseUrl } from '@/services/api';

interface PlanContextType {
  planId: PlanId;
  setPlanId: (id: PlanId) => void;
  hasEntitlement: (feature: EntitlementKey) => boolean;
  plan: typeof plans[PlanId];
  membersUsed: number;
  generationsUsed: number;
  /** Live pricing config from server (or compile-time defaults while loading). */
  pricingConfig: PricingConfig;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

/** Fetch live pricing from backend once at app start. Public endpoint — no auth needed. */
async function fetchPricingConfig(): Promise<PricingConfig> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/admin/pricing-config`);
    if (!res.ok) return defaultPricingConfig;
    return (await res.json()) as PricingConfig;
  } catch {
    return defaultPricingConfig;
  }
}

export const PlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [planId, setPlanId] = useState<PlanId>(BETA_ALL_ACCESS ? BETA_DEFAULT_PLAN : 'beej');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(defaultPricingConfig);

  useEffect(() => {
    fetchPricingConfig().then(setPricingConfig);
  }, []);

  // Outer provider gives a complete (tree-unaware) value immediately so
  // consumers like Onboarding never get undefined during HMR reloads.
  const runtimeLimits = pricingConfig.plans[planId];
  const outerValue: PlanContextType = {
    planId,
    setPlanId,
    hasEntitlement: (feature) => (BETA_ALL_ACCESS ? true : (runtimeLimits?.entitlements[feature] ?? plans[planId].entitlements[feature])),
    plan: runtimeLimits ? { ...plans[planId], ...runtimeLimits } : plans[planId],
    membersUsed: 0,
    generationsUsed: 0,
    pricingConfig,
  };

  return (
    <PlanContext.Provider value={outerValue}>
      <PlanInner planId={planId} setPlanId={setPlanId} pricingConfig={pricingConfig}>
        {children}
      </PlanInner>
    </PlanContext.Provider>
  );
};

const PlanInner: React.FC<{
  planId: PlanId;
  setPlanId: (id: PlanId) => void;
  pricingConfig: PricingConfig;
  children: React.ReactNode;
}> = ({ planId, setPlanId, pricingConfig, children }) => {
  const tree = useTreeSafe();

  const membersUsed    = tree ? tree.state.nodes.length : 0;
  const generationsUsed = tree ? computeTreeDepth(tree.state.nodes) : 0;

  // Merge runtime limits over the static plan config (keeps nameKey/descKey/id from static)
  const runtimeLimits = pricingConfig.plans[planId];
  const effectivePlan = runtimeLimits
    ? { ...plans[planId], ...runtimeLimits }
    : plans[planId];

  const hasEntitlement = (feature: EntitlementKey): boolean => {
    if (BETA_ALL_ACCESS) return true;
    return runtimeLimits?.entitlements[feature] ?? plans[planId].entitlements[feature];
  };

  const value: PlanContextType = {
    planId,
    setPlanId,
    hasEntitlement,
    plan: effectivePlan,
    membersUsed,
    generationsUsed,
    pricingConfig,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
};

function useTreeSafe() {
  try {
    return useTree();
  } catch {
    return null;
  }
}

export const usePlan = () => {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
};
