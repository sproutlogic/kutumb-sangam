import type { TreeEdge, TreeNode, TreeState, UnionRow } from "@/engine/types";
import { migrateLegacyVisibility } from "@/engine/privacy";
import { generateId } from "@/engine/types";
import type { VanshaTreePayload } from "./api";

type Row = Record<string, unknown>;

function str(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function num(row: Row, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

function createdAtMs(row: Row): number {
  const n = num(row, "created_at", "createdAt");
  if (n !== undefined && n > 1e12) return n;
  if (n !== undefined && n < 1e12 && n > 0) return n * 1000;
  const s = str(row, "created_at", "createdAt");
  if (s) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/** Signed lineage index: negative = ancestors, 0 = anchor, positive = progenies (upright paternal model). */
function lineageGenerationFromRow(row: Row): number {
  const raw = num(row, "relative_gen_index", "generation", "gen_index");
  if (raw === undefined) return 0;
  return raw;
}

function normalizeGender(g: unknown): "male" | "female" | "other" {
  const s = String(g ?? "").toLowerCase();
  if (s === "male" || s === "m") return "male";
  if (s === "female" || s === "f") return "female";
  return "other";
}

/** Prefer API `name` (from FastAPI first+last), then single fields, then first_name + last_name. */
function displayName(row: Row): string {
  const fromApi = str(row, "name", "full_name", "display_name", "legal_name");
  if (fromApi) return fromApi;
  const first = str(row, "first_name");
  const last = str(row, "last_name");
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || "Unknown";
}

function mapPerson(row: Row): TreeNode {
  const id = str(row, "node_id", "id");
  const owner = str(row, "owner_id", "ownerId", "node_id", "id") || id;
  const given = str(row, "first_name", "givenName", "given_name");
  const middle = str(row, "middle_name", "middleName");
  const surname = str(row, "last_name", "surname");
  const name = displayName(row);
  const relation = str(row, "relation", "relation_label", "role") || "member";
  const gotra = str(row, "gotra", "gotra_name");
  const mool = str(row, "mool_niwas", "moolNiwas", "native_place", "mool_nivas");
  const ancestral = str(row, "ancestral_place", "ancestralPlace", "pitri_sthan");
  const currentRes = str(row, "current_residence", "currentResidence", "residence");
  const dob = str(row, "date_of_birth", "dateOfBirth", "dob");

  const maidenRaw = str(row, "maiden_vansha_id", "maidenVanshaId");
  const paternalVRaw = str(row, "paternal_vansha_id", "paternalVanshaId", "groom_origin_vansha_id");
  const parentUnionRaw = str(row, "parent_union_id", "parentUnionId");
  const fatherNodeRaw = str(row, "father_node_id", "father_id", "paternal_parent_id");
  const motherNodeRaw = str(row, "mother_node_id", "mother_id", "maternal_parent_id");
  const privacyIdsRaw = str(row, "privacy_node_ids", "privacyNodeIds");
  const firstRaw = str(row, "first_name", "givenName", "given_name");
  const isPlaceholder =
    str(row, "is_placeholder", "isPlaceholder").toLowerCase() === "true" ||
    firstRaw === "\u2014" ||
    firstRaw === "-" ||
    firstRaw === "?";
  return {
    id: id || generateId(),
    name,
    givenName: given || undefined,
    middleName: middle || undefined,
    surname: surname || undefined,
    dateOfBirth: dob || undefined,
    ancestralPlace: ancestral || undefined,
    currentResidence: currentRes || undefined,
    relation,
    gender: normalizeGender(row.gender),
    branch: str(row, "branch", "branch_label") || "main",
    gotra,
    moolNiwas: mool,
    parentUnionId: parentUnionRaw || null,
    fatherNodeId: fatherNodeRaw || null,
    motherNodeId: motherNodeRaw || null,
    ownerId: owner,
    createdBy: str(row, "created_by", "createdBy") || owner,
    createdAt: createdAtMs(row),
    verificationTier: ((): import("../engine/types").VerificationTier => {
      const t = str(row, "verification_tier", "verificationTier");
      if (t === "family-endorsed" || t === "expert-verified" || t === "community-endorsed") return t;
      return "self-declared";
    })(),
    borderStyle: "solid",
    status: "active",
    generation: lineageGenerationFromRow(row),
    visibility: migrateLegacyVisibility(str(row, "visibility") || "public"),
    privacyNodeIds: privacyIdsRaw
      ? privacyIdsRaw.split(/[,;\s]+/).filter(Boolean).slice(0, 5)
      : undefined,
    maidenVanshaId: maidenRaw || null,
    paternalVanshaId: paternalVRaw || null,
    isPlaceholder,
  };
}

function unionIdOf(u: Row): string {
  return str(u, "union_id", "id");
}

/** Loose UUID match (Supabase / JSON may vary dash casing). */
function normalizeUuidKey(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "");
}

function buildUnionLookup(unions: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const u of unions) {
    const uid = unionIdOf(u);
    if (!uid) continue;
    map.set(uid, u);
    map.set(normalizeUuidKey(uid), u);
  }
  return map;
}

function unionRowForParentUnionId(unionById: Map<string, Row>, puid: string): Row | undefined {
  return unionById.get(puid) ?? unionById.get(normalizeUuidKey(puid));
}

/** When parental union id is missing or mismatched, still detect couple from father+mother ids. */
function findUnionMatchingParents(
  unions: Row[],
  fatherId: string,
  motherId: string,
): Row | undefined {
  const fa = normalizeUuidKey(fatherId);
  const mo = normalizeUuidKey(motherId);
  for (const u of unions) {
    const m = str(u, "male_node_id", "maleNodeId");
    const f = str(u, "female_node_id", "femaleNodeId");
    if (!m || !f) continue;
    const nm = normalizeUuidKey(m);
    const nf = normalizeUuidKey(f);
    if (nm === fa && nf === mo) return u;
    if (nm === mo && nf === fa) return u;
  }
  return undefined;
}

function buildEdges(persons: Row[], unions: Row[]): TreeEdge[] {
  const edges: TreeEdge[] = [];
  const idSet = new Set(persons.map((p) => str(p, "node_id", "id")).filter(Boolean));

  const unionById = buildUnionLookup(unions);

  for (const p of persons) {
    const pid = str(p, "node_id", "id");
    if (!pid) continue;

    // Vanshavali: children link to a parental Union (couple), not one person.
    const puid = str(p, "parent_union_id", "parentUnionId");
    if (puid) {
      const urow = unionRowForParentUnionId(unionById, puid);
      if (urow) {
        // Tree renders one trunk from the + between spouses; do not emit two edges from each parent.
        continue;
      }
    }

    const fatherId = str(p, "father_node_id", "father_id", "paternal_parent_id");
    const motherId = str(p, "mother_node_id", "mother_id", "maternal_parent_id");
    if (fatherId && motherId && findUnionMatchingParents(unions, fatherId, motherId)) {
      continue;
    }

    for (const [rel, keys] of [
      ["father", ["father_node_id", "father_id", "paternal_parent_id"]],
      ["mother", ["mother_node_id", "mother_id", "maternal_parent_id"]],
    ] as const) {
      const raw = str(p, ...keys);
      if (raw && idSet.has(raw)) {
        edges.push({ from: pid, to: raw, relation: rel });
      }
    }
  }

  for (const u of unions) {
    const m = str(u, "male_node_id", "maleNodeId");
    const f = str(u, "female_node_id", "femaleNodeId");
    if (m && f && idSet.has(m) && idSet.has(f)) {
      edges.push({ from: m, to: f, relation: "spouse" });
    }
  }

  return edges;
}

function pickCurrentUserId(nodes: TreeNode[]): string {
  const self = nodes.find((n) => n.relation.toLowerCase() === "self");
  if (self) return self.id;
  const gen0 = nodes.find((n) => n.generation === 0);
  return gen0?.id ?? nodes[0]?.id ?? "";
}

/**
 * Converts FastAPI / Supabase-shaped payload into client TreeState for TreeContext.
 */
export function backendPayloadToTreeState(data: VanshaTreePayload): TreeState {
  const persons = (data.persons ?? []) as Row[];
  const unions = (data.unions ?? []) as Row[];

  const nodes = persons.map(mapPerson);
  const edges = buildEdges(persons, unions);

  const unionRows: UnionRow[] = unions
    .map((u) => {
      const uid = unionIdOf(u);
      const maleNodeId = str(u, "male_node_id", "maleNodeId");
      const femaleNodeId = str(u, "female_node_id", "femaleNodeId");
      if (!uid || !maleNodeId || !femaleNodeId) return null;
      const rgi = num(u, "relative_gen_index", "relativeGenIndex");
      return {
        id: uid,
        maleNodeId,
        femaleNodeId,
        ...(rgi !== undefined ? { relativeGenIndex: rgi } : {}),
      };
    })
    .filter((x): x is UnionRow => x != null);

  const treeName = str(persons[0] ?? {}, "tree_name", "family_name") || `Vansha ${data.vansha_id.slice(0, 8)}…`;

  return {
    nodes,
    edges,
    unionRows,
    changeLog: [],
    disputes: [],
    pendingActions: [],
    activityLog: [],
    currentUserId: pickCurrentUserId(nodes),
    treeName,
    matrimonyProfile: null,
  };
}
