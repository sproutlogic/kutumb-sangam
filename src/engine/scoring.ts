import { TreeNode, TreeEdge } from './types';

/**
 * Compute Trust Score (0-100) based on verification status of nodes.
 */
export function computeTrustScore(nodes: TreeNode[]): number {
  if (nodes.length === 0) return 0;

  let score = 0;

  // 40% — Verification tier of nodes
  const verifiedCount = nodes.filter(n => n.verificationTier !== 'self-declared').length;
  const verificationRatio = nodes.length > 0 ? verifiedCount / nodes.length : 0;
  score += verificationRatio * 40;

  // 25% — Tree size (more nodes = more credible, cap at 20 nodes)
  const sizeFactor = Math.min(nodes.length / 20, 1);
  score += sizeFactor * 25;

  // 20% — All nodes have names filled
  const completeness = nodes.filter(n => n.name.trim().length > 0).length / nodes.length;
  score += completeness * 20;

  // 15% — No frozen/disputed nodes
  const healthyRatio = nodes.filter(n => n.status === 'active').length / nodes.length;
  score += healthyRatio * 15;

  return Math.round(score);
}

/**
 * Compute tree depth (max generation number).
 */
export function computeTreeDepth(nodes: TreeNode[]): number {
  if (nodes.length === 0) return 0;
  const gens = nodes.map(n => n.generation);
  const minG = Math.min(...gens);
  const maxG = Math.max(...gens);
  return maxG - minG + 1;
}

/**
 * Compute tree completion percentage.
 */
export function computeTreeCompletion(
  membersUsed: number,
  maxNodes: number,
  generationsUsed: number,
  generationCap: number
): number {
  const memberPct = Math.min(membersUsed / maxNodes, 1) * 60;
  const genPct = Math.min(generationsUsed / generationCap, 1) * 40;
  return Math.round(memberPct + genPct);
}

/**
 * Mauli Thread Score for matrimony compatibility.
 * Returns 0-100.
 */
export function computeMauliScore(
  familyA: { gotra: string; moolNiwas: string; depth: number; verified: boolean; endorsed: boolean },
  familyB: { gotra: string; moolNiwas: string; depth: number; verified: boolean; endorsed: boolean }
): number {
  let score = 0;

  // 30% — Horizon proximity (tree depth similarity)
  const depthDiff = Math.abs(familyA.depth - familyB.depth);
  const horizonScore = Math.max(0, 1 - depthDiff / 10);
  score += horizonScore * 30;

  // 25% — Gotra compatibility (must be DIFFERENT for compatibility)
  if (familyA.gotra && familyB.gotra) {
    if (familyA.gotra.toLowerCase() !== familyB.gotra.toLowerCase()) {
      score += 25;
    }
    // Same gotra = 0 points (traditionally incompatible)
  } else {
    score += 12.5; // Unknown, neutral
  }

  // 20% — Geographic origin proximity
  if (familyA.moolNiwas && familyB.moolNiwas) {
    if (familyA.moolNiwas.toLowerCase() === familyB.moolNiwas.toLowerCase()) {
      score += 20;
    } else {
      score += 5; // different but both provided
    }
  }

  // 15% — Pandit verification
  if (familyA.verified) score += 7.5;
  if (familyB.verified) score += 7.5;

  // 10% — Community endorsement
  if (familyA.endorsed) score += 5;
  if (familyB.endorsed) score += 5;

  return Math.round(score);
}
