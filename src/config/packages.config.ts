export type PlanId = 'beej' | 'ankur' | 'vriksh' | 'vansh';

export type EntitlementKey =
  | 'culturalFields'
  | 'discovery'
  | 'connectionChains'
  | 'panditVerification'
  | 'matrimony'
  /** GPS SOS alerts to family per privacy rules (Vriksh+). */
  | 'sosAlerts'
  /** Centre top-bar broadcast to whole tree (Vansh). */
  | 'treeAnnounce';

export interface PlanConfig {
  id: PlanId;
  nameKey: string; // i18n key
  descKey: string; // i18n key
  price: number; // INR per month, 0 = free
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
    price: 99,
    maxNodes: 50,
    generationCap: 5,
    entitlements: {
      culturalFields: true,
      discovery: false,
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
    price: 299,
    maxNodes: 200,
    generationCap: 10,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: false,
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
    price: 799,
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
  price:         number;  // INR/month; 0 = free
  maxNodes:      number;
  generationCap: number;
  entitlements:  Record<EntitlementKey, boolean>;
}

/** Per-transaction fees for the matrimony flow (per matrimony.txt). */
export interface MatrimonyPrices {
  /** Stage 2 — compatibility score unlock */
  compatibilityUnlock:   number;   // ₹101
  /** Stage 4 — photo visibility unlock */
  photoUnlock:           number;   // ₹151
  /** Stage 5 — Kundali review by Pandit */
  kundaliReview:         number;   // ₹501
  /** Gotra consultation with Pandit */
  gotraConsultation:     number;   // ₹251
  /** Full family onboarding with Pandit */
  fullFamilyOnboarding:  number;   // ₹2500
  /** Second Pandit opinion request */
  secondPanditOpinion:   number;   // ₹251
}

/** Pandit default fee schedule (shown on Pandit badge; each Pandit can override). */
export interface PanditDefaultFees {
  kundaliMilanReview:   number;   // ₹501
  gotraConsultation:    number;   // ₹251
  fullFamilyOnboarding: number;   // ₹2500
}

export interface PricingConfig {
  plans:         Record<PlanId, PlanLimits>;
  matrimony:     MatrimonyPrices;
  panditDefaults: PanditDefaultFees;
}

export const defaultPricingConfig: PricingConfig = {
  plans: {
    beej:  { price: 0,   maxNodes: 15,   generationCap: 3,  entitlements: plans.beej.entitlements },
    ankur: { price: 99,  maxNodes: 50,   generationCap: 5,  entitlements: plans.ankur.entitlements },
    vriksh:{ price: 299, maxNodes: 200,  generationCap: 10, entitlements: plans.vriksh.entitlements },
    vansh: { price: 799, maxNodes: 1000, generationCap: 25, entitlements: plans.vansh.entitlements },
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
