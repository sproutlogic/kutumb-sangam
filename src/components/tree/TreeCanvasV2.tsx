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
import { useNavigate } from "react-router-dom";
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

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_WIDTH = 168;
const NODE_HEIGHT = 76;
const RANK_SEP = 130; // vertical space between generations
const NODE_SEP = 48; // horizontal space between siblings
const SPOUSE_GAP = 18; // pixels between two spouse cards on the same rank

// ─── Dagre layout (BT — ancestors bottom, descendants top) ────────────────────

function computeAutoLayout(
  persons: RawPerson[],
  rels: Relationship[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "BT",
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
}

const TreeCanvasV2: React.FC<Props> = ({ vanshaId }) => {
  const navigate = useNavigate();

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

  const autoLayout = useMemo(() => computeAutoLayout(persons, rels), [persons, rels]);
  const generations = useMemo(() => computeGenerations(persons, rels), [persons, rels]);

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

  // Initialize / clamp window when range changes.
  useEffect(() => {
    setGenWindow((curr) => {
      if (!curr) return [genRange[0], genRange[1]];
      return [
        Math.max(genRange[0], Math.min(curr[0], genRange[1])),
        Math.max(genRange[0], Math.min(curr[1], genRange[1])),
      ];
    });
  }, [genRange]);

  // ── Build React Flow nodes + edges ─────────────────────────────────────────
  // edgeHandles must be declared before this effect.

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
          data: {
            nodeId: p.node_id,
            name,
            gender: p.gender,
            kutumbId: p.kutumb_id,
            generation: g,
            relation: p.relation,
            hasOffset,
          },
        };
      });

    const edges: Edge[] = rels
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
  }, [persons, rels, autoLayout, generations, genWindow, genRange, edgeHandles, setRfNodes, setRfEdges]);

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
      // Guard: only one relationship per pair
      const alreadyLinked = rels.some(
        (r) =>
          (r.from_node_id === conn.source && r.to_node_id === conn.target) ||
          (r.from_node_id === conn.target && r.to_node_id === conn.source),
      );
      if (alreadyLinked) {
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

  const handleAddChild = (anchorNodeId: string) => {
    closeMenu();
    navigate(`/node?anchor_node_id=${encodeURIComponent(anchorNodeId)}`);
  };

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

  const [winLo, winHi] = genWindow ?? genRange;
  const [rangeLo, rangeHi] = genRange;
  const totalGens = rangeHi - rangeLo + 1;

  return (
    <div className="w-full h-screen" onClick={closeMenu}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={onConnect}
        onPaneClick={closeMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
      >
        <Background gap={24} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const g = ((n.data as Record<string, unknown>)?.gender as string | undefined);
            return g === "male" ? "#dbeafe" : g === "female" ? "#fce7f3" : "#f1f5f9";
          }}
          zoomable
          pannable
        />

        <Panel position="top-left">
          <div className="bg-background/95 border rounded-lg shadow px-3 py-2 text-sm space-y-1.5 min-w-[220px]">
            <div>
              <div className="font-semibold">{vansha?.vansh_name ?? "वंश वृक्ष"}</div>
              {vansha?.vansh_code && (
                <div className="text-xs text-muted-foreground font-mono">{vansha.vansh_code}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {persons.length} member{persons.length === 1 ? "" : "s"} · {totalGens} generation
              {totalGens === 1 ? "" : "s"}
            </div>

            {totalGens > 1 && (
              <div className="pt-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Show generations G{winLo} → G{winHi}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={rangeLo}
                    max={rangeHi}
                    value={winLo}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setGenWindow((curr) => {
                        const hi = curr ? curr[1] : rangeHi;
                        return [v, Math.max(v, hi)];
                      });
                    }}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min={rangeLo}
                    max={rangeHi}
                    value={winHi}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setGenWindow((curr) => {
                        const lo = curr ? curr[0] : rangeLo;
                        return [Math.min(lo, v), v];
                      });
                    }}
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-1 pt-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => void refresh()}>
                ↺ Reload
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/tree")}>
                ← Old view
              </Button>
              <Button size="sm" variant="default" onClick={() => navigate("/node")}>
                + Add member
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 leading-tight">
              Drag handles to connect · Right-click to edit · Roots at bottom
            </div>
          </div>
        </Panel>
      </ReactFlow>

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
                onClick={() => {
                  navigate(`/node/${contextMenu.nodeId}`);
                  closeMenu();
                }}
              >
                ✏️ Open & edit profile
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => handleAddChild(contextMenu.nodeId)}
              >
                ➕ Add relative anchored here
              </button>
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
              <Button size="sm" variant="ghost" onClick={() => setIntegrityPanel(null)}>
                ✕
              </Button>
            </div>
            <div className="text-sm font-medium">{integrityPanel.person.name}</div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              {integrityPanel.person.kutumb_id}
            </div>
            {integrityPanel.issues.length > 0 ? (
              <div className="bg-destructive/10 text-destructive rounded p-2 text-xs space-y-1">
                {integrityPanel.issues.map((i) => (
                  <div key={i}>⚠ {i}</div>
                ))}
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-700 rounded p-2 text-xs">
                ✓ No issues found
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {integrityPanel.incoming.length} incoming · {integrityPanel.outgoing.length} outgoing
              edges
            </div>
          </Card>
        </div>
      )}

      {/* Edge-create dialog */}
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
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void submitPendingEdge("parent_of", "biological")}
              >
                👨‍👦 Parent of (biological)
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void submitPendingEdge("parent_of", "adopted")}
              >
                👨‍👦 Parent of (adopted)
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void submitPendingEdge("parent_of", "step")}
              >
                👨‍👦 Parent of (step)
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => void submitPendingEdge("spouse_of", "biological")}
              >
                💑 Spouse of
              </Button>
            </div>
            <div className="flex justify-end mt-4">
              <Button size="sm" variant="ghost" onClick={() => setPendingEdge(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TreeCanvasV2;
