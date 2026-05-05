/**
 * TreeCanvasV2 — React Flow powered family tree canvas.
 * Drag-drop, pan, zoom, click-to-select, right-click context menu, edge delete.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnConnect,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { fetchVanshaTree, deletePerson } from "@/services/api";
import {
  listRelationships,
  deleteRelationship,
  createRelationship,
  setNodeOffset,
  getVansha,
  getIntegrity,
  type Relationship,
  type VanshaMeta,
} from "@/services/treeV2Api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
};

type ContextMenu =
  | { kind: "node"; x: number; y: number; nodeId: string; name: string }
  | { kind: "edge"; x: number; y: number; edgeId: string; relId: string };

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 70;
const H_GAP = 60;
const V_GAP = 120;

// ─── Layout: BFS from roots via parent_of edges ───────────────────────────────

function buildLayout(
  persons: RawPerson[],
  rels: Relationship[],
): Map<string, { x: number; y: number }> {
  const parentOf = rels.filter((r) => r.type === "parent_of");
  const spouseOf = rels.filter((r) => r.type === "spouse_of");

  // Build partner map.
  const partnerOf = new Map<string, string>();
  spouseOf.forEach((r) => {
    partnerOf.set(r.from_node_id, r.to_node_id);
    partnerOf.set(r.to_node_id, r.from_node_id);
  });

  // Children per node.
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  parentOf.forEach((r) => {
    const arr = childrenOf.get(r.from_node_id) ?? [];
    arr.push(r.to_node_id);
    childrenOf.set(r.from_node_id, arr);
    hasParent.add(r.to_node_id);
  });

  // Roots = persons with no incoming parent_of.
  const roots = persons.filter((p) => !hasParent.has(p.node_id));

  // BFS assigns generation.
  const gen = new Map<string, number>();
  const queue: string[] = [];
  roots.forEach((r) => { gen.set(r.node_id, 0); queue.push(r.node_id); });
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id) ?? 0;
    (childrenOf.get(id) ?? []).forEach((cid) => {
      if (!gen.has(cid)) { gen.set(cid, g + 1); queue.push(cid); }
    });
  }
  persons.forEach((p) => { if (!gen.has(p.node_id)) gen.set(p.node_id, 0); });

  // Group by generation, order so spouses sit adjacent.
  const byGen = new Map<number, string[]>();
  persons.forEach((p) => {
    const g = gen.get(p.node_id) ?? 0;
    const arr = byGen.get(g) ?? [];
    arr.push(p.node_id);
    byGen.set(g, arr);
  });

  const positions = new Map<string, { x: number; y: number }>();
  Array.from(byGen.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([g, ids]) => {
      // Order: place spouses next to each other.
      const ordered: string[] = [];
      const seen = new Set<string>();
      ids.forEach((id) => {
        if (seen.has(id)) return;
        ordered.push(id);
        seen.add(id);
        const partner = partnerOf.get(id);
        if (partner && ids.includes(partner) && !seen.has(partner)) {
          ordered.push(partner);
          seen.add(partner);
        }
      });
      const totalW = ordered.length * (NODE_WIDTH + H_GAP);
      ordered.forEach((id, i) => {
        positions.set(id, {
          x: i * (NODE_WIDTH + H_GAP) - totalW / 2 + NODE_WIDTH / 2,
          y: g * (NODE_HEIGHT + V_GAP),
        });
      });
    });

  return positions;
}

// ─── Node colour ─────────────────────────────────────────────────────────────

function nodeColor(gender?: string) {
  if (gender === "male") return "#dbeafe";
  if (gender === "female") return "#fce7f3";
  return "#f3f4f6";
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { vanshaId: string }

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
  const [integrityPanel, setIntegrityPanel] = useState<Awaited<ReturnType<typeof getIntegrity>> | null>(null);

  // Save drag offset after node drag ends (debounced 600ms).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const rawPersons = (tree.persons ?? []) as RawPerson[];
      setPersons(rawPersons);
      setRels(edges);
      setVansha(meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [vanshaId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Build React Flow nodes + edges from persons + relationships ────────────

  useEffect(() => {
    if (!persons.length) return;
    const layout = buildLayout(persons, rels);

    const nodes: Node[] = persons.map((p) => {
      const auto = layout.get(p.node_id) ?? { x: 0, y: 0 };
      const ox = Number(p.canvas_offset_x ?? 0);
      const oy = Number(p.canvas_offset_y ?? 0);
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(unnamed)";
      return {
        id: p.node_id,
        position: { x: auto.x + ox, y: auto.y + oy },
        data: {
          label: (
            <div style={{ textAlign: "center", padding: "4px 8px" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{p.kutumb_id ?? ""}</div>
              {p.relation && (
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>{p.relation}</div>
              )}
            </div>
          ),
          nodeId: p.node_id,
          name,
        },
        style: {
          background: nodeColor(p.gender as string),
          border: "1px solid #94a3b8",
          borderRadius: 8,
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          cursor: "grab",
        },
      };
    });

    const edges: Edge[] = rels.map((r) => {
      const isSpouse = r.type === "spouse_of";
      const isAdopted = r.subtype === "adopted";
      const isStep = r.subtype === "step";
      return {
        id: r.id,
        source: r.from_node_id,
        target: r.to_node_id,
        data: { relId: r.id, type: r.type, subtype: r.subtype },
        type: isSpouse ? "straight" : "smoothstep",
        style: {
          stroke: isSpouse ? "#ec4899" : isAdopted ? "#a855f7" : isStep ? "#f59e0b" : "#475569",
          strokeWidth: isSpouse ? 2 : 1.5,
          strokeDasharray: isAdopted ? "6 3" : undefined,
        },
        markerEnd: isSpouse ? undefined : { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        label: isAdopted ? "adopted" : isStep ? "step" : undefined,
        labelStyle: { fontSize: 9, fill: "#94a3b8" },
      };
    });

    setRfNodes(nodes);
    setRfEdges(edges);
  }, [persons, rels, setRfNodes, setRfEdges]);

  // ── Save position after drag ───────────────────────────────────────────────

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void setNodeOffset(node.id, node.position.x, node.position.y).catch(() =>
          toast.error("Could not save position"),
        );
      }, 600);
    },
    [],
  );

  // ── Context menus ──────────────────────────────────────────────────────────

  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault();
    setContextMenu({
      kind: "node",
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      name: (node.data.name as string) ?? "",
    });
  }, []);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault();
    setContextMenu({
      kind: "edge",
      x: e.clientX,
      y: e.clientY,
      edgeId: edge.id,
      relId: (edge.data?.relId as string) ?? edge.id,
    });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDeleteNode = async (nodeId: string) => {
    closeMenu();
    if (!window.confirm("Delete this person and all their relationships?")) return;
    try {
      await deletePerson(nodeId);
      setRfNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setRfEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
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
      setRfEdges((es) => es.filter((e) => e.id !== relId));
      setRels((rs) => rs.filter((r) => r.id !== relId));
      toast.success("Relationship removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading tree…</div>;
  if (error) return <div className="flex items-center justify-center h-screen text-destructive">{error}</div>;

  return (
    <div className="w-full h-screen" onClick={closeMenu}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={closeMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <Background gap={20} color="#e2e8f0" />
        <Controls />
        <MiniMap nodeColor={(n) => nodeColor((n.data as { gender?: string }).gender)} zoomable pannable />

        <Panel position="top-left">
          <div className="bg-background/95 border rounded-lg shadow px-3 py-2 text-sm space-y-1">
            {vansha && (
              <>
                <div className="font-semibold">{vansha.vansh_name ?? "वंश वृक्ष"}</div>
                <div className="text-xs text-muted-foreground font-mono">{vansha.vansh_code}</div>
              </>
            )}
            <div className="flex gap-1 pt-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => void refresh()}>↺ Reload</Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/tree")}>← Old view</Button>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Right-click node or line to edit/delete
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-background border rounded-lg shadow-xl py-1 min-w-[180px] text-sm"
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
                onClick={() => { navigate(`/node/${contextMenu.nodeId}`); closeMenu(); }}
              >
                ✏️ Open & edit profile
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-muted"
                onClick={() => void handleViewIntegrity(contextMenu.nodeId)}
              >
                🔍 Check integrity
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
                Relationship
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
            <div className="text-xs text-muted-foreground mb-2 font-mono">{integrityPanel.person.kutumb_id}</div>
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
    </div>
  );
};

export default TreeCanvasV2;
