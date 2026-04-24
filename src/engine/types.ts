export type VerificationTier = 'self-declared' | 'expert-verified' | 'community-endorsed';

/** Who may follow this node’s data / SOS scope (monetized by plan). */
export type NodePrivacyLevel =
  | 'private'
  | 'parents'
  | 'grandparents'
  | 'tree_all_generations'
  | 'custom_five_nodes'
  | 'public';

export const NODE_PRIVACY_LEVELS: readonly NodePrivacyLevel[] = [
  'private',
  'parents',
  'grandparents',
  'tree_all_generations',
  'custom_five_nodes',
  'public',
];
export type NodeStatus = 'active' | 'frozen' | 'sealed';
export type BorderStyle = 'solid' | 'dotted';

/** Marital union row from API (for layout: trunk from couple to children). */
export interface UnionRow {
  id: string;
  maleNodeId: string;
  femaleNodeId: string;
  /** Signed lineage band for this couple (matches backend `relative_gen_index` on unions). */
  relativeGenIndex?: number;
}

/** Required identity fields for self / onboarding (local tree). */
export interface SelfIdentityProfile {
  givenName: string;
  surname: string;
  dateOfBirth: string;
  ancestralPlace: string;
  currentResidence: string;
}

export interface TreeNode {
  id: string;
  name: string;
  /** Given / first name (optional until migrated from legacy `name` only). */
  givenName?: string;
  /** Family / surname */
  surname?: string;
  /** ISO date string YYYY-MM-DD when captured */
  dateOfBirth?: string;
  /** Ancestral / native place (pitri/mool) */
  ancestralPlace?: string;
  /** Current residence */
  currentResidence?: string;
  relation: string;
  gender: 'male' | 'female' | 'other';
  branch: string;
  gotra: string;
  moolNiwas: string;
  ownerId: string; // who controls this node
  createdBy: string;
  createdAt: number;
  verificationTier: VerificationTier;
  borderStyle: BorderStyle;
  status: NodeStatus;
  /** Signed lineage: negative = ancestors (roots at bottom), 0 = anchor, positive = progenies (upward). */
  generation: number;
  /** Who may follow this node’s data / SOS scope; legacy `tree-only` is migrated to `parents`. */
  visibility: NodePrivacyLevel | 'tree-only';
  /** When visibility is `custom_five_nodes`, up to 5 node ids that may receive alerts / see scope. */
  privacyNodeIds?: string[];
  /** Birth family vansha (matrimonial bridge); incoming wife → her paternal tree. */
  maidenVanshaId?: string | null;
  /** Birth / paternal vansha for incoming groom (son-in-law); opens his tree when set. */
  paternalVanshaId?: string | null;
  /** Parental couple (Union) this person belongs to; lineage attaches to the union, not one parent. */
  parentUnionId?: string | null;
  /** From API rows; used to hide duplicate parent→child edges when parent_union_id is missing. */
  fatherNodeId?: string | null;
  motherNodeId?: string | null;
  /** Server/local blank parent when the name was unknown at creation. */
  isPlaceholder?: boolean;
}

export interface MatrimonyProfile {
  optedIn: boolean;
  stage: number;
  searchingFor: 'myself' | 'son' | 'daughter' | 'familyMember';
  intent: 'open' | 'exploring';
  management: 'self' | 'parents' | 'joint' | 'elder';
  dietary: string;
  religiousPractice: string;
  languageAtHome: string;
  educationLevel: string;
  professionCategory: string;
  livingSituation: string;
  geographicPreference: string;
  horoscopeWillingness: string;
  generationAvoidance: '3' | '5' | '7' | 'askPandit' | 'notApplicable';
  ownGotra: string;
  mothersGotra: string;
  dadisGotra: string;
  nanisGotra: string;
  buasGotra: string;
  mausisGotra: string;
  surnamesToAvoid: string[];
  familySurname: string;
  kundaliData: {
    dob: string;
    timeOfBirth: string;
    timeKnown: 'exact' | 'approximate' | 'unknown';
    placeOfBirth: string;
    state: string;
    country: string;
    birthDetailsSource: string;
  };
}

export interface TreeEdge {
  from: string;
  to: string;
  relation: string;
}

export interface ChangeLogEntry {
  id: string;
  nodeId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  timestamp: number;
  reason: string;
}

export interface Dispute {
  id: string;
  nodeId: string;
  field: string;
  versionA: string;
  versionB: string;
  raisedBy: string;
  status: 'active' | 'resolved';
  evidence: string[];
  createdAt: number;
}

export type ActionType =
  | 'personal_edit'
  | 'factual_correction'
  | 'contested_fact'
  | 'missing_member'
  | 'manipulation'
  | 'succession'
  | 'matrimony_dispute'
  | 'verify-request';

export interface PendingAction {
  id: string;
  type: ActionType;
  nodeId: string;
  field: string;
  proposedValue: string;
  oldValue: string;
  submittedBy: string;
  approvals: string[];
  objections: string[];
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'forked';
}

export interface ActivityLogEntry {
  id: string;
  time: number;
  textKey: string;
  params: Record<string, string>;
}

export interface TreeState {
  nodes: TreeNode[];
  edges: TreeEdge[];
  /** Union rows for spouse couples + trunk layout (from remote tree API). */
  unionRows: UnionRow[];
  changeLog: ChangeLogEntry[];
  disputes: Dispute[];
  pendingActions: PendingAction[];
  activityLog: ActivityLogEntry[];
  currentUserId: string;
  treeName: string;
  matrimonyProfile: MatrimonyProfile | null;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
