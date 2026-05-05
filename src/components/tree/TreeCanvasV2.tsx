/**
 * TreeCanvasV2 — edge-driven tree canvas (Path B).
 *
 * Source of truth: `relationships` edge table (parent_of / spouse_of).
 * Layout: BFS from roots (no parent_of incoming) → generation rows.
 * Per-node manual offset persisted via canvas_offset_x/y.
 *
 * This component is rendered when TreePage detects `?v2=1` in the URL.
 * Old TreePage rendering is untouched.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchVanshaTree } from "@/services/api";
import {
  listRelationships,
  deleteRelationship,
  setNodeOffset,
  clearNodeOffset,
  getIntegrity,
  getVansha,
  type Relationship,
  type VanshaMeta,
} from "@/services/treeV2Api";
import { deletePerson } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type RawPerson = Record<string, unknown> & {
  node_id: string;
  kutumb_id?: string | null;
  vansha_id: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  canvas_offset_x?: number | null;
  canvas_offset_y?: number | null;
};

interface Props {
  vanshaId: string;
}

const NODE_W = 150;
const NODE_H = 60;
const ROW_GAP = 140;
const COL_GAP = 30;

type Position = { x: number; y: number; gen: number };

function computeGenerations(persons: RawPerson[], rels: Relationship[]): Map<string, number> {
  const parentOf = rels.filter((r) => r.type === "parent_of");
  const incomingParents = new Map<string, string[]>();
  parentOf.forEach((r) => {
    const arr = incomingParents.get(r.to_node_id) ?? [];
    arr.push(r.from_node_id);
    incomingParents.set(r.to_node_id, arr);
  });

  // Roots = persons with no parent_of incoming.
  const roots = persons.filter((p) => !(incomingParents.get(p.node_id)?.length));
  const gen = new Map<string, number>();
  roots.forEach((r) => gen.set(r.node_id, 0));

  // BFS down the parent_of edges.
  const queue: string[] = roots.map((r) => r.node_id);
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id) ?? 0;
    parentOf
      .filter((r) => r.from_node_id === id)
      .forEach((r) => {
        const childG = g + 1;
        if (!gen.has(r.to_node_id) || (gen.get(r.to_node_id)! < childG)) {
          gen.set(r.to_node_id, childG);
          queue.push(r.to_node_id);
        }
      });
  }

  // Anyone unreached (orphan with no parent edges and no children) → gen 0.
  persons.forEach((p) => {
    if (!gen.has(p.node_id)) gen.set(p.node_id, 0);
  });
  return gen;
}

function computeAutoPositions(persons: RawPerson[], rels: Relationship[]): Map<string, Position> {
  const gen = computeGenerations(persons, rels);
  const byGen = new Map<number, RawPerson[]>();
  persons.forEach((p) => {
    const g = gen.get(p.node_id) ?? 0;
    const arr = byGen.get(g) ?? [];
    arr.push(p);
    byGen.set(g, arr);
  });

  // Couple awareness: place spouses adjacent.
  const spouseOf = rels.filter((r) => r.type === "spouse_of");
  const partnerOf = new Map<string, string>();
  spouseOf.forEach((s) => {
    partnerOf.set(s.from_node_id, s.to_node_id);
    partnerOf.set(s.to_node_id, s.from_node_id);
  });

  const out = new Map<string, Position>();
  Array.from(byGen.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([g, members]) => {
      // Order members so couples sit next to each other.
      const ordered: RawPerson[] = [];
      const seen = new Set<string>();
      members.forEach((p) => {
        if (seen.has(p.node_id)) return;
        ordered.push(p);
        seen.add(p.node_id);
        const partner = partnerOf.get(p.node_id);
        if (partner) {
          const partnerRow = members.find((m) => m.node_id === partner);
          if (partnerRow && !seen.has(partner)) {
            ordered.push(partnerRow);
            seen.add(partner);
          }
        }
      });

      const totalWidth = ordered.length * (NODE_W + COL_GAP);
      ordered.forEach((p, i) => {
        out.set(p.node_id, {
          x: i * (NODE_W + COL_GAP) - totalWidth / 2 + NODE_W / 2,
          y: g * ROW_GAP,
          gen: g,
        });
      });
    });

  return out;
}

const TreeCanvasV2: React.FC<Props> = ({ vanshaId }) => {
  const navigate = useNavigate();
  const [persons, setPersons] = useState<RawPerson[]>([]);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [vansha, setVansha] = useState<VanshaMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<
    | { kind: "node"; x: number; y: number; nodeId: string }
    | { kind: "edge"; x: number; y: number; edgeId: string }
    | null
  >(null);
  const [integrityFor, setIntegrityFor] = useState<string | null>(null);
  const [integrityData, setIntegrityData] = useState<Awaited<ReturnType<typeof getIntegrity>> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; nodeOrigX: number; nodeOrigY: number } | null>(null);

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
      // Seed offsets from server-side canvas_offset.
      const seeded = new Map<string, { x: number; y: number }>();
      rawPersons.forEach((p) => {
        if (p.canvas_offset_x != null && p.canvas_offset_y != null) {
          seeded.set(p.node_id, { x: Number(p.canvas_offset_x), y: Number(p.canvas_offset_y) });
        }
      });
      setOffsets(seeded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tree");
    } finally {
      setLoading(false);
    }
  }, [vanshaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const positions = useMemo(() => computeAutoPositions(persons, rels), [persons, rels]);

  const finalPos = useCallback(
    (id: string): Position | null => {
      const auto = positions.get(id);
      if (!auto) return null;
      const off = offsets.get(id);
      return off ? { ...auto, x: auto.x + off.x, y: auto.y + off.y } : auto;
    },
    [positions, offsets],
  );

  // Drag handlers (document-level so we catch releases outside SVG).
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      setOffsets((prev) => {
        const next = new Map(prev);
        next.set(draggingId, {
          x: dragStartRef.current!.nodeOrigX + dx,
          y: dragStartRef.current!.nodeOrigY + dy,
        });
        return next;
      });
    };
    const onUp = async () => {
      const id = draggingId;
      setDraggingId(null);
      const off = offsets.get(id);
      if (off) {
        try {
          await setNodeOffset(id, off.x, off.y);
        } catch {
          toast.error("Could not save position");
        }
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [draggingId, zoom, offsets]);

  const startDrag = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const off = offsets.get(nodeId) ?? { x: 0, y: 0 };
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeOrigX: off.x, nodeOrigY: off.y };
    setDraggingId(nodeId);
  };

  const onNodeContext = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setContextMenu({ kind: "node", x: e.clientX, y: e.clientY, nodeId });
  };
  const onEdgeContext = (e: React.MouseEvent, edgeId: string) => {
    e.preventDefault();
    setContextMenu({ kind: "edge", x: e.clientX, y: e.clientY, edgeId });
  };

  // Close context menu on any outside click.
  useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => setContextMenu(null);
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [contextMenu]);

  const handleResetOffset = async (id: string) => {
    try {
      await clearNodeOffset(id);
      setOffsets((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      toast.success("Position reset");
    } catch {
      toast.error("Reset failed");
    }
  };

  const handleDeletePerson = async (id: string) => {
    if (!window.confirm("Delete this person and all their relationship edges?")) return;
    try {
      await deletePerson(id);
      setPersons((p) => p.filter((x) => x.node_id !== id));
      setRels((r) => r.filter((e) => e.from_node_id !== id && e.to_node_id !== id));
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    try {
      await deleteRelationship(edgeId);
      setRels((r) => r.filter((e) => e.id !== edgeId));
      toast.success("Relationship removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleViewIntegrity = async (id: string) => {
    setIntegrityFor(id);
    setIntegrityData(null);
    try {
      const r = await getIntegrity(id);
      setIntegrityData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Integrity check failed");
      setIntegrityFor(null);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading tree…</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;

  // Compute SVG viewport.
  const allPositions = persons.map((p) => finalPos(p.node_id)).filter(Boolean) as Position[];
  const minX = Math.min(...allPositions.map((p) => p.x), 0) - NODE_W;
  const maxX = Math.max(...allPositions.map((p) => p.x), 0) + NODE_W * 2;
  const minY = Math.min(...allPositions.map((p) => p.y), 0) - NODE_H;
  const maxY = Math.max(...allPositions.map((p) => p.y), 0) + NODE_H * 2;
  const vbW = Math.max(maxX - minX, 800);
  const vbH = Math.max(maxY - minY, 600);

  return (
    <div className="relative w-full h-[calc(100vh-100px)] bg-muted/20 overflow-hidden">
      <div className="absolute top-2 left-2 z-10 bg-background/95 rounded-md px-3 py-2 shadow border text-sm">
        <div className="font-semibold">Tree v2 (edge-model)</div>
        {vansha && (
          <div className="text-xs text-muted-foreground">
            Vansh code: <span className="font-mono">{vansha.vansh_code}</span>
            {vansha.vansh_name ? ` · ${vansha.vansh_name}` : ""}
          </div>
        )}
        <div className="flex gap-1 mt-1">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>−</Button>
          <Button size="sm" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>Reload</Button>
        </div>
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox={`${minX + pan.x} ${minY + pan.y} ${vbW / zoom} ${vbH / zoom}`}
        style={{ cursor: draggingId ? "grabbing" : "default" }}
      >
        {/* parent_of edges */}
        {rels
          .filter((r) => r.type === "parent_of")
          .map((r) => {
            const from = finalPos(r.from_node_id);
            const to = finalPos(r.to_node_id);
            if (!from || !to) return null;
            const x1 = from.x;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y - NODE_H / 2;
            const midY = (y1 + y2) / 2;
            const stroke = r.subtype === "adopted" ? "#a855f7" : r.subtype === "step" ? "#f59e0b" : "#475569";
            const dash = r.subtype === "adopted" ? "6 3" : "0";
            return (
              <g key={r.id} onContextMenu={(e) => onEdgeContext(e, r.id)} style={{ cursor: "context-menu" }}>
                <path
                  d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`}
                  stroke={stroke}
                  strokeWidth={1.5}
                  strokeDasharray={dash}
                  fill="none"
                />
              </g>
            );
          })}

        {/* spouse_of edges */}
        {rels
          .filter((r) => r.type === "spouse_of")
          .map((r) => {
            const a = finalPos(r.from_node_id);
            const b = finalPos(r.to_node_id);
            if (!a || !b) return null;
            return (
              <line
                key={r.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#ec4899"
                strokeWidth={2}
                onContextMenu={(e) => onEdgeContext(e, r.id)}
                style={{ cursor: "context-menu" }}
              />
            );
          })}

        {/* nodes */}
        {persons.map((p) => {
          const pos = finalPos(p.node_id);
          if (!pos) return null;
          const fill =
            p.gender === "male" ? "#dbeafe" : p.gender === "female" ? "#fce7f3" : "#f3f4f6";
          const isDragging = draggingId === p.node_id;
          return (
            <g
              key={p.node_id}
              transform={`translate(${pos.x - NODE_W / 2}, ${pos.y - NODE_H / 2})`}
              onMouseDown={(e) => startDrag(e, p.node_id)}
              onContextMenu={(e) => onNodeContext(e, p.node_id)}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={fill}
                stroke={isDragging ? "#0ea5e9" : "#94a3b8"}
                strokeWidth={isDragging ? 2 : 1}
              />
              <text x={NODE_W / 2} y={22} textAnchor="middle" fontSize={13} fontWeight={600}>
                {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(unnamed)"}
              </text>
              <text x={NODE_W / 2} y={40} textAnchor="middle" fontSize={10} fill="#64748b">
                {p.kutumb_id ?? "—"}
              </text>
              {offsets.has(p.node_id) && (
                <circle cx={NODE_W - 8} cy={8} r={4} fill="#0ea5e9">
                  <title>Manual position (right-click → Reset position)</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-background border rounded-md shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "node" && (
            <>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { navigate(`/node/${contextMenu.nodeId}`); setContextMenu(null); }}>
                Open profile
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { void handleViewIntegrity(contextMenu.nodeId); setContextMenu(null); }}>
                View integrity
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { void handleResetOffset(contextMenu.nodeId); setContextMenu(null); }}>
                Reset position
              </button>
              <div className="border-t my-1" />
              <button className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive" onClick={() => { void handleDeletePerson(contextMenu.nodeId); setContextMenu(null); }}>
                Delete person
              </button>
            </>
          )}
          {contextMenu.kind === "edge" && (
            <button className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive" onClick={() => { void handleDeleteEdge(contextMenu.edgeId); setContextMenu(null); }}>
              Delete relationship
            </button>
          )}
        </div>
      )}

      {/* Integrity drawer */}
      {integrityFor && (
        <div className="fixed right-4 top-20 z-40 w-[360px]">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Integrity</div>
              <Button size="sm" variant="ghost" onClick={() => setIntegrityFor(null)}>Close</Button>
            </div>
            {!integrityData ? (
              <div className="text-sm text-muted-foreground">Checking…</div>
            ) : (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">{integrityData.person.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{integrityData.person.kutumb_id}</span>
                </div>
                {integrityData.issues.length > 0 ? (
                  <div className="rounded bg-destructive/10 text-destructive p-2 text-xs">
                    {integrityData.issues.map((i) => <div key={i}>• {i}</div>)}
                  </div>
                ) : (
                  <div className="rounded bg-emerald-50 text-emerald-700 p-2 text-xs">No issues detected.</div>
                )}
                <div className="text-xs text-muted-foreground">
                  Edges: {integrityData.incoming.length} in · {integrityData.outgoing.length} out
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default TreeCanvasV2;
