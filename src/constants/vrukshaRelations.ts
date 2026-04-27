/**
 * Kutumb Map — Add Member relation labels (exact strings for API + styling).
 * Order matches product spec. Must stay aligned with backend/routers/person.py sets.
 */

import type { UnionRow } from "@/engine/types";

/** Loose UUID/string compare (hyphen variants) — used for tree edges and union ids. */
export function idEqNodeIds(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  return x.replace(/-/g, "") === y.replace(/-/g, "");
}
export const KUTUMB_RELATION_OPTIONS: readonly string[] = [
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Spouse",
  "Adopted Son",
  "Adopted Daughter",
] as const;

/**
 * Ancestral tree: new members can be children, spouse, or immediate parents.
 * Father / Mother grow the root upward; Spouse forms a union; children branch downward.
 */
export const ANCESTRAL_ADD_RELATION_OPTIONS: readonly string[] = [
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Spouse",
  "Adopted Son",
  "Adopted Daughter",
] as const;

export const ALL_VRUKSHA_RELATIONS: string[] = [...KUTUMB_RELATION_OPTIONS];

/** Map stored / legacy labels onto canonical Kutumb dropdown labels where possible. */
export function normalizeRelationToKutumb(r: string): string {
  const t = r.trim();
  if (ALL_VRUKSHA_RELATIONS.includes(t)) return t;
  const lower = t.toLowerCase();
  const hit = ALL_VRUKSHA_RELATIONS.find((o) => o.toLowerCase() === lower);
  if (hit) return hit;
  const legacy: Record<string, string> = {
    spouse: "Spouse",
    wife: "Spouse",
    husband: "Spouse",
    relative: "Brother",
    father: "Father",
    mother: "Mother",
    son: "Son",
    daughter: "Daughter",
    brother: "Brother",
    sister: "Sister",
  };
  return legacy[lower] ?? t;
}

/** @deprecated use KUTUMB_RELATION_OPTIONS */
export const VRUKSHA_RELATION_GROUPS: { label: string; options: string[] }[] = [
  { label: "Blood relations", options: ["Son", "Daughter", "Father", "Mother", "Brother", "Sister"] },
  { label: "Marriage", options: ["Spouse"] },
  { label: "Adopted", options: ["Adopted Son", "Adopted Daughter"] },
];

/**
 * Signed lineage index for the new member relative to anchor.generation (Upright / Vruksha).
 * Child / adopted child: branch grows up (+1). Parent: root grows down (-1). Spouse & sibling: same band.
 */
export function computeVrukshaGeneration(anchorGeneration: number, relation: string): number {
  const r = relation.trim();
  if (["Son", "Daughter", "Adopted Son", "Adopted Daughter"].includes(r)) {
    return anchorGeneration + 1;
  }
  if (["Father", "Mother"].includes(r)) {
    return anchorGeneration - 1;
  }
  return anchorGeneration;
}

export function isChildRelation(relation: string): boolean {
  return ["Son", "Daughter", "Adopted Son", "Adopted Daughter"].includes(relation.trim());
}

export function isSpouseRelation(relation: string): boolean {
  const t = relation.trim();
  if (["Wife", "Husband"].includes(t)) return true;
  return /^spouse$/i.test(t);
}

/** Step / adopted progeny (different connector styling from biological Son/Daughter). */
export function isAdoptedChildRelation(relation: string): boolean {
  return /adopted/i.test(relation.trim());
}

export type TreeNodeContainerVariant =
  | "bio-child"
  | "adopted-child"
  | "incoming-spouse"
  | "lineage-host"
  | "default";

/**
 * Container colors: orange = biological progeny / host lineage (male in couple); green = adopted;
 * blue = spouse marrying into this vansha (female in marital union, or bridge ids).
 */
export function getTreeNodeContainerVariant(
  node: {
    id: string;
    relation: string;
    maidenVanshaId?: string | null;
    paternalVanshaId?: string | null;
    gender?: "male" | "female" | "other";
  },
  unionRows: readonly UnionRow[],
): TreeNodeContainerVariant {
  const r = node.relation.trim();
  const rl = r.toLowerCase();
  if (isAdoptedChildRelation(r)) return "adopted-child";
  if (isChildRelation(r) && !isAdoptedChildRelation(r)) return "bio-child";

  const bridge =
    (node.maidenVanshaId != null && String(node.maidenVanshaId).trim() !== "") ||
    (node.paternalVanshaId != null && String(node.paternalVanshaId).trim() !== "");
  // Bridge = marrying in from another vansha (blue) even when API lists them as male_node in the union row.
  if (bridge) return "incoming-spouse";

  for (const u of unionRows) {
    if (idEqNodeIds(u.femaleNodeId, node.id)) return "incoming-spouse";
    if (idEqNodeIds(u.maleNodeId, node.id)) {
      // Son-in-law / groom is male_node_id but is an incoming spouse, not paternal-line host.
      if (rl === "husband" || rl === "spouse") return "incoming-spouse";
      return "lineage-host";
    }
  }

  // API sometimes stores relation as "spouse" instead of Wife/Husband; union row may be missing in edge cases.
  if (rl === "spouse" || rl === "wife" || rl === "husband") return "incoming-spouse";

  return "default";
}
