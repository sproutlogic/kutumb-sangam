// Organisation framework templates — "Dignified Defaults"
// All names are 100 % editable by the leader after selection.
// No "Worker/Employee" language. Focus: Custodian, Pillar, Partner, Steward.

export type FrameworkType =
  | 'spiritual'
  | 'political'
  | 'ngo'
  | 'university'
  | 'rwa'
  | 'custom';

export interface OrgFramework {
  type:          FrameworkType;
  label:         string;
  emoji:         string;
  tagline:       string;
  tiers:         [string, string, string, string, string]; // Tier 1 → Tier 5
  currencyName:  string;
  currencyEmoji: string;
  exampleUse:    string;
}

export const ORG_FRAMEWORKS: Record<FrameworkType, OrgFramework> = {
  spiritual: {
    type:          'spiritual',
    label:         'Spiritual / Religious',
    emoji:         '🪔',
    tagline:       'Ashrams, temples, sects, spiritual orders',
    tiers:         ['Acharya', 'Pramukh', 'Adhikari', 'Sevak', 'Shishya'],
    currencyName:  'Punya',
    currencyEmoji: '🌸',
    exampleUse:    'Ashram service ledger, seva coordination',
  },
  political: {
    type:          'political',
    label:         'Political / Civic',
    emoji:         '🏛️',
    tagline:       'Parties, booths, civic bodies, constituency networks',
    tiers:         ['Adhyaksh', 'Margdarshak', 'Sanchalak', 'Sahyogi', 'Jan-Gan'],
    currencyName:  'Sankalp',
    currencyEmoji: '⚡',
    exampleUse:    'Booth-level outreach, grievance mapping',
  },
  ngo: {
    type:          'ngo',
    label:         'NGO / Social',
    emoji:         '🤝',
    tagline:       'Non-profits, welfare trusts, social movements',
    tiers:         ['Patron', 'Director', 'Lead', 'Associate', 'Partner'],
    currencyName:  'Seva',
    currencyEmoji: '💚',
    exampleUse:    'Volunteer hours, beneficiary support tracking',
  },
  university: {
    type:          'university',
    label:         'Educational',
    emoji:         '🎓',
    tagline:       'Universities, alumni bodies, student councils',
    tiers:         ['Chancellor', 'Dean', 'Fellow', 'Alumni', 'Scholar'],
    currencyName:  'Merit',
    currencyEmoji: '⭐',
    exampleUse:    'Mentorship network, alumni engagement',
  },
  rwa: {
    type:          'rwa',
    label:         'RWA / Housing',
    emoji:         '🏘️',
    tagline:       'Resident welfare, housing societies, local communities',
    tiers:         ['President', 'Secretary', 'Governor', 'Member', 'Resident'],
    currencyName:  'Unity',
    currencyEmoji: '🏡',
    exampleUse:    'Maintenance coordination, community services',
  },
  custom: {
    type:          'custom',
    label:         'Custom',
    emoji:         '✨',
    tagline:       'Define your own structure from scratch',
    tiers:         ['Custodian', 'Pillar', 'Steward', 'Partner', 'Member'],
    currencyName:  'Credit',
    currencyEmoji: '💫',
    exampleUse:    'Any organisation not covered above',
  },
};

export const FRAMEWORK_ORDER: FrameworkType[] = [
  'spiritual', 'political', 'ngo', 'university', 'rwa', 'custom',
];

// Tier index labels (always fixed positions 1–5)
export const TIER_LABELS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'] as const;

// Tier 1 and Tier 5 are always active; 2/3/4 are optional.
export const ALWAYS_ACTIVE_TIERS = new Set([1, 5]);
