/**
 * /tree-v2 page.
 *
 * If the user is authenticated and has a vansha_id → real canvas (TreeCanvasV2).
 * Otherwise → demo canvas with static mock data showing all UI features.
 */
import React, { useMemo, useCallback, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
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
  MarkerType,
  Panel,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import TreeCanvasV2 from "@/components/tree/TreeCanvasV2";
import FamilyNode from "@/components/tree/FamilyNode";
import { getPersistedVanshaId } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ─── Demo data ────────────────────────────────────────────────────────────────

const demoNodeTypes = { familyNode: FamilyNode };

const DEMO_NODES: Node[] = [
  { id: "1", type: "familyNode", position: { x: 220, y: 400 }, data: { name: "रामदास शर्मा",   kutumbId: "KM3X8H2A", relation: "दादा",   gender: "male",   generation: 0 } },
  { id: "2", type: "familyNode", position: { x: 420, y: 400 }, data: { name: "सावित्री देवी",  kutumbId: "KM7Y9K1B", relation: "दादी",   gender: "female", generation: 0 } },
  { id: "3", type: "familyNode", position: { x: 120, y: 200 }, data: { name: "महेश शर्मा",    kutumbId: "KM2P5R4C", relation: "पिता",   gender: "male",   generation: 1 } },
  { id: "4", type: "familyNode", position: { x: 320, y: 200 }, data: { name: "सुमन शर्मा",    kutumbId: "KM8T3N6D", relation: "माता",   gender: "female", generation: 1 } },
  { id: "5", type: "familyNode", position: { x: 20,  y: 0   }, data: { name: "अमित शर्मा",    kutumbId: "KM5W7Q9E", relation: "self",   gender: "male",   generation: 2 } },
  { id: "6", type: "familyNode", position: { x: 220, y: 0   }, data: { name: "प्रिया शर्मा",  kutumbId: "KM1V4U2F", relation: "पत्नी",  gender: "female", generation: 2 } },
  { id: "7", type: "familyNode", position: { x: -80, y: -200}, data: { name: "आरव शर्मा",     kutumbId: "KM9S6L8G", relation: "पुत्र",  gender: "male",   generation: 3 } },
  { id: "8", type: "familyNode", position: { x: 120, y: -200}, data: { name: "आन्या शर्मा",   kutumbId: "KM4R2M3H", relation: "पुत्री", gender: "female", generation: 3 } },
];

const pink = "#ec4899";
const gray = "#475569";

const DEMO_EDGES: Edge[] = [
  // Spouse edges — side-to-side (right handle of left node → left handle of right node)
  { id: "e1-2", source: "1", target: "2", sourceHandle: "s-right", targetHandle: "s-left", type: "straight", style: { stroke: pink, strokeWidth: 2 } },
  { id: "e3-4", source: "3", target: "4", sourceHandle: "s-right", targetHandle: "s-left", type: "straight", style: { stroke: pink, strokeWidth: 2 } },
  { id: "e5-6", source: "5", target: "6", sourceHandle: "s-right", targetHandle: "s-left", type: "straight", style: { stroke: pink, strokeWidth: 2 } },
  // Parent → child edges (top of parent → bottom of child; BT: parent is lower, child is higher)
  { id: "e1-3", source: "1", target: "3", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
  { id: "e2-3", source: "2", target: "3", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
  { id: "e3-5", source: "3", target: "5", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
  { id: "e4-5", source: "4", target: "5", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
  { id: "e5-7", source: "5", target: "7", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
  { id: "e6-8", source: "6", target: "8", sourceHandle: "s-top", targetHandle: "s-bottom", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray }, style: { stroke: gray, strokeWidth: 1.5 } },
];

// ─── Relationship dialog (shared between demo and real) ────────────────────────

interface RelDialogProps {
  sourceName: string;
  targetName: string;
  onSelect: (type: "parent_of" | "spouse_of", subtype: "biological" | "adopted" | "step") => void;
  onCancel: () => void;
}

const RelDialog: React.FC<RelDialogProps> = ({ sourceName, targetName, onSelect, onCancel }) => (
  <div
    className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    onClick={onCancel}
  >
    <Card className="p-5 w-[380px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
      <div className="font-semibold text-base mb-1">Create relationship</div>
      <div className="text-xs text-muted-foreground mb-4">
        <span className="font-medium">{sourceName}</span>
        {" → "}
        <span className="font-medium">{targetName}</span>
      </div>
      <div className="space-y-2">
        <Button className="w-full justify-start" variant="outline" onClick={() => onSelect("parent_of", "biological")}>👨‍👦 Parent of (biological)</Button>
        <Button className="w-full justify-start" variant="outline" onClick={() => onSelect("parent_of", "adopted")}>👨‍👦 Parent of (adopted)</Button>
        <Button className="w-full justify-start" variant="outline" onClick={() => onSelect("parent_of", "step")}>👨‍👦 Parent of (step)</Button>
        <Button className="w-full justify-start" variant="outline" onClick={() => onSelect("spouse_of", "biological")}>💑 Spouse of</Button>
      </div>
      <div className="flex justify-end mt-4">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  </div>
);

// ─── Demo canvas ──────────────────────────────────────────────────────────────

type CtxMenu = { x: number; y: number; kind: "node" | "edge"; id: string; name?: string } | null;
type PendingEdge = { source: string; target: string; sourceName: string; targetName: string } | null;

const TreeCanvasV2Demo: React.FC = () => {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState(DEMO_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEMO_EDGES);
  const [ctx, setCtx] = useState<CtxMenu>(null);
  const [pending, setPending] = useState<PendingEdge>(null);
  const [vanshCode, setVanshCode] = useState("");

  const onNodeCtx: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault();
    const d = node.data as { name?: string };
    setCtx({ x: e.clientX, y: e.clientY, kind: "node", id: node.id, name: d.name });
  }, []);

  const onEdgeCtx: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, kind: "edge", id: edge.id });
  }, []);

  const onConnect: OnConnect = useCallback((conn) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    // Guard: only one relationship per pair (either direction)
    const alreadyLinked = edges.some(
      (e) =>
        (e.source === conn.source && e.target === conn.target) ||
        (e.source === conn.target && e.target === conn.source),
    );
    if (alreadyLinked) {
      toast.error("These two people are already connected");
      return;
    }
    const a = nodes.find((n) => n.id === conn.source);
    const b = nodes.find((n) => n.id === conn.target);
    const an = (a?.data as { name?: string })?.name ?? conn.source;
    const bn = (b?.data as { name?: string })?.name ?? conn.target;
    setPending({ source: conn.source, target: conn.target, sourceName: an, targetName: bn });
  }, [nodes, edges]);

  const submitEdge = useCallback((type: "parent_of" | "spouse_of", _subtype: "biological" | "adopted" | "step") => {
    if (!pending) return;
    const isSpouse = type === "spouse_of";

    // Pick side handles for spouse (horizontal), top/bottom for parent-child (vertical).
    const srcNode = nodes.find((n) => n.id === pending.source);
    const tgtNode = nodes.find((n) => n.id === pending.target);
    const srcX = srcNode?.position.x ?? 0;
    const tgtX = tgtNode?.position.x ?? 0;
    const sourceHandle = isSpouse ? (srcX <= tgtX ? "s-right" : "s-left") : "s-top";
    const targetHandle = isSpouse ? (srcX <= tgtX ? "s-left"  : "s-right") : "s-bottom";

    const newEdge: Edge = {
      id: `e${pending.source}-${pending.target}`,
      source: pending.source,
      target: pending.target,
      sourceHandle,
      targetHandle,
      type: isSpouse ? "straight" : "smoothstep",
      style: { stroke: isSpouse ? pink : gray, strokeWidth: isSpouse ? 2 : 1.5 },
      markerEnd: isSpouse ? undefined : { type: MarkerType.ArrowClosed, width: 14, height: 14, color: gray },
    };
    setEdges((es) => [...es, newEdge]);
    toast.success(`${isSpouse ? "Spouse" : "Parent"} link added (demo — sign in to save)`);
    setPending(null);
  }, [pending, nodes, setEdges]);

  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setCtx(null);
    toast.success("Removed from demo (sign in to save changes)");
  }, [setNodes, setEdges]);

  const deleteEdge = useCallback((id: string) => {
    setEdges((es) => es.filter((e) => e.id !== id));
    setCtx(null);
  }, [setEdges]);

  return (
    <div className="w-full h-screen" onClick={() => setCtx(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={demoNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeCtx}
        onEdgeContextMenu={onEdgeCtx}
        onConnect={onConnect}
        onPaneClick={() => setCtx(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
        nodesConnectable
        nodesDraggable
        connectionMode={ConnectionMode.Loose}
      >
        <Background gap={24} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const g = (n.data as Record<string, unknown>)?.gender as string | undefined;
            return g === "male" ? "#dbeafe" : g === "female" ? "#fce7f3" : "#f1f5f9";
          }}
          zoomable pannable
        />

        <Panel position="top-left">
          <div className="bg-background/95 border rounded-lg shadow px-3 py-2.5 text-sm space-y-2 min-w-[240px]">
            <div>
              <div className="font-semibold">Demo Tree — शर्मा वंश</div>
              <div className="text-xs text-muted-foreground font-mono">VS-DEMO (read-only)</div>
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Drag purple handles to connect · Right-click nodes/edges
            </div>

            <div className="border-t pt-2 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Load your own tree</div>
              <div className="flex gap-1">
                <input
                  value={vanshCode}
                  onChange={(e) => setVanshCode(e.target.value.trim().toUpperCase())}
                  placeholder="VS code…"
                  className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (vanshCode) navigate(`/tree-v2?vansh_code=${encodeURIComponent(vanshCode)}`);
                  }}
                >
                  Go
                </Button>
              </div>
              <Button size="sm" className="w-full" onClick={() => navigate("/signin")}>
                Sign in to use your tree
              </Button>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {ctx && (
        <div
          className="fixed z-50 bg-background border rounded-lg shadow-xl py-1 min-w-[200px] text-sm"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.kind === "node" ? (
            <>
              <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1 truncate">
                {ctx.name ?? ctx.id}
              </div>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { toast.info("Sign in to edit profiles"); setCtx(null); }}>✏️ Edit profile</button>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { toast.info("Sign in to add members"); setCtx(null); }}>➕ Add relative</button>
              <div className="border-t my-1" />
              <button className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive" onClick={() => deleteNode(ctx.id)}>🗑 Remove (demo)</button>
            </>
          ) : (
            <button className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive" onClick={() => deleteEdge(ctx.id)}>🗑 Delete relationship</button>
          )}
        </div>
      )}

      {pending && (
        <RelDialog
          sourceName={pending.sourceName}
          targetName={pending.targetName}
          onSelect={submitEdge}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

// ─── Nav overlay ─────────────────────────────────────────────────────────────

const VanshavaliNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const canGoBack = location.key !== "default";

  return (
    <div style={{
      position: "fixed", top: 12, left: 12, zIndex: 100,
      display: "flex", gap: 6, alignItems: "center",
    }}>
      {canGoBack && (
        <button
          onClick={() => navigate(-1)}
          title="Go back"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(148,163,184,0.4)",
            boxShadow: "0 2px 8px rgba(15,23,42,0.10)",
            fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
      )}
      <button
        onClick={() => navigate("/dashboard")}
        title="Home"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "7px 12px", borderRadius: 8,
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(148,163,184,0.4)",
          boxShadow: "0 2px 8px rgba(15,23,42,0.10)",
          fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Home
      </button>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const TreePageV2: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { appUser } = useAuth();

  const vanshaId = useMemo(
    () =>
      (
        searchParams.get("vansha_id") ??
        appUser?.vansha_id ??
        import.meta.env.VITE_DEFAULT_VANSHA_ID ??
        getPersistedVanshaId() ??
        ""
      ).trim(),
    [searchParams, appUser?.vansha_id],
  );

  if (!vanshaId) {
    navigate("/signin", { replace: true });
    return null;
  }

  return (
    <>
      <VanshavaliNav />
      <TreeCanvasV2 vanshaId={vanshaId} />
    </>
  );
};

export default TreePageV2;
