import { NODE_PRIVACY_LEVELS, type NodePrivacyLevel, type TreeEdge, type TreeNode } from "@/engine/types";

export type { NodePrivacyLevel } from "@/engine/types";
export { NODE_PRIVACY_LEVELS } from "@/engine/types";

export function migrateLegacyVisibility(raw: string | undefined): NodePrivacyLevel {
  const t = (raw ?? "").trim();
  if (NODE_PRIVACY_LEVELS.includes(t as NodePrivacyLevel)) return t as NodePrivacyLevel;
  if (t === "tree-only") return "parents";
  if (t === "private") return "private";
  if (t === "public") return "public";
  return "public";
}

/** Which privacy levels each plan may set (free tier is public-only). */
export function privacyLevelsForPlan(planId: string): NodePrivacyLevel[] {
  switch (planId) {
    case "beej":
      return ["public"];
    case "ankur":
      return ["public", "parents", "grandparents"];
    case "vriksh":
    case "vansh":
      return [...NODE_PRIVACY_LEVELS];
    default:
      return ["public"];
  }
}

export function normalizeNodePrivacy(node: TreeNode): TreeNode {
  return {
    ...node,
    visibility: migrateLegacyVisibility(node.visibility as string),
    privacyNodeIds: Array.isArray(node.privacyNodeIds) ? node.privacyNodeIds.slice(0, 5) : undefined,
  };
}

function parentIdsOf(childId: string, edges: TreeEdge[]): string[] {
  return edges
    .filter(
      (e) =>
        e.from === childId && ["father", "mother"].includes(e.relation.toLowerCase()),
    )
    .map((e) => e.to);
}

function childrenOf(parentId: string, edges: TreeEdge[]): string[] {
  return edges
    .filter(
      (e) =>
        e.to === parentId && ["father", "mother"].includes(e.relation.toLowerCase()),
    )
    .map((e) => e.from);
}

function ancestorsBfs(startId: string, edges: TreeEdge[], maxDepth: number): Set<string> {
  const out = new Set<string>();
  let frontier = [startId];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of parentIdsOf(id, edges)) {
        if (!out.has(p)) {
          out.add(p);
          next.push(p);
        }
      }
    }
    frontier = next;
    depth += 1;
  }
  return out;
}

/** Generations upward from `descendant` to `candidate` (0 = self, 1 = parent, …). */
function generationsToAncestor(
  descendantId: string,
  ancestorId: string,
  edges: TreeEdge[],
  maxGen: number,
): number {
  if (descendantId === ancestorId) return 0;
  const visited = new Set<string>();
  let frontier: { id: string; gen: number }[] = [{ id: descendantId, gen: 0 }];
  while (frontier.length) {
    const { id, gen } = frontier.shift()!;
    if (gen >= maxGen) continue;
    for (const p of parentIdsOf(id, edges)) {
      if (p === ancestorId) return gen + 1;
      if (visited.has(p)) continue;
      visited.add(p);
      frontier.push({ id: p, gen: gen + 1 });
    }
  }
  return -1;
}

/** Nodes the sender wants to include when sending an SOS (sender’s own scope). */
export function senderSosScope(
  senderId: string,
  level: NodePrivacyLevel,
  privacyNodeIds: string[] | undefined,
  nodes: TreeNode[],
  edges: TreeEdge[],
): Set<string> {
  const ids = new Set<string>();
  const allIds = nodes.map((n) => n.id).filter((id) => id !== senderId);

  switch (level) {
    case "private":
      return ids;
    case "parents": {
      for (const p of parentIdsOf(senderId, edges)) ids.add(p);
      return ids;
    }
    case "grandparents": {
      const a = ancestorsBfs(senderId, edges, 2);
      a.forEach((id) => ids.add(id));
      return ids;
    }
    case "tree_all_generations":
    case "public":
      allIds.forEach((id) => ids.add(id));
      return ids;
    case "custom_five_nodes": {
      for (const id of (privacyNodeIds ?? []).slice(0, 5)) {
        if (id !== senderId && allIds.includes(id)) ids.add(id);
      }
      return ids;
    }
    default:
      return ids;
  }
}

/** Whether `recipient` accepts an inbound SOS from `senderId` given their privacy. */
export function recipientAcceptsSos(
  recipient: TreeNode,
  senderId: string,
  edges: TreeEdge[],
): boolean {
  if (recipient.id === senderId) return false;
  const level = migrateLegacyVisibility(recipient.visibility as string);

  switch (level) {
    case "private":
      return false;
    case "public":
    case "tree_all_generations":
      return true;
    case "parents":
      return childrenOf(recipient.id, edges).includes(senderId);
    case "grandparents": {
      const g = generationsToAncestor(senderId, recipient.id, edges, 3);
      return g >= 1 && g <= 2;
    }
    case "custom_five_nodes": {
      const allow = recipient.privacyNodeIds ?? [];
      return allow.includes(senderId);
    }
    default:
      return true;
  }
}

/** Whether a viewer can see full node details under the node's privacy setting. */
export function canViewerSeeNodeDetails(
  node: TreeNode,
  viewerNodeId: string,
  edges: TreeEdge[],
): boolean {
  if (!viewerNodeId) return false;
  if (viewerNodeId === node.id || viewerNodeId === node.ownerId) return true;

  const level = migrateLegacyVisibility(node.visibility as string);
  switch (level) {
    case "private":
      return false;
    case "public":
    case "tree_all_generations":
      return true;
    case "parents":
      return childrenOf(node.id, edges).includes(viewerNodeId);
    case "grandparents": {
      const g = generationsToAncestor(viewerNodeId, node.id, edges, 3);
      return g >= 1 && g <= 2;
    }
    case "custom_five_nodes":
      return (node.privacyNodeIds ?? []).includes(viewerNodeId);
    default:
      return true;
  }
}

/** Recipients = sender scope ∩ recipients willing to hear from sender. */
export function resolveSosRecipients(
  senderId: string,
  nodes: TreeNode[],
  edges: TreeEdge[],
): { recipientIds: string[]; senderLevel: NodePrivacyLevel } {
  const sender = nodes.find((n) => n.id === senderId);
  if (!sender) return { recipientIds: [], senderLevel: "public" };
  const senderLevel = migrateLegacyVisibility(sender.visibility as string);
  const scope = senderSosScope(
    senderId,
    senderLevel,
    sender.privacyNodeIds,
    nodes,
    edges,
  );
  const out: string[] = [];
  for (const rid of scope) {
    const r = nodes.find((n) => n.id === rid);
    if (r && recipientAcceptsSos(r, senderId, edges)) out.push(rid);
  }
  return { recipientIds: out, senderLevel };
}
