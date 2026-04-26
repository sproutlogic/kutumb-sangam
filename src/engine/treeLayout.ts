import type { TreeEdge, TreeNode, UnionRow } from "@/engine/types";

/** Loose UUID/string compare (hyphen variants). Kept here so layout does not import from vrukshaRelations. */
function idEqNodeIds(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  return x.replace(/-/g, "") === y.replace(/-/g, "");
}

/** Children of a parental union: `parent_union_id` or father+mother ids matching the union pair. */
export function nodesForParentalUnionRow(nodes: readonly TreeNode[], u: UnionRow): TreeNode[] {
  return nodes.filter((n) => {
    const pu = n.parentUnionId != null ? String(n.parentUnionId).trim() : "";
    if (pu !== "" && idEqNodeIds(pu, u.id)) return true;
    const fd = n.fatherNodeId != null ? String(n.fatherNodeId).trim() : "";
    const md = n.motherNodeId != null ? String(n.motherNodeId).trim() : "";
    if (!fd || !md) return false;
    return (
      (idEqNodeIds(fd, u.maleNodeId) && idEqNodeIds(md, u.femaleNodeId)) ||
      (idEqNodeIds(fd, u.femaleNodeId) && idEqNodeIds(md, u.maleNodeId))
    );
  });
}

/**
 * Vertical spacing for layout:
 *   rawY = -(layoutGeneration × TREE_VERTICAL_SPACING)
 * Negative layoutGeneration (ancestors) → positive rawY → bottom of SVG.
 * Positive layoutGeneration (progenies) → negative rawY → top of SVG.
 */
/** Vertical gap between generation bands (labels sit under nodes; keep ≥ node diameter + text). */
export const TREE_VERTICAL_SPACING = 104;

const PADDING_Y = 52;
const PADDING_X = 56;
/** Horizontal spacing between sibling centers from the parental union midpoint. */
const CHILD_SPREAD = 68;
/** Wider spread used when a repositioned child is also part of a couple (prevents frame overlap). */
const COUPLE_CHILD_SPREAD = 92;
/** Minimum horizontal gap (square / triangle can be wider than circle diameter). */
const MIN_SLOT_CENTER_GAP = 68;
/** Legacy floor; real width scales with how many people share a generation row. */
const MIN_LAYOUT_CANVAS_WIDTH = 400;

/** Center distance between spouses — inner shapes ~4 px gap, outer rings nearly touching. */
export const SPOUSE_SIDE_OFFSET = 40;

/**
 * Maps stored `node.generation` to a signed layout index for Y = -(g × spacing).
 * - API / signed model: negative = ancestors, 0 = anchor, positive = progenies.
 * - Legacy local-only trees: non‑negative with 1,2,… = ancestor depth → use -depth.
 * - Progeny (son/daughter) with positive stored indices stay positive.
 */
export function toLineageGeneration(node: TreeNode, allNodes: TreeNode[]): number {
  const g = node.generation;

  if (allNodes.some((x) => x.generation < 0)) {
    return g;
  }

  const isProgeny = /(son|daughter|adopted)/i.test(node.relation);

  if (allNodes.every((x) => x.generation >= 0)) {
    if (g === 0) return 0;
    if (g > 0 && isProgeny) {
      return g;
    }
    if (g > 0) {
      return -g;
    }
  }

  return g;
}

/**
 * Band index used for layout. SVG y increases downward: more negative lineage index → larger y (bottom / roots).
 * When any node uses signed `generation` (negative ancestors), we trust `toLineageGeneration` for Y so multi-step descent
 * (e.g. grandson at +2) is not collapsed to `parent_union.relative_gen_index + 1`.
 * Legacy all-non-negative trees still use union hints where helpful.
 */
export function layoutLineageGeneration(
  node: TreeNode,
  allNodes: TreeNode[],
  unionRows: UnionRow[],
): number {
  const treeUsesSignedGenerations = allNodes.some((x) => x.generation < 0);

  if (treeUsesSignedGenerations) {
    return toLineageGeneration(node, allNodes);
  }

  const spouseUnions = unionRows.filter(
    (u) =>
      u.relativeGenIndex !== undefined &&
      (u.maleNodeId === node.id || u.femaleNodeId === node.id),
  );
  if (spouseUnions.length > 0) {
    return Math.min(...spouseUnions.map((u) => u.relativeGenIndex!));
  }

  const pu = node.parentUnionId?.trim();
  if (pu) {
    const u = unionRows.find((r) => r.id === pu);
    if (u?.relativeGenIndex !== undefined) {
      const impliedChild = u.relativeGenIndex + 1;
      const stored = toLineageGeneration(node, allNodes);
      return stored >= impliedChild ? stored : impliedChild;
    }
  }

  return toLineageGeneration(node, allNodes);
}

export interface PositionedTreeNode extends TreeNode {
  x: number;
  y: number;
}

type LayoutUnit =
  | { kind: "couple"; male: TreeNode; female: TreeNode }
  | { kind: "siblings"; nodes: TreeNode[] }
  | { kind: "single"; node: TreeNode };

function isSpouseEdge(e: TreeEdge): boolean {
  const rel = e.relation.trim().toLowerCase();
  return rel === "spouse" || rel === "wife" || rel === "husband";
}

function unitMinTime(u: LayoutUnit): number {
  if (u.kind === "couple") return Math.min(u.male.createdAt, u.female.createdAt);
  if (u.kind === "siblings") return Math.min(...u.nodes.map((n) => n.createdAt));
  return u.node.createdAt;
}

/**
 * One horizontal band: unions (couples) as paired nodes; siblings share parent_union_id
 * ordered eldest → youngest (left → right) by createdAt.
 */
function buildLayoutUnitsForBand(
  band: TreeNode[],
  edges: TreeEdge[],
): LayoutUnit[] {
  const used = new Set<string>();
  const units: LayoutUnit[] = [];

  const spouseEdges = edges.filter(isSpouseEdge);
  for (const e of spouseEdges) {
    const na = band.find((n) => n.id === e.from);
    const nb = band.find((n) => n.id === e.to);
    if (!na || !nb || used.has(na.id) || used.has(nb.id)) continue;
    used.add(na.id);
    used.add(nb.id);
    let male: TreeNode;
    let female: TreeNode;
    if (na.gender === "male" && nb.gender === "female") {
      male = na;
      female = nb;
    } else if (nb.gender === "male" && na.gender === "female") {
      male = nb;
      female = na;
    } else {
      male = na;
      female = nb;
    }
    units.push({ kind: "couple", male, female });
  }

  const rest = band.filter((n) => !used.has(n.id));
  const withPu = rest.filter((n) => n.parentUnionId != null && String(n.parentUnionId).trim() !== "");
  const withoutPu = rest.filter((n) => !n.parentUnionId || String(n.parentUnionId).trim() === "");

  for (const n of withoutPu) {
    units.push({ kind: "single", node: n });
  }

  const puMap = new Map<string, TreeNode[]>();
  for (const n of withPu) {
    const k = String(n.parentUnionId).trim();
    if (!puMap.has(k)) puMap.set(k, []);
    puMap.get(k)!.push(n);
  }
  for (const [, group] of puMap) {
    if (group.length >= 2) {
      group.sort((a, b) => a.createdAt - b.createdAt);
      units.push({ kind: "siblings", nodes: group });
    } else if (group.length === 1) {
      units.push({ kind: "single", node: group[0] });
    }
  }

  units.sort((a, b) => unitMinTime(a) - unitMinTime(b));
  return units;
}

/**
 * After the first pass, snap sibling X positions to the midpoint between their parents in the union.
 * When a repositioned child is also part of their own spousal couple, their spouse is dragged along
 * so couple spacing stays uniform.
 */
function repositionChildrenByUnion(
  positioned: PositionedTreeNode[],
  unionRows: UnionRow[],
): void {
  if (unionRows.length === 0) return;

  const byId = new Map(positioned.map((n) => [n.id, n]));
  const byIdLoose = new Map<string, PositionedTreeNode>();
  for (const n of positioned) {
    byIdLoose.set(n.id, n);
    byIdLoose.set(normalizeUuidKey(n.id), n);
  }

  // Map each node to the union where they appear as male or female (their own couple).
  const nodeOwnUnion = new Map<string, { union: UnionRow; role: "male" | "female" }>();
  for (const u of unionRows) {
    if (u.maleNodeId) {
      nodeOwnUnion.set(u.maleNodeId, { union: u, role: "male" });
      nodeOwnUnion.set(normalizeUuidKey(u.maleNodeId), { union: u, role: "male" });
    }
    if (u.femaleNodeId) {
      nodeOwnUnion.set(u.femaleNodeId, { union: u, role: "female" });
      nodeOwnUnion.set(normalizeUuidKey(u.femaleNodeId), { union: u, role: "female" });
    }
  }

  function updateNode(id: string, newX: number): void {
    const node = byId.get(id) ?? byIdLoose.get(normalizeUuidKey(id));
    if (!node) return;
    const updated: PositionedTreeNode = { ...node, x: newX };
    byId.set(id, updated);
    byIdLoose.set(id, updated);
    byIdLoose.set(normalizeUuidKey(id), updated);
    const idx = positioned.findIndex((p) => p.id === id);
    if (idx >= 0) positioned[idx] = updated;
  }

  // Process unions oldest-generation first so ancestor couple positions are stable when
  // descendant children are repositioned.
  const sortedUnions = [...unionRows].sort(
    (a, b) => (a.relativeGenIndex ?? 0) - (b.relativeGenIndex ?? 0),
  );

  for (const u of sortedUnions) {
    const group = nodesForParentalUnionRow(positioned, u);
    if (group.length === 0) continue;

    const m = byId.get(u.maleNodeId) ?? byIdLoose.get(normalizeUuidKey(u.maleNodeId));
    const f = byId.get(u.femaleNodeId) ?? byIdLoose.get(normalizeUuidKey(u.femaleNodeId));
    if (!m || !f) continue;

    const cx = (m.x + f.x) / 2;
    const k = group.length;
    group.sort((a, b) => a.createdAt - b.createdAt);

    // Use wider spread when any child is also a spouse (prevents couple-frame overlap).
    const anyChildIsSpouse = group.some(
      (n) => nodeOwnUnion.has(n.id) || nodeOwnUnion.has(normalizeUuidKey(n.id)),
    );
    const spread = anyChildIsSpouse ? COUPLE_CHILD_SPREAD : CHILD_SPREAD;

    for (let i = 0; i < k; i++) {
      const node = group[i];
      const slotX = cx + (i - (k - 1) / 2) * spread; // couple-center for this slot

      const ownPair =
        nodeOwnUnion.get(node.id) ?? nodeOwnUnion.get(normalizeUuidKey(node.id));

      if (ownPair) {
        const { union: ou, role } = ownPair;
        const spouseId = role === "male" ? ou.femaleNodeId : ou.maleNodeId;
        const spouseNode = byId.get(spouseId) ?? byIdLoose.get(normalizeUuidKey(spouseId));

        if (spouseNode && Math.abs(spouseNode.y - node.y) < 1) {
          // Drag the whole couple to slotX as couple-center.
          if (role === "male") {
            updateNode(node.id, slotX + SPOUSE_SIDE_OFFSET / 2);
            updateNode(spouseId, slotX - SPOUSE_SIDE_OFFSET / 2);
          } else {
            updateNode(node.id, slotX - SPOUSE_SIDE_OFFSET / 2);
            updateNode(spouseId, slotX + SPOUSE_SIDE_OFFSET / 2);
          }
          continue;
        }
      }

      updateNode(node.id, slotX);
    }
  }
}

/** Loose UUID match for union ids (Supabase / JSON formatting). */
function normalizeUuidKey(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "");
}

function fitHorizontalCanvas(positioned: PositionedTreeNode[]): number {
  if (positioned.length === 0) return MIN_LAYOUT_CANVAS_WIDTH;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const n of positioned) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
  }
  if (!Number.isFinite(minX)) return MIN_LAYOUT_CANVAS_WIDTH;
  const viewWidth = Math.max(MIN_LAYOUT_CANVAS_WIDTH, maxX - minX + 2 * PADDING_X);
  const xShift = PADDING_X - minX;
  for (let i = 0; i < positioned.length; i++) {
    positioned[i] = { ...positioned[i], x: positioned[i].x + xShift };
  }
  return viewWidth;
}

/**
 * Upright Kutumb layout: each generation is a row. Married couples: progeny on main axis,
 * incoming spouse to the side (bride left of main male, groom right of main female); + and frame in SVG.
 */
export function layoutTreeNodes(
  nodes: TreeNode[],
  edges: TreeEdge[] = [],
  unionRows: UnionRow[] = [],
): {
  positionedNodes: PositionedTreeNode[];
  viewHeight: number;
  viewWidth: number;
} {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { positionedNodes: [], viewHeight: 320, viewWidth: 400 };
  }

  const byGen = new Map<number, TreeNode[]>();
  for (const n of nodes) {
    const lg = layoutLineageGeneration(n, nodes, unionRows);
    if (!byGen.has(lg)) byGen.set(lg, []);
    byGen.get(lg)!.push(n);
  }

  const rawY = (layoutGen: number) => -(layoutGen * TREE_VERTICAL_SPACING);
  const yValues = nodes.map((n) => rawY(layoutLineageGeneration(n, nodes, unionRows)));
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const offsetY = -yMin + PADDING_Y;
  const viewHeight = Math.max(320, yMax - yMin + PADDING_Y * 2);

  const positionedNodes: PositionedTreeNode[] = [];

  const generations = Array.from(byGen.keys()).sort((a, b) => a - b);
  for (const gen of generations) {
    const band = byGen.get(gen) ?? [];
    const units = buildLayoutUnitsForBand(band, edges);

    let totalSlots = 0;
    for (const u of units) {
      if (u.kind === "couple") totalSlots += 2;
      else if (u.kind === "siblings") totalSlots += u.nodes.length;
      else totalSlots += 1;
    }
    if (totalSlots === 0) continue;

    const layoutCanvasWidth = Math.max(
      MIN_LAYOUT_CANVAS_WIDTH,
      (totalSlots + 1) * MIN_SLOT_CENTER_GAP,
    );
    const slotW = layoutCanvasWidth / (totalSlots + 1);
    let slot = 0;
    const y = rawY(gen) + offsetY;

    for (const u of units) {
      if (u.kind === "couple") {
        const slotCenterX = (slotW * (slot + 1) + slotW * (slot + 2)) / 2;
        const off = SPOUSE_SIDE_OFFSET;
        // Mother / wife left, father / husband right; pair centered on the slot (+ and frame sit between them).
        const xFemale = slotCenterX - off / 2;
        const xMale = slotCenterX + off / 2;
        positionedNodes.push({ ...u.female, x: xFemale, y });
        positionedNodes.push({ ...u.male, x: xMale, y });
        slot += 2;
      } else if (u.kind === "siblings") {
        for (let i = 0; i < u.nodes.length; i++) {
          positionedNodes.push({
            ...u.nodes[i],
            x: slotW * (slot + i + 1),
            y,
          });
        }
        slot += u.nodes.length;
      } else {
        positionedNodes.push({ ...u.node, x: slotW * (slot + 1), y });
        slot += 1;
      }
    }
  }

  repositionChildrenByUnion(positionedNodes, unionRows);
  const viewWidth = fitHorizontalCanvas(positionedNodes);

  return { positionedNodes, viewHeight, viewWidth };
}
