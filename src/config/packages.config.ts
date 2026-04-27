export type PlanId = 'beej' | 'ankur' | 'vriksh' | 'vansh';

export type EntitlementKey =
  | 'culturalFields'
  | 'discovery'
  | 'connectionChains'
  | 'panditVerification'
  | 'matrimony'
  | 'sosAlerts'
  | 'treeAnnounce'
  | 'ecoScore'       // Prakriti Score card (Harit Vanshavali eco-index)
  | 'haritCircle';   // Harit Circle membership & SmartBin community

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
  /** Max nodes a user may select as SOS contacts (0 = not available) */
  sosNodeLimit: number;
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
    sosNodeLimit: 0,
    entitlements: {
      culturalFields: false,
      discovery: false,
      connectionChains: false,
      panditVerification: false,
      matrimony: false,
      sosAlerts: false,
      treeAnnounce: false,
      ecoScore: false,
      haritCircle: false,
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
    sosNodeLimit: 0,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: false,
      panditVerification: false,
      matrimony: false,
      sosAlerts: false,
      treeAnnounce: false,
      ecoScore: true,
      haritCircle: false,
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
    sosNodeLimit: 5,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: true,
      panditVerification: true,
      matrimony: false,
      sosAlerts: true,
      treeAnnounce: false,
      ecoScore: true,
      haritCircle: true,
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
    sosNodeLimit: 10,
    entitlements: {
      culturalFields: true,
      discovery: true,
      connectionChains: true,
      panditVerification: true,
      matrimony: true,
      sosAlerts: true,
      treeAnnounce: true,
      ecoScore: true,
      haritCircle: true,
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
  // Paryavaran Mitra eco-ceremony fees (gross INR; 20% platform fee applies)
  vrikshaPratishtha:    number;
  jalPuja:              number;
  ecoPledgeVerification:number;
  dharthiSandesh:       number;
  haritCircleMonthly:   number;
}

// ── Eco Service Packages ─────────────────────────────────────────────────────
// Superadmin can override price_paise and toggle is_active at runtime via
// PUT /api/admin/pricing-config without a code deploy.

export type ServicePackageId = 'taruvara' | 'dashavruksha' | 'jala_setu';

export interface ServicePackageConfig {
  /** Price in paise (₹1 = 100 paise); runtime override from platform_config */
  price_paise: number;
  is_active:   boolean;
}

/** Convenience: price in INR rupees (derived from price_paise) */
export function servicePackagePriceInr(cfg: ServicePackageConfig): number {
  return cfg.price_paise / 100;
}

export const defaultServicePackages: Record<ServicePackageId, ServicePackageConfig> = {
  taruvara:     { price_paise: 149900,  is_active: true },
  dashavruksha: { price_paise: 1199900, is_active: true },
  jala_setu:    { price_paise: 249900,  is_active: true },
};

export interface PricingConfig {
  plans:            Record<PlanId, PlanLimits>;
  matrimony:        MatrimonyPrices;
  panditDefaults:   PanditDefaultFees;
  /** Runtime-editable eco service package prices; keyed by ServicePackageId */
  service_packages?: Record<ServicePackageId, ServicePackageConfig>;
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
    kundaliMilanReview:    501,
    gotraConsultation:     251,
    fullFamilyOnboarding:  2500,
    vrikshaPratishtha:     999,
    jalPuja:               499,
    ecoPledgeVerification: 199,
    dharthiSandesh:        199,
    haritCircleMonthly:    500,
  },
  service_packages: defaultServicePackages,
};
