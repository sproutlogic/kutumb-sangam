/**
 * TreeCanvasV2 — production family-tree canvas.
 *
 * Indian vansh-vruksha convention: ancestors at the bottom (the roots),
 * descendants at the top (the flowers). Hence Dagre rankdir = "BT".
 *
 * Position model:
 *   - Auto layout is computed by Dagre from parent_of edges.
 *   - When the user drags a node, we persist the *absolute* x/y to
 *     persons.canvas_offset_x/y. On next render that absolute position
 *     overrides the auto layout for that node only.
 *   - "Reset position" clears the offset and restores auto layout.
 *
 * Performance:
 *   - Dagre handles thousands of nodes without breaking a sweat.
 *   - For very large trees the user can narrow the visible generation
 *     window with the rank slider; only nodes inside the window are
 *     handed to React Flow.
 *
 * Editing:
 *   - Right-click a person → edit / add child / integrity / reset / delete.
 *   - Drag from one node's handle to another to create an edge; a small
 *     dialog asks parent_of vs spouse_of and the biology subtype.
 *   - Member form lives in NodePage; this canvas never tries to rebuild it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import dagre from "dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnConnect,
  type Connection,
  MarkerType,
  Panel,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { fetchVanshaTree, deletePerson } from "@/services/api";
import {
  listRelationships,
  deleteRelationship,
  createRelationship,
  createPersonV2,
  setNodeOffset,
  clearNodeOffset,
  getVansha,
  getIntegrity,
  type Relationship,
  type EdgeType,
  type EdgeSubtype,
  type VanshaMeta,
  type IntegrityReport,
} from "@/services/treeV2Api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FamilyNode from "./FamilyNode";
import NodeProfilePanel from "./NodeProfilePanel";
import RajputanaBorder from "./RajputanaBorder";

// nodeTypes must be stable (defined outside component).
const nodeTypes = { familyNode: FamilyNode };

// ─── Types ────────────────────────────────────────────────────────────────────

type RawPerson = Record<string, unknown> & {
  node_id: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  kutumb_id?: string | null;
  canvas_offset_x?: number | null;
  canvas_offset_y?: number | null;
  relation?: string;
  generation?: number | null;
  is_deceased?: boolean | null;
  pandit_verified?: boolean | null;
  spouse_node_id?: string | null;
  owner_id?: string | null;
  creator_id?: string | null;
};

type ContextMenu =
  | { kind: "node"; x: number; y: number; nodeId: string; name: string }
  | { kind: "edge"; x: number; y: number; relId: string; relType: EdgeType };

interface PendingEdge {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
}

interface PendingAdd {
  anchorId: string | null;
  anchorName: string;
  anchorGender?: string;
  spouseId?: string;
  spouseName?: string;
  dir: "child" | "parent" | "spouse" | "standalone";
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_WIDTH = 168;
const NODE_HEIGHT = 76;
const RANK_SEP = 90; // vertical space between generations
const NODE_SEP = 48; // horizontal space between siblings
const SPOUSE_GAP = 18; // pixels between two spouse cards on the same rank

// ─── Dagre layout (BT — ancestors bottom, descendants top) ────────────────────

function computeAutoLayout(
  persons: RawPerson[],
  rels: Relationship[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 60,
    marginy: 60,
  });
  g.setDefaultEdgeLabel(() => ({}));

  persons.forEach((p) => {
    g.setNode(p.node_id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Only parent_of edges drive vertical ranking. Spouses are placed by
  // post-processing so Dagre doesn't try to put them on different ranks.
  const parentEdges = rels.filter((r) => r.type === "parent_of");
  const presentIds = new Set(persons.map((p) => p.node_id));
  parentEdges.forEach((r) => {
    if (presentIds.has(r.from_node_id) && presentIds.has(r.to_node_id)) {
      g.setEdge(r.from_node_id, r.to_node_id);
    }
  });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  persons.forEach((p) => {
    const node = g.node(p.node_id);
    if (!node) return;
    positions.set(p.node_id, {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - NODE_HEIGHT / 2,
    });
  });

  // Spouse alignment: pull each spouse to the same Y, side-by-side.
  // We process pairs in a stable order so the layout is deterministic.
  const spouseEdges = rels.filter((r) => r.type === "spouse_of");
  const aligned = new Set<string>();
  spouseEdges.forEach((s) => {
    const a = positions.get(s.from_node_id);
    const b = positions.get(s.to_node_id);
    if (!a || !b) return;
    const y = Math.max(a.y, b.y);
    // Whoever is leftmost stays put; partner goes to their right.
    const [leftId, rightId] = a.x <= b.x ? [s.from_node_id, s.to_node_id] : [s.to_node_id, s.from_node_id];
    const left = positions.get(leftId)!;
    if (!aligned.has(leftId)) {
      positions.set(leftId, { x: left.x, y });
      aligned.add(leftId);
    }
    positions.set(rightId, { x: left.x + NODE_WIDTH + SPOUSE_GAP, y });
    aligned.add(rightId);
  });

  return positions;
}

// ─── Generation labels (BFS from roots over parent_of) ────────────────────────

function computeGenerations(
  persons: RawPerson[],
  rels: Relationship[],
): Map<string, number> {
  const parentOf = rels.filter((r) => r.type === "parent_of");
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  parentOf.forEach((r) => {
    const arr = childrenOf.get(r.from_node_id) ?? [];
    arr.push(r.to_node_id);
    childrenOf.set(r.from_node_id, arr);
    hasParent.add(r.to_node_id);
  });
  const gen = new Map<string, number>();
  const queue: string[] = [];
  persons.forEach((p) => {
    if (!hasParent.has(p.node_id)) {
      gen.set(p.node_id, 0);
      queue.push(p.node_id);
    }
  });
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id) ?? 0;
    (childrenOf.get(id) ?? []).forEach((cid) => {
      const next = g + 1;
      const prev = gen.get(cid);
      if (prev === undefined || next < prev) {
        gen.set(cid, next);
        queue.push(cid);
      }
    });
  }
  // Spouses inherit partner's generation if isolated.
  rels
    .filter((r) => r.type === "spouse_of")
    .forEach((r) => {
      const a = gen.get(r.from_node_id);
      const b = gen.get(r.to_node_id);
      if (a !== undefined && b === undefined) gen.set(r.to_node_id, a);
      if (b !== undefined && a === undefined) gen.set(r.from_node_id, b);
    });
  persons.forEach((p) => {
    if (!gen.has(p.node_id)) gen.set(p.node_id, 0);
  });
  return gen;
}

// ─── Visual helpers ───────────────────────────────────────────────────────────

function nodeBg(gender?: string): string {
  const g = (gender ?? "").toLowerCase();
  if (g === "male") return "#dbeafe";
  if (g === "female") return "#fce7f3";
  return "#f1f5f9";
}

function personName(p: RawPerson): string {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(unnamed)";
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  vanshaId: string;
  readOnly?: boolean;
}

const TreeCanvasV2: React.FC<Props> = ({ vanshaId, readOnly = false }) => {
  const { appUser } = useAuth();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [persons, setPersons] = useState<RawPerson[]>([]);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [vansha, setVansha] = useState<VanshaMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [integrityPanel, setIntegrityPanel] = useState<IntegrityReport | null>(null);
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [profileNodeId, setProfileNodeId] = useState<string | null>(null);

  // Generation window (clamped to actual range after fetch).
  const [genWindow, setGenWindow] = useState<[number, number] | null>(null);

  const dragSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tree, edges, meta] = await Promise.all([
        fetchVanshaTree(vanshaId),
        listRelationships(vanshaId),
        getVansha(vanshaId).catch(() => null),
      ]);
      setPersons((tree.persons ?? []) as RawPerson[]);
      setRels(edges);
      setVansha(meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tree");
    } finally {
      setLoading(false);
    }
  }, [vanshaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Derived: layout, generations, gen range ────────────────────────────────

  // Back-compat: persons created via the old NodePage store their lineage in
  // father_node_id / mother_node_id columns but never write to RELATIONSHIPS_TABLE.
  // Synthesise those edges so TreeCanvasV2 can see them.
  const allRels = useMemo(() => {
    const nodeSet = new Set(persons.map((p) => p.node_id));
    const relSet = new Set(rels.map((r) => `${r.from_node_id}:${r.to_node_id}`));
    // Canonical pair key (order-independent) to deduplicate spouse edges.
    const spousePairs = new Set(
      rels.filter((r) => r.type === "spouse_of").map((r) =>
        [r.from_node_id, r.to_node_id].sort().join(":"),
      ),
    );
    const synthetic: Relationship[] = [];
    persons.forEach((p) => {
      const fid = p.father_node_id as string | null | undefined;
      const mid = p.mother_node_id as string | null | undefined;
      const sid = p.spouse_node_id as string | null | undefined;

      if (fid && nodeSet.has(fid) && !relSet.has(`${fid}:${p.node_id}`)) {
        synthetic.push({ id: `s-f-${p.node_id}`, vansha_id: vanshaId, from_node_id: fid, to_node_id: p.node_id, type: "parent_of", subtype: "biological" });
      }
      if (mid && nodeSet.has(mid) && !relSet.has(`${mid}:${p.node_id}`)) {
        synthetic.push({ id: `s-m-${p.node_id}`, vansha_id: vanshaId, from_node_id: mid, to_node_id: p.node_id, type: "parent_of", subtype: "biological" });
      }
      if (sid && nodeSet.has(sid) && !spousePairs.has([p.node_id, sid].sort().join(":"))) {
        synthetic.push({ id: `s-sp-${p.node_id}-${sid}`, vansha_id: vanshaId, from_node_id: p.node_id, to_node_id: sid, type: "spouse_of", subtype: "biological" });
        spousePairs.add([p.node_id, sid].sort().join(":")); // prevent mirror duplicate
      }
    });
    return synthetic.length ? [...rels, ...synthetic] : rels;
  }, [rels, persons, vanshaId]);

  const autoLayout = useMemo(() => computeAutoLayout(persons, allRels), [persons, allRels]);
  const generations = useMemo(() => computeGenerations(persons, allRels), [persons, allRels]);

  const genRange = useMemo<[number, number]>(() => {
    if (!persons.length) return [0, 0];
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    persons.forEach((p) => {
      const g = generations.get(p.node_id) ?? 0;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 0];
    return [lo, hi];
  }, [persons, generations]);

  // Auto-expand window in both directions when generations are added.
  useEffect(() => {
    setGenWindow((curr) => {
      if (!curr) return [genRange[0], genRange[1]];
      return [
        Math.min(curr[0], genRange[0]), // expand down for newly added ancestors
        Math.max(curr[1], genRange[1]), // expand up for newly added descendants
      ];
    });
  }, [genRange]);

  // Pick correct sourceHandle/targetHandle for rendered edges based on type + positions.
  const edgeHandles = useCallback(
    (r: Relationship): { sourceHandle: string; targetHandle: string } => {
      if (r.type === "spouse_of") {
        const srcPos = autoLayout.get(r.from_node_id);
        const tgtPos = autoLayout.get(r.to_node_id);
        const srcX = srcPos?.x ?? 0;
        const tgtX = tgtPos?.x ?? 0;
        return srcX <= tgtX
          ? { sourceHandle: "s-right", targetHandle: "s-left" }
          : { sourceHandle: "s-left",  targetHandle: "s-right" };
      }
      // parent_of: parent sends upward from top handle
      return { sourceHandle: "s-top", targetHandle: "s-bottom" };
    },
    [autoLayout],
  );

  // ── Build React Flow nodes + edges ─────────────────────────────────────────

  useEffect(() => {
    if (!persons.length) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    // edgeHandles is stable (memoised by autoLayout); safe to call inside effect.
    const [gMin, gMax] = genWindow ?? genRange;
    const visibleIds = new Set(
      persons
        .filter((p) => {
          const g = generations.get(p.node_id) ?? 0;
          return g >= gMin && g <= gMax;
        })
        .map((p) => p.node_id),
    );

    const nodes: Node[] = persons
      .filter((p) => visibleIds.has(p.node_id))
      .map((p) => {
        const auto = autoLayout.get(p.node_id) ?? { x: 0, y: 0 };
        const ox = p.canvas_offset_x;
        const oy = p.canvas_offset_y;
        const hasOffset = ox !== null && ox !== undefined && oy !== null && oy !== undefined;
        const position = hasOffset ? { x: Number(ox), y: Number(oy) } : auto;
        const g = generations.get(p.node_id) ?? 0;
        const name = personName(p);
        return {
          id: p.node_id,
          type: "familyNode",
          position,
          dragHandle: ".fn-drag-handle",
          data: {
            nodeId: p.node_id,
            name,
            gender: p.gender,
            relation: p.relation,
            kutumbId: p.kutumb_id as string | null | undefined,
            hasOffset,
            isDeceased: !!p.is_deceased,
            isPanditVerified: !!p.pandit_verified,
            canEdit: p.owner_id
              ? p.owner_id === appUser?.id
              : (p.creator_id as string | null | undefined || "") === appUser?.id,
            isUnclaimed: !p.owner_id,
            onOpenProfile: (nodeId: string) => setProfileNodeId(nodeId),
          },
        };
      });

    const edges: Edge[] = allRels
      .filter((r) => visibleIds.has(r.from_node_id) && visibleIds.has(r.to_node_id))
      .map((r) => {
        const isSpouse = r.type === "spouse_of";
        const isAdopted = r.subtype === "adopted";
        const isStep = r.subtype === "step";
        const stroke = isSpouse
          ? "#ec4899"
          : isAdopted
            ? "#a855f7"
            : isStep
              ? "#f59e0b"
              : "#475569";
        const { sourceHandle, targetHandle } = edgeHandles(r);
        return {
          id: r.id,
          source: r.from_node_id,
          target: r.to_node_id,
          sourceHandle,
          targetHandle,
          data: { relId: r.id, type: r.type, subtype: r.subtype },
          type: isSpouse ? "straight" : "smoothstep",
          animated: false,
          style: {
            stroke,
            strokeWidth: isSpouse ? 2 : 1.5,
            strokeDasharray: isAdopted ? "6 4" : isStep ? "2 4" : undefined,
          },
          markerEnd: isSpouse
            ? undefined
            : { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
          label: isAdopted ? "adopted" : isStep ? "step" : undefined,
          labelStyle: { fontSize: 10, fill: "#64748b" },
          labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
        };
      });

    setRfNodes(nodes);
    setRfEdges(edges);
  }, [persons, allRels, autoLayout, generations, genWindow, genRange, edgeHandles, setRfNodes, setRfEdges]);

  // ── Drag persistence: save absolute position ───────────────────────────────

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (dragSaveTimer.current) clearTimeout(dragSaveTimer.current);
    const { id, position } = node;
    dragSaveTimer.current = setTimeout(() => {
      void setNodeOffset(id, position.x, position.y)
        .then(() => {
          // Mirror the saved position into the persons cache so the dashed
          // "moved" border appears, and so subsequent re-layouts respect it.
          setPersons((ps) =>
            ps.map((p) =>
              p.node_id === id
                ? { ...p, canvas_offset_x: position.x, canvas_offset_y: position.y }
                : p,
            ),
          );
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save position"));
    }, 500);
  }, []);

  // ── Edge create on drag-connect ────────────────────────────────────────────

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      // Block only if a REAL (DB-backed) edge exists between these two nodes.
      // Synthetic edges derived from legacy father_node_id/mother_node_id columns
      // use ids starting with "s-" and should not block reconnection after a delete.
      const realAlreadyLinked = rels.some(
        (r) =>
          (r.from_node_id === conn.source && r.to_node_id === conn.target) ||
          (r.from_node_id === conn.target && r.to_node_id === conn.source),
      );
      if (realAlreadyLinked) {
        toast.error("These two people are already connected");
        return;
      }
      const a = persons.find((p) => p.node_id === conn.source);
      const b = persons.find((p) => p.node_id === conn.target);
      if (!a || !b) return;
      setPendingEdge({
        source: a.node_id,
        target: b.node_id,
        sourceName: personName(a),
        targetName: personName(b),
      });
    },
    [persons, rels],
  );

  const submitPendingEdge = useCallback(
    async (type: EdgeType, subtype: EdgeSubtype) => {
      if (!pendingEdge) return;
      try {
        const created = await createRelationship({
          vansha_id: vanshaId,
          from_node_id: pendingEdge.source,
          to_node_id: pendingEdge.target,
          type,
          subtype,
        });
        setRels((rs) => [...rs, created]);
        toast.success("Relationship added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create relationship");
      } finally {
        setPendingEdge(null);
      }
    },
    [pendingEdge, vanshaId],
  );

  // ── Context menus ──────────────────────────────────────────────────────────

  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault();
    setContextMenu({
      kind: "node",
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      name: (node.data?.name as string) ?? "",
    });
  }, []);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault();
    const data = edge.data as { relId?: string; type?: EdgeType } | undefined;
    setContextMenu({
      kind: "edge",
      x: e.clientX,
      y: e.clientY,
      relId: data?.relId ?? edge.id,
      relType: data?.type ?? "parent_of",
    });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDeleteNode = async (nodeId: string) => {
    closeMenu();
    if (!window.confirm("Delete this person and all their relationships?")) return;
    try {
      await deletePerson(nodeId);
      setPersons((ps) => ps.filter((p) => p.node_id !== nodeId));
      setRels((rs) => rs.filter((r) => r.from_node_id !== nodeId && r.to_node_id !== nodeId));
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeleteEdge = async (relId: string) => {
    closeMenu();
    try {
      await deleteRelationship(relId);
      setRels((rs) => rs.filter((r) => r.id !== relId));
      toast.success("Relationship removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleResetPosition = async (nodeId: string) => {
    closeMenu();
    try {
      await clearNodeOffset(nodeId);
      setPersons((ps) =>
        ps.map((p) =>
          p.node_id === nodeId ? { ...p, canvas_offset_x: null, canvas_offset_y: null } : p,
        ),
      );
      toast.success("Position reset to auto-layout");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset position");
    }
  };

  const handleViewIntegrity = async (nodeId: string) => {
    closeMenu();
    try {
      const r = await getIntegrity(nodeId);
      setIntegrityPanel(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Integrity check failed");
    }
  };

  const openAddDialog = (anchorNodeId: string | null, anchorName: string, dir: PendingAdd["dir"]): void => {
    closeMenu();
    let anchorGender: string | undefined;
    let spouseId: string | undefined;
    let spouseName: string | undefined;
    if (anchorNodeId) {
      const anchor = persons.find((p) => p.node_id === anchorNodeId);
      anchorGender = anchor?.gender as string | undefined;
      const spouseRel = allRels.find(
        (r) => r.type === "spouse_of" &&
          (r.from_node_id === anchorNodeId || r.to_node_id === anchorNodeId),
      );
      if (spouseRel) {
        const spId = spouseRel.from_node_id === anchorNodeId
          ? spouseRel.to_node_id
          : spouseRel.from_node_id;
        const sp = persons.find((p) => p.node_id === spId);
        if (sp) { spouseId = spId; spouseName = personName(sp); }
      }
    }
    setPendingAdd({ anchorId: anchorNodeId, anchorName, anchorGender, spouseId, spouseName, dir });
  };

  const createPersonAndEdge = useCallback(
    async (
      firstName: string, lastName: string, dob: string,
      gender: "male" | "female" | "other",
      fromId: string | null, toId: string | null,
      relType: EdgeType, subtype: EdgeSubtype,
    ): Promise<RawPerson | null> => {
      let newPerson;
      try {
        newPerson = await createPersonV2({
          vansha_id: vanshaId,
          first_name: firstName,
          last_name: lastName || undefined,
          gender,
          date_of_birth: dob || undefined,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create person");
        return null;
      }
      if (fromId && toId) {
        try {
          const rel = await createRelationship({
            vansha_id: vanshaId,
            from_node_id: fromId,
            to_node_id: toId,
            type: relType,
            subtype,
          });
          setRels((rs) => [...rs, rel]);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Person added but relationship failed — connect manually");
        }
      }
      setPersons((ps) => [...ps, newPerson as RawPerson]);
      return newPerson as RawPerson;
    },
    [vanshaId],
  );

  const submitAddChild = useCallback(
    async (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other", subtype: EdgeSubtype) => {
      if (!pendingAdd?.anchorId) return;
      const { anchorId, spouseId } = pendingAdd;
      const child = await createPersonAndEdge(firstName, lastName, dob, gender, anchorId, null, "parent_of", subtype);
      if (!child) return;
      // Sticky position: child above anchor (150px up in canvas coords)
      const anchor = persons.find((p) => p.node_id === anchorId);
      if (anchor && anchor.canvas_offset_x != null && anchor.canvas_offset_y != null) {
        await setNodeOffset(child.node_id, anchor.canvas_offset_x, anchor.canvas_offset_y - 150);
      }
      // wire child to anchor parent
      try {
        const r1 = await createRelationship({ vansha_id: vanshaId, from_node_id: anchorId, to_node_id: child.node_id, type: "parent_of", subtype });
        setRels((rs) => [...rs, r1]);
      } catch { /* already toasted */ }
      // wire child to spouse parent if present
      if (spouseId) {
        try {
          const r2 = await createRelationship({ vansha_id: vanshaId, from_node_id: spouseId, to_node_id: child.node_id, type: "parent_of", subtype });
          setRels((rs) => [...rs, r2]);
        } catch { /* non-fatal */ }
      }
      setPendingAdd(null);
      toast.success(`${[firstName, lastName].filter(Boolean).join(" ")} added`);
    },
    [pendingAdd, vanshaId, persons, createPersonAndEdge],
  );

  const submitAddParents = useCallback(
    async (
      father: { firstName: string; lastName: string; dob: string } | null,
      mother: { firstName: string; lastName: string; dob: string } | null,
    ) => {
      if (!pendingAdd?.anchorId) return;
      const { anchorId } = pendingAdd;
      const anchor = persons.find((p) => p.node_id === anchorId);
      const baseX = anchor?.canvas_offset_x ?? 0;
      const baseY = anchor?.canvas_offset_y ?? 0;
      const jobs = [
        father ? createPersonAndEdge(father.firstName, father.lastName, father.dob, "male", null, anchorId, "parent_of", "biological") : Promise.resolve(null),
        mother ? createPersonAndEdge(mother.firstName, mother.lastName, mother.dob, "female", null, anchorId, "parent_of", "biological") : Promise.resolve(null),
      ];
      const [fPerson, mPerson] = await Promise.all(jobs);
      // Sticky positions: parents below anchor (150px down), side-by-side
      if (fPerson && anchor && baseX != null && baseY != null) {
        await setNodeOffset(fPerson.node_id, baseX - 100, baseY + 150);
      }
      if (mPerson && anchor && baseX != null && baseY != null) {
        await setNodeOffset(mPerson.node_id, baseX + 100, baseY + 150);
      }
      if (fPerson) {
        try {
          const r = await createRelationship({ vansha_id: vanshaId, from_node_id: fPerson.node_id, to_node_id: anchorId, type: "parent_of", subtype: "biological" });
          setRels((rs) => [...rs, r]);
        } catch { /* already toasted */ }
      }
      if (mPerson) {
        try {
          const r = await createRelationship({ vansha_id: vanshaId, from_node_id: mPerson.node_id, to_node_id: anchorId, type: "parent_of", subtype: "biological" });
          setRels((rs) => [...rs, r]);
        } catch { /* already toasted */ }
      }
      setPendingAdd(null);
      toast.success("Parents added");
    },
    [pendingAdd, vanshaId, persons, createPersonAndEdge],
  );

  const submitAddSpouse = useCallback(
    async (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other") => {
      if (!pendingAdd?.anchorId) return;
      const { anchorId } = pendingAdd;
      const anchor = persons.find((p) => p.node_id === anchorId);
      const sp = await createPersonAndEdge(firstName, lastName, dob, gender, anchorId, null, "spouse_of", "biological");
      if (!sp) return;
      // Sticky position: female left (-120px), male right (+120px) of anchor
      if (anchor && anchor.canvas_offset_x != null && anchor.canvas_offset_y != null) {
        const offset = gender === "female" ? -120 : 120;
        await setNodeOffset(sp.node_id, anchor.canvas_offset_x + offset, anchor.canvas_offset_y);
      }
      try {
        const r = await createRelationship({ vansha_id: vanshaId, from_node_id: anchorId, to_node_id: sp.node_id, type: "spouse_of", subtype: "biological" });
        setRels((rs) => [...rs, r]);
      } catch { /* already toasted */ }
      setPendingAdd(null);
      toast.success(`${[firstName, lastName].filter(Boolean).join(" ")} added as spouse`);
    },
    [pendingAdd, vanshaId, persons, createPersonAndEdge],
  );

  const submitAddStandalone = useCallback(
    async (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other") => {
      await createPersonAndEdge(firstName, lastName, dob, gender, null, null, "parent_of", "biological");
      setPendingAdd(null);
      toast.success(`${[firstName, lastName].filter(Boolean).join(" ")} added`);
    },
    [createPersonAndEdge],
  );

  // ── Parent names for the currently-open profile panel ─────────────────────

  const profileParentNames = useMemo(() => {
    if (!profileNodeId) return undefined;
    const parentEdges = allRels.filter(
      (r) => r.type === "parent_of" && r.to_node_id === profileNodeId,
    );
    let father: string | undefined;
    let mother: string | undefined;
    parentEdges.forEach((r) => {
      const p = persons.find((x) => x.node_id === r.from_node_id);
      if (!p) return;
      const g = ((p.gender as string) || "").toLowerCase();
      if (g === "male") father = personName(p);
      else if (g === "female") mother = personName(p);
    });
    return { father, mother };
  }, [profileNodeId, allRels, persons]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading tree…
      </div>
    );
  }
  if (error) {
    return <div className="flex items-center justify-center h-screen text-destructive">{error}</div>;
  }

  const totalGens = genRange[1] - genRange[0] + 1;

  return (
    <div className="w-full h-screen" onClick={closeMenu}>
      <RajputanaBorder>
        <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        onNodeContextMenu={readOnly ? undefined : onNodeContextMenu}
        onEdgeContextMenu={readOnly ? undefined : onEdgeContextMenu}
        onConnect={readOnly ? undefined : onConnect}
        onPaneClick={closeMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
        connectionRadius={80}
      >
        <Background gap={24} color="#d4b896" style={{ background: "#fdf8ee" }} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const g = ((n.data as Record<string, unknown>)?.gender as string | undefined);
            return g === "male" ? "#dbeafe" : g === "female" ? "#fce7f3" : "#f1f5f9";
          }}
          zoomable
          pannable
        />

        <Panel position="top-right">
          <div className="flex items-center gap-1.5 bg-background/95 border rounded-lg shadow px-2 py-1.5">
            <span className="text-xs font-semibold text-foreground pr-1 max-w-[140px] truncate">
              {vansha?.vansh_name ?? "वंश वृक्ष"}
            </span>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button title="Reload" onClick={() => void refresh()}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
            {!readOnly && (
              <button title="Add person" onClick={() => openAddDialog(null, "", "standalone")}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </button>
            )}
            {vansha?.vansh_code && (
              <button title="Copy share link" onClick={() => {
                const url = `${window.location.origin}/v/${vansha.vansh_code}`;
                void navigator.clipboard.writeText(url);
                toast.success("Share link copied!");
              }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </button>
            )}
            {readOnly && <span className="text-[10px] text-amber-600 font-semibold pl-1">👁 Read-only</span>}
          </div>
        </Panel>
      </ReactFlow>
      </RajputanaBorder>

      {/* ── All overlays rendered outside RajputanaBorder so overflow:hidden doesn't clip them ── */}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-background border rounded-lg shadow-xl py-1 min-w-[200px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "node" && (
            <>
              <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1 truncate">
                {contextMenu.name}
              </div>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => { setProfileNodeId(contextMenu.nodeId); closeMenu(); }}
              >
                👤 View profile
              </button>
              <div className="border-t my-1" />
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => openAddDialog(contextMenu.nodeId, contextMenu.name, "child")}
              >
                👦 Add child
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => openAddDialog(contextMenu.nodeId, contextMenu.name, "parent")}
              >
                👴 Add parent
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => openAddDialog(contextMenu.nodeId, contextMenu.name, "spouse")}
              >
                💑 Add spouse
              </button>
              <div className="border-t my-1" />
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => void handleViewIntegrity(contextMenu.nodeId)}
              >
                🔍 Check integrity
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => void handleResetPosition(contextMenu.nodeId)}
              >
                ⇱ Reset to auto-layout
              </button>
              <div className="border-t my-1" />
              <button
                className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive"
                onClick={() => void handleDeleteNode(contextMenu.nodeId)}
              >
                🗑 Delete person
              </button>
            </>
          )}
          {contextMenu.kind === "edge" && (
            <>
              <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1">
                {contextMenu.relType === "spouse_of" ? "Spouse link" : "Parent → child link"}
              </div>
              <button
                className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive"
                onClick={() => void handleDeleteEdge(contextMenu.relId)}
              >
                🗑 Delete this relationship
              </button>
            </>
          )}
        </div>
      )}

      {/* Integrity panel */}
      {integrityPanel && (
        <div className="fixed right-4 top-20 z-40 w-[320px]">
          <Card className="p-4 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold text-sm">Integrity Check</div>
              <Button size="sm" variant="ghost" onClick={() => setIntegrityPanel(null)}>✕</Button>
            </div>
            <div className="text-sm font-medium">{integrityPanel.person.name}</div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              {integrityPanel.person.kutumb_id}
            </div>
            {integrityPanel.issues.length > 0 ? (
              <div className="bg-destructive/10 text-destructive rounded p-2 text-xs space-y-1">
                {integrityPanel.issues.map((i) => <div key={i}>⚠ {i}</div>)}
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-700 rounded p-2 text-xs">✓ No issues found</div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {integrityPanel.incoming.length} incoming · {integrityPanel.outgoing.length} outgoing edges
            </div>
          </Card>
        </div>
      )}

      {/* Edge-create dialog (drag-to-connect) */}
      {pendingEdge && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={() => setPendingEdge(null)}
        >
          <Card className="p-5 w-[380px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-base mb-1">Create relationship</div>
            <div className="text-xs text-muted-foreground mb-4">
              <span className="font-medium">{pendingEdge.sourceName}</span>
              {" → "}
              <span className="font-medium">{pendingEdge.targetName}</span>
            </div>
            <div className="space-y-2">
              <Button className="w-full justify-start" variant="outline" onClick={() => void submitPendingEdge("parent_of", "biological")}>
                👨‍👦 Parent of (biological)
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => void submitPendingEdge("parent_of", "adopted")}>
                👨‍👦 Parent of (adopted)
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => void submitPendingEdge("parent_of", "step")}>
                👨‍👦 Parent of (step)
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => void submitPendingEdge("spouse_of", "biological")}>
                💑 Spouse of
              </Button>
            </div>
            <div className="flex justify-end mt-4">
              <Button size="sm" variant="ghost" onClick={() => setPendingEdge(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Add dialogs */}
      {pendingAdd?.dir === "child" && (
        <AddChildDialog
          anchorName={pendingAdd.anchorName}
          anchorGender={pendingAdd.anchorGender}
          spouseName={pendingAdd.spouseName}
          onConfirm={submitAddChild}
          onCancel={() => setPendingAdd(null)}
        />
      )}
      {pendingAdd?.dir === "parent" && (
        <AddParentsDialog
          anchorName={pendingAdd.anchorName}
          onConfirm={submitAddParents}
          onCancel={() => setPendingAdd(null)}
        />
      )}
      {pendingAdd?.dir === "spouse" && (
        <AddSpouseDialog
          anchorName={pendingAdd.anchorName}
          anchorGender={pendingAdd.anchorGender}
          onConfirm={submitAddSpouse}
          onCancel={() => setPendingAdd(null)}
        />
      )}
      {pendingAdd?.dir === "standalone" && (
        <AddPersonDialog
          onConfirm={submitAddStandalone}
          onCancel={() => setPendingAdd(null)}
        />
      )}

      {/* Profile side panel */}
      <NodeProfilePanel
        nodeId={profileNodeId}
        onClose={() => setProfileNodeId(null)}
        parentNames={profileParentNames}
      />
    </div>
  );
};

// ─── Shared: DOB masked input (type DDMMYYYY, displays DD/MM/YYYY) ─────────────

const DOBInput: React.FC<{ value: string; onChange: (v: string) => void; onKeyDown?: React.KeyboardEventHandler }> = ({ value, onChange, onKeyDown }) => {
  const [display, setDisplay] = React.useState(() => {
    if (!value) return "";
    const [y, m, d] = value.split("-");
    return y && m && d ? `${d}/${m}/${y}` : "";
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    let disp = raw;
    if (raw.length > 4) disp = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    else if (raw.length > 2) disp = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    setDisplay(disp);
    if (raw.length === 8) {
      onChange(`${raw.slice(4)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`);
    } else {
      onChange("");
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder="DD/MM/YYYY"
      maxLength={10}
      className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
};

// ─── Shared: Gender toggle ────────────────────────────────────────────────────

const GenderToggle: React.FC<{ value: "male" | "female" | "other"; onChange: (g: "male" | "female" | "other") => void }> = ({ value, onChange }) => (
  <div className="flex gap-2">
    {(["male", "female", "other"] as const).map((g) => (
      <button
        key={g}
        type="button"
        onClick={() => onChange(g)}
        className={`flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors ${
          value === g ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"
        }`}
      >
        {g === "male" ? "♂ Male" : g === "female" ? "♀ Female" : "— Other"}
      </button>
    ))}
  </div>
);

// ─── Shared: name + DOB + gender mini-form ────────────────────────────────────

interface PersonFormState { firstName: string; lastName: string; dob: string; gender: "male" | "female" | "other"; }

function usePersonForm(defaultGender: "male" | "female" | "other" = "male") {
  const [state, setState] = React.useState<PersonFormState>({ firstName: "", lastName: "", dob: "", gender: defaultGender });
  const setField = (k: "firstName" | "lastName" | "dob") => (v: string) =>
    setState((s) => ({ ...s, [k]: v }));
  const setGender = (v: "male" | "female" | "other") =>
    setState((s) => ({ ...s, gender: v }));
  return { state, setField, setGender };
}

// ─── Add Child Dialog ─────────────────────────────────────────────────────────

interface AddChildDialogProps {
  anchorName: string;
  anchorGender?: string;
  spouseName?: string;
  onConfirm: (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other", subtype: EdgeSubtype) => Promise<void>;
  onCancel: () => void;
}

const AddChildDialog: React.FC<AddChildDialogProps> = ({ anchorName, anchorGender, spouseName, onConfirm, onCancel }) => {
  const { state, setField, setGender } = usePersonForm("male");
  const [subtype, setSubtype] = React.useState<EdgeSubtype>("biological");
  const [saving, setSaving] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const fatherName = anchorGender?.toLowerCase() === "female" ? spouseName ?? "" : anchorName;
  const motherName = anchorGender?.toLowerCase() === "female" ? anchorName : spouseName ?? "";

  const handleSubmit = async () => {
    if (!state.firstName.trim()) return;
    setSaving(true);
    await onConfirm(state.firstName.trim(), state.lastName.trim(), state.dob, state.gender, subtype);
    setSaving(false);
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") onCancel(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <Card className="p-5 w-[420px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-base mb-0.5">Add child</div>
        <div className="text-xs text-muted-foreground mb-3">
          {fatherName && <span>Father: <strong>{fatherName}</strong></span>}
          {fatherName && motherName && <span className="mx-1.5">·</span>}
          {motherName && <span>Mother: <strong>{motherName}</strong></span>}
          {!fatherName && !motherName && <span>Child of <strong>{anchorName}</strong></span>}
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">First name *</label>
            <input ref={firstRef} value={state.firstName} onChange={(e) => setField("firstName")(e.target.value)} onKeyDown={onKey} placeholder="e.g. Ravi" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Last name</label>
            <input value={state.lastName} onChange={(e) => setField("lastName")(e.target.value)} onKeyDown={onKey} placeholder="optional" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">Date of birth</label>
          <DOBInput value={state.dob} onChange={setField("dob")} onKeyDown={onKey} />
        </div>

        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">Gender *</label>
          <GenderToggle value={state.gender} onChange={setGender} />
        </div>

        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Relationship type</label>
          <div className="flex gap-2">
            {(["biological", "adopted", "step"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSubtype(s)}
                className={`flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors capitalize ${subtype === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!state.firstName.trim() || saving}>
            {saving ? "Adding…" : "Add member"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ─── Add Parents Dialog ───────────────────────────────────────────────────────

interface AddParentsDialogProps {
  anchorName: string;
  onConfirm: (father: { firstName: string; lastName: string; dob: string } | null, mother: { firstName: string; lastName: string; dob: string } | null) => Promise<void>;
  onCancel: () => void;
}

const AddParentsDialog: React.FC<AddParentsDialogProps> = ({ anchorName, onConfirm, onCancel }) => {
  const { state: father, setField: setF } = usePersonForm("male");
  const { state: mother, setField: setM } = usePersonForm("female");
  const [saving, setSaving] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const handleSubmit = async () => {
    const f = father.firstName.trim() ? { firstName: father.firstName.trim(), lastName: father.lastName.trim(), dob: father.dob } : null;
    const m = mother.firstName.trim() ? { firstName: mother.firstName.trim(), lastName: mother.lastName.trim(), dob: mother.dob } : null;
    if (!f && !m) return;
    setSaving(true);
    await onConfirm(f, m);
    setSaving(false);
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") onCancel(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <Card className="p-5 w-[480px] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-base mb-0.5">Add parents</div>
        <div className="text-xs text-muted-foreground mb-4">Parents of <strong>{anchorName}</strong></div>

        <div className="flex gap-4 mb-4">
          {/* Father */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Father</div>
            <div className="space-y-2">
              <input ref={firstRef} value={father.firstName} onChange={(e) => setF("firstName")(e.target.value)} onKeyDown={onKey} placeholder="First name *" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <input value={father.lastName} onChange={(e) => setF("lastName")(e.target.value)} onKeyDown={onKey} placeholder="Last name" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <DOBInput value={father.dob} onChange={setF("dob")} onKeyDown={onKey} />
            </div>
          </div>
          <div className="w-px bg-border self-stretch" />
          {/* Mother */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Mother</div>
            <div className="space-y-2">
              <input value={mother.firstName} onChange={(e) => setM("firstName")(e.target.value)} onKeyDown={onKey} placeholder="First name *" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <input value={mother.lastName} onChange={(e) => setM("lastName")(e.target.value)} onKeyDown={onKey} placeholder="Last name" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <DOBInput value={mother.dob} onChange={setM("dob")} onKeyDown={onKey} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={(!father.firstName.trim() && !mother.firstName.trim()) || saving}>
            {saving ? "Adding…" : "Add parents"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ─── Add Spouse Dialog ────────────────────────────────────────────────────────

interface AddSpouseDialogProps {
  anchorName: string;
  anchorGender?: string;
  onConfirm: (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other") => Promise<void>;
  onCancel: () => void;
}

const AddSpouseDialog: React.FC<AddSpouseDialogProps> = ({ anchorName, anchorGender, onConfirm, onCancel }) => {
  const defaultGender: "male" | "female" | "other" = anchorGender?.toLowerCase() === "male" ? "female" : anchorGender?.toLowerCase() === "female" ? "male" : "other";
  const { state, setField, setGender } = usePersonForm(defaultGender);
  const [saving, setSaving] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const handleSubmit = async () => {
    if (!state.firstName.trim()) return;
    setSaving(true);
    await onConfirm(state.firstName.trim(), state.lastName.trim(), state.dob, state.gender);
    setSaving(false);
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") onCancel(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <Card className="p-5 w-[420px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-base mb-0.5">Add spouse</div>
        <div className="text-xs text-muted-foreground mb-4">Spouse of <strong>{anchorName}</strong></div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">First name *</label>
            <input ref={firstRef} value={state.firstName} onChange={(e) => setField("firstName")(e.target.value)} onKeyDown={onKey} placeholder="e.g. Priya" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Last name</label>
            <input value={state.lastName} onChange={(e) => setField("lastName")(e.target.value)} onKeyDown={onKey} placeholder="optional" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">Date of birth</label>
          <DOBInput value={state.dob} onChange={setField("dob")} onKeyDown={onKey} />
        </div>

        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Gender *</label>
          <GenderToggle value={state.gender} onChange={setGender} />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!state.firstName.trim() || saving}>
            {saving ? "Adding…" : "Add as spouse"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ─── Add Person Dialog (standalone) ──────────────────────────────────────────

interface AddPersonDialogProps {
  onConfirm: (firstName: string, lastName: string, dob: string, gender: "male" | "female" | "other") => Promise<void>;
  onCancel: () => void;
}

const AddPersonDialog: React.FC<AddPersonDialogProps> = ({ onConfirm, onCancel }) => {
  const { state, setField, setGender } = usePersonForm("male");
  const [saving, setSaving] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const handleSubmit = async () => {
    if (!state.firstName.trim()) return;
    setSaving(true);
    await onConfirm(state.firstName.trim(), state.lastName.trim(), state.dob, state.gender);
    setSaving(false);
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") onCancel(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <Card className="p-5 w-[420px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-base mb-4">Add person to tree</div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">First name *</label>
            <input ref={firstRef} value={state.firstName} onChange={(e) => setField("firstName")(e.target.value)} onKeyDown={onKey} placeholder="e.g. Ravi" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Last name</label>
            <input value={state.lastName} onChange={(e) => setField("lastName")(e.target.value)} onKeyDown={onKey} placeholder="optional" className="w-full border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">Date of birth</label>
          <DOBInput value={state.dob} onChange={setField("dob")} onKeyDown={onKey} />
        </div>

        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Gender *</label>
          <GenderToggle value={state.gender} onChange={setGender} />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!state.firstName.trim() || saving}>
            {saving ? "Adding…" : "Add person"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default TreeCanvasV2;
