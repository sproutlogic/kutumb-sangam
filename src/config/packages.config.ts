export type PlanId = 'beej' | 'ankur' | 'vriksh' | 'vansh';

export type EntitlementKey =
  | 'culturalFields'
  | 'discovery'
  | 'connectionChains'
  | 'panditVerification'
  | 'matrimony'
  | 'sosAlerts'
  | 'treeAnnounce';

export interface PlanConfig {
  id: PlanId;
  nameKey: string;
  descKey: string;
  /** Annual price in INR (0 = free) */
  price: number;
  /** Pre-launch offer price in INR; null = no offer active */
  preLaunchPrice: number | null;
  /** Whether the pre-launch offer is currently active */
  isPreLaunch: boolean;
  maxNodes: number;
  generationCap: number;
  entitlements: Record<EntitlementKey, boolean>;
}

export const plans: Record<PlanId, PlanConfig> = {
  beej: {
    id: 'beej',
    nameKey: 'planBeej',
    descKey: 'planBeejDesc',
    price: 0,
    preLaunchPrice: null,
    isPreLaunch: false,
    maxNodes: 15,
    generationCap: 3,
    entitlements: {
      culturalFields: false,
      discovery: false,
      connectionChains: false,
      panditVerification: false,
      matrimony: false,
      sosAlerts: false,
      treeAnnounce: false,
    },
  },
  ankur: {
    id: 'ankur',
    nameKey: 'planAnkur',
    descKey: 'planAnkurDesc',
    price: 2100,
    preLaunchPrice: 999,
    isPreLaunch: true,
    maxNodes: 100,
    generationCap: 7,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: false,
      panditVerification: false,
      matrimony: false,
      sosAlerts: false,
      treeAnnounce: false,
    },
  },
  vriksh: {
    id: 'vriksh',
    nameKey: 'planVriksh',
    descKey: 'planVrikshDesc',
    price: 4900,
    preLaunchPrice: null,
    isPreLaunch: false,
    maxNodes: 500,
    generationCap: 15,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: true,
      panditVerification: true,
      matrimony: false,
      sosAlerts: true,
      treeAnnounce: false,
    },
  },
  vansh: {
    id: 'vansh',
    nameKey: 'planVansh',
    descKey: 'planVanshDesc',
    price: 7900,
    preLaunchPrice: null,
    isPreLaunch: false,
    maxNodes: 1000,
    generationCap: 25,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: true,
      panditVerification: true,
      matrimony: true,
      sosAlerts: true,
      treeAnnounce: true,
    },
  },
};

export const planOrder: PlanId[] = ['beej', 'ankur', 'vriksh', 'vansh'];

export function hasEntitlement(planId: PlanId, feature: EntitlementKey): boolean {
  return plans[planId]?.entitlements[feature] ?? false;
}

// ─── Runtime Pricing Config ──────────────────────────────────────────────────
// Stored in the backend (GET/PUT /api/admin/pricing-config).
// Superadmin can change any value without a code deploy.
// Falls back to `defaultPricingConfig` when the endpoint is unreachable.

export interface PlanLimits {
  /** Annual price in INR; 0 = free */
  price:           number;
  /** Pre-launch offer price; null = no offer */
  preLaunchPrice?: number | null;
  /** Toggle the pre-launch offer on/off */
  isPreLaunch?:    boolean;
  maxNodes:        number;
  generationCap:   number;
  entitlements:    Record<EntitlementKey, boolean>;
}

export interface MatrimonyPrices {
  compatibilityUnlock:   number;
  photoUnlock:           number;
  kundaliReview:         number;
  gotraConsultation:     number;
  fullFamilyOnboarding:  number;
  secondPanditOpinion:   number;
}

export interface PanditDefaultFees {
  kundaliMilanReview:   number;
  gotraConsultation:    number;
  fullFamilyOnboarding: number;
}

export interface PricingConfig {
  plans:          Record<PlanId, PlanLimits>;
  matrimony:      MatrimonyPrices;
  panditDefaults: PanditDefaultFees;
}

export const defaultPricingConfig: PricingConfig = {
  plans: {
    beej: {
      price: 0, preLaunchPrice: null, isPreLaunch: false,
      maxNodes: 15, generationCap: 3,
      entitlements: plans.beej.entitlements,
    },
    ankur: {
      price: 2100, preLaunchPrice: 999, isPreLaunch: true,
      maxNodes: 100, generationCap: 7,
      entitlements: plans.ankur.entitlements,
    },
    vriksh: {
      price: 4900, preLaunchPrice: null, isPreLaunch: false,
      maxNodes: 500, generationCap: 15,
      entitlements: plans.vriksh.entitlements,
    },
    vansh: {
      price: 7900, preLaunchPrice: null, isPreLaunch: false,
      maxNodes: 1000, generationCap: 25,
      entitlements: plans.vansh.entitlements,
    },
  },
  matrimony: {
    compatibilityUnlock:  101,
    photoUnlock:          151,
    kundaliReview:        501,
    gotraConsultation:    251,
    fullFamilyOnboarding: 2500,
    secondPanditOpinion:  251,
  },
  panditDefaults: {
    kundaliMilanReview:   501,
    gotraConsultation:    251,
    fullFamilyOnboarding: 2500,
  },
};
