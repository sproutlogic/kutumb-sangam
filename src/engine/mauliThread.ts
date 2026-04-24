/**
 * Mauli Thread Score Engine — Kutumb Map
 *
 * Computes a 0-100 cultural-heritage compatibility score for two potential
 * matrimony matches. Uses Kutumb Map's native TreeNode + MatrimonyProfile
 * types — no legacy LIVV types.
 *
 * Score composition (per matrimony.txt spec):
 *   Horizon proximity   30%  — BFS hops on the family graph (2-5 ideal)
 *   Gotra compatibility 25%  — Primary + extended Gotra network check
 *   Geographic origin   20%  — moolNiwas / ancestralPlace match
 *   Pandit verification 15%  — verificationTier on the TreeNode
 *   Community endorsement 10% — future: community body endorsement count
 *
 * Combined Match Score = MauliThread × 60% + Sanskriti × 40%
 */

import type { TreeNode, TreeEdge, MatrimonyProfile } from './types';
import { buildAdjacencyList, bfsDistance } from './graphUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GotraConflict = 'clear' | 'warning' | 'conflict';

export interface MauliThreadBreakdown {
  horizonScore:    number;   // 0–30
  bloodlineScore:  number;   // 0–25
  geoScore:        number;   // 0–20
  stewardScore:    number;   // 0–15
  communityScore:  number;   // 0–10
  total:           number;   // 0–100
  gotraConflict:   GotraConflict;
  surnameConflict: boolean;
  horizonDistance: number;
}

export interface MatchScore {
  mauliThread: number;          // 0–100
  sanskriti:   number;          // 0–100 (normalised from raw 0–36)
  combined:    number;          // 0–100
  breakdown:   MauliThreadBreakdown;
}

/**
 * A scoring profile pairs the TreeNode (identity + tree position) with the
 * MatrimonyProfile (Gotra, Sanskriti questionnaire answers).
 */
export interface ScoringProfile {
  node:      TreeNode;
  matrimony: MatrimonyProfile;
}

// ─── Region groupings ────────────────────────────────────────────────────────

const REGION_GROUPS: Record<string, string> = {
  // North India
  punjab: 'north', haryana: 'north', delhi: 'north', 'new delhi': 'north',
  'uttar pradesh': 'north', up: 'north', 'u.p.': 'north',
  'himachal pradesh': 'north', hp: 'north',
  uttarakhand: 'north', rajasthan: 'north', rj: 'north',
  // West India
  gujarat: 'west', gj: 'west', maharashtra: 'west', mh: 'west', goa: 'west',
  // East India
  'west bengal': 'east', wb: 'east', odisha: 'east', bihar: 'east',
  jharkhand: 'east', assam: 'east',
  // South India
  'tamil nadu': 'south', tn: 'south', kerala: 'south', karnataka: 'south',
  'andhra pradesh': 'south', ap: 'south', telangana: 'south',
  // Central India
  'madhya pradesh': 'central', mp: 'central', 'm.p.': 'central',
  chhattisgarh: 'central',
  // NRI
  uk: 'nri_uk', 'united kingdom': 'nri_uk', england: 'nri_uk',
  usa: 'nri_us', 'united states': 'nri_us', america: 'nri_us',
  canada: 'nri_ca', australia: 'nri_au',
  uae: 'nri_gulf', dubai: 'nri_gulf', gulf: 'nri_gulf', qatar: 'nri_gulf',
};

function normalizeRegion(r: string): string {
  return REGION_GROUPS[r.trim().toLowerCase()] ?? r.trim().toLowerCase();
}

// ─── Gotra conflict detection ────────────────────────────────────────────────

/**
 * Checks the full Gotra network of both parties.
 *
 * 'conflict' — same primary Gotra (Sagotra vivah prohibited)
 * 'warning'  — extended network overlap, or a Gotra is unknown
 * 'clear'    — no overlap detected
 */
export function detectGotraConflict(
  a: MatrimonyProfile,
  b: MatrimonyProfile,
): GotraConflict {
  const norm = (s?: string) => s?.trim().toLowerCase() ?? '';

  const primaryA = norm(a.ownGotra);
  const primaryB = norm(b.ownGotra);

  if (!primaryA || !primaryB) return 'warning';
  if (primaryA === primaryB) return 'conflict';

  const extA = [a.dadisGotra, a.nanisGotra, a.mausisGotra, a.buasGotra, a.mothersGotra]
    .map(norm).filter(Boolean);
  const extB = [b.dadisGotra, b.nanisGotra, b.mausisGotra, b.buasGotra, b.mothersGotra]
    .map(norm).filter(Boolean);

  if (extB.includes(primaryA) || extA.includes(primaryB)) return 'warning';
  if (extA.some(g => extB.includes(g))) return 'warning';

  return 'clear';
}

/**
 * Checks surname avoidance lists declared by each party.
 * Returns true if a conflict is found.
 */
export function detectSurnameConflict(
  a: MatrimonyProfile,
  b: MatrimonyProfile,
  nodeA: TreeNode,
  nodeB: TreeNode,
): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const avoidA = (a.surnamesToAvoid ?? []).map(norm);
  const avoidB = (b.surnamesToAvoid ?? []).map(norm);
  const surnameA = norm(a.familySurname || nodeA.surname || '');
  const surnameB = norm(b.familySurname || nodeB.surname || '');
  return (surnameA && avoidB.includes(surnameA)) || (surnameB && avoidA.includes(surnameB));
}

// ─── Generation depth gate ────────────────────────────────────────────────────

/**
 * Maps the user's declared generationAvoidance to a minimum required hop count.
 * Families within the avoided generation band should not match.
 *
 * Family graph hops approximate generational distance:
 *   3 gen avoidance → block if distance ≤ 6 hops
 *   5 gen avoidance → block if distance ≤ 10 hops
 *   7 gen avoidance → block if distance ≤ 14 hops
 */
export function minHopsForAvoidance(
  avoidance: MatrimonyProfile['generationAvoidance'],
): number {
  switch (avoidance) {
    case '3': return 6;
    case '5': return 10;
    case '7': return 14;
    default:  return 0;
  }
}

// ─── Component scorers ───────────────────────────────────────────────────────

function horizonScore(distance: number): number {
  if (!isFinite(distance) || distance <= 1) return 0;
  if (distance <= 5) return 30;   // ideal 2-5 hops
  if (distance <= 7) return 15;   // extended family — valid
  return 5;                        // culturally distant
}

function bloodlineScore(conflict: GotraConflict): number {
  if (conflict === 'clear')    return 25;
  if (conflict === 'warning')  return 12;
  return 0;
}

function geoScore(nodeA: TreeNode, nodeB: TreeNode): number {
  const regionA = nodeA.moolNiwas || nodeA.ancestralPlace || '';
  const regionB = nodeB.moolNiwas || nodeB.ancestralPlace || '';
  if (!regionA || !regionB) return 8;

  const la = regionA.trim().toLowerCase();
  const lb = regionB.trim().toLowerCase();
  if (la === lb) return 20;

  const ga = normalizeRegion(regionA);
  const gb = normalizeRegion(regionB);
  if (ga === gb) return 12;

  return 0;
}

function stewardScore(nodeA: TreeNode, nodeB: TreeNode): number {
  const isVerified = (n: TreeNode) =>
    n.verificationTier === 'expert-verified' || n.verificationTier === 'community-endorsed';
  const both = isVerified(nodeA) && isVerified(nodeB);
  const one  = isVerified(nodeA) || isVerified(nodeB);
  if (both) return 15;
  if (one)  return 8;
  return 0;
}

function communityScore(nodeA: TreeNode, nodeB: TreeNode): number {
  // community-endorsed tier on either node earns community points
  const pts = (n: TreeNode) => n.verificationTier === 'community-endorsed' ? 3 : 0;
  const total = pts(nodeA) + pts(nodeB);
  if (total >= 5) return 10;
  if (total >= 3) return 7;
  if (total >= 1) return 4;
  return 0;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Compute the full Mauli Thread breakdown for two ScoringProfiles.
 *
 * Pass `precomputedDistance` if BFS was already run (e.g. from Radar results)
 * to avoid running it twice.
 */
export function computeMauliThreadScore(
  a: ScoringProfile,
  b: ScoringProfile,
  nodes: TreeNode[],
  edges: TreeEdge[],
  precomputedDistance?: number,
): MauliThreadBreakdown {
  const adj = buildAdjacencyList(nodes, edges);
  const horizonDistance = precomputedDistance
    ?? bfsDistance(a.node.id, b.node.id, adj);

  const gotraConflict   = detectGotraConflict(a.matrimony, b.matrimony);
  const surnameConflict = detectSurnameConflict(a.matrimony, b.matrimony, a.node, b.node);

  const h = horizonScore(horizonDistance);
  const bl = bloodlineScore(gotraConflict);
  const g = geoScore(a.node, b.node);
  const s = stewardScore(a.node, b.node);
  const c = communityScore(a.node, b.node);

  return {
    horizonScore:    h,
    bloodlineScore:  bl,
    geoScore:        g,
    stewardScore:    s,
    communityScore:  c,
    total:           h + bl + g + s + c,
    gotraConflict,
    surnameConflict,
    horizonDistance,
  };
}

/**
 * Full composite score — single entry point.
 *
 * @param sanskritiRaw  Raw Sanskriti (lifestyle) score 0-36 from the
 *                      Harmony Questionnaire answers. Pass 0 until that
 *                      questionnaire is implemented.
 */
export function computeFullMatchScore(
  a: ScoringProfile,
  b: ScoringProfile,
  nodes: TreeNode[],
  edges: TreeEdge[],
  sanskritiRaw: number,
  precomputedDistance?: number,
): MatchScore {
  const breakdown = computeMauliThreadScore(a, b, nodes, edges, precomputedDistance);
  const sanskriti = Math.min(100, Math.round((sanskritiRaw / 36) * 100));
  const combined  = Math.min(100, Math.round(breakdown.total * 0.6 + sanskriti * 0.4));

  return { mauliThread: breakdown.total, sanskriti, combined, breakdown };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const MAULI_LABEL     = 'Mauli Thread Score';
export const SANSKRITI_LABEL = 'Sanskriti Score';

export function matchLabel(score: number): string {
  if (score >= 85) return 'Exceptional Alignment';
  if (score >= 70) return 'Strong Resonance';
  if (score >= 55) return 'Good Compatibility';
  if (score >= 40) return 'Moderate Alignment';
  return 'Further Exploration Needed';
}

export function gotraConflictLabel(conflict: GotraConflict): string {
  switch (conflict) {
    case 'clear':    return '✅ Bloodline Clear';
    case 'warning':  return '⚠️ Extended Overlap — Consult Pandit';
    case 'conflict': return '❌ Sagotra — Cannot Proceed';
  }
}
