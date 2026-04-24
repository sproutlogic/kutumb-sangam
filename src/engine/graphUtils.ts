import type { TreeNode, TreeEdge } from './types';

/**
 * Build an undirected adjacency list from explicit TreeEdge rows PLUS the
 * fatherNodeId / motherNodeId fields that Kutumb Map stores on each node.
 * This means the BFS works even when no explicit edge rows were loaded.
 */
export function buildAdjacencyList(
  nodes: TreeNode[],
  edges: TreeEdge[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);

  const link = (a: string, b: string) => {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  };

  for (const e of edges) link(e.from, e.to);

  for (const n of nodes) {
    if (n.fatherNodeId) link(n.id, n.fatherNodeId);
    if (n.motherNodeId) link(n.id, n.motherNodeId);
  }

  return adj;
}

/**
 * BFS: shortest hop count between two nodes.
 * Returns Infinity when no path exists (disconnected trees).
 */
export function bfsDistance(
  fromId: string,
  toId: string,
  adj: Map<string, string[]>,
): number {
  if (fromId === toId) return 0;
  const visited = new Set<string>([fromId]);
  const queue: [string, number][] = [[fromId, 0]];
  while (queue.length) {
    const [cur, depth] = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (nb === toId) return depth + 1;
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push([nb, depth + 1]);
      }
    }
  }
  return Infinity;
}

/**
 * BFS: full shortest path as an array of node IDs.
 * Returns null when no path exists.
 */
export function bfsPath(
  fromId: string,
  toId: string,
  adj: Map<string, string[]>,
): string[] | null {
  if (fromId === toId) return [fromId];
  const visited = new Set<string>([fromId]);
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
  while (queue.length) {
    const { id, path } = queue.shift()!;
    for (const nb of adj.get(id) ?? []) {
      if (nb === toId) return [...path, nb];
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push({ id: nb, path: [...path, nb] });
      }
    }
  }
  return null;
}
