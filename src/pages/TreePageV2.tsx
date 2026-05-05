import React, { useMemo, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import TreeCanvasV2 from "@/components/tree/TreeCanvasV2";
import { getPersistedVanshaId } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

// ─── Demo canvas (no auth required, static mock data) ────────────────────────

const DEMO_NODES: Node[] = [
  { id: "1", position: { x: 300, y: 0 },   data: { label: <NodeLabel name="रामदास शर्मा" id="KM3X8H2A" relation="दादा" gender="male" /> }, style: nodeStyle("male") },
  { id: "2", position: { x: 500, y: 0 },   data: { label: <NodeLabel name="सावित्री देवी" id="KM7Y9K1B" relation="दादी" gender="female" /> }, style: nodeStyle("female") },
  { id: "3", position: { x: 200, y: 200 }, data: { label: <NodeLabel name="महेश शर्मा" id="KM2P5R4C" relation="पिता" gender="male" /> }, style: nodeStyle("male") },
  { id: "4", position: { x: 400, y: 200 }, data: { label: <NodeLabel name="सुमन शर्मा" id="KM8T3N6D" relation="माता" gender="female" /> }, style: nodeStyle("female") },
  { id: "5", position: { x: 100, y: 400 }, data: { label: <NodeLabel name="अमित शर्मा" id="KM5W7Q9E" relation="self" gender="male" /> }, style: nodeStyle("male") },
  { id: "6", position: { x: 300, y: 400 }, data: { label: <NodeLabel name="प्रिया शर्मा" id="KM1V4U2F" relation="पत्नी" gender="female" /> }, style: nodeStyle("female") },
  { id: "7", position: { x: 0,   y: 600 }, data: { label: <NodeLabel name="आरव शर्मा" id="KM9S6L8G" relation="पुत्र" gender="male" /> }, style: nodeStyle("male") },
  { id: "8", position: { x: 200, y: 600 }, data: { label: <NodeLabel name="आन्या शर्मा" id="KM4R2M3H" relation="पुत्री" gender="female" /> }, style: nodeStyle("female") },
];

const DEMO_EDGES: Edge[] = [
  { id: "e1-3", source: "1", target: "3", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
  { id: "e2-3", source: "2", target: "3", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
  { id: "e1-2", source: "1", target: "2", type: "straight", style: { stroke: "#ec4899", strokeWidth: 2 } },
  { id: "e3-5", source: "3", target: "5", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
  { id: "e4-5", source: "4", target: "5", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
  { id: "e3-4", source: "3", target: "4", type: "straight", style: { stroke: "#ec4899", strokeWidth: 2 } },
  { id: "e5-6", source: "5", target: "6", type: "straight", style: { stroke: "#ec4899", strokeWidth: 2 } },
  { id: "e5-7", source: "5", target: "7", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
  { id: "e6-8", source: "6", target: "8", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, style: { stroke: "#475569", strokeWidth: 1.5 } },
];

function nodeStyle(gender: string) {
  return {
    background: gender === "male" ? "#dbeafe" : "#fce7f3",
    border: "1px solid #94a3b8",
    borderRadius: 8,
    width: 160,
    cursor: "grab",
  };
}

function NodeLabel({ name, id, relation, gender: _ }: { name: string; id: string; relation: string; gender: string }) {
  return (
    <div style={{ textAlign: "center", padding: "4px 8px" }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
      <div style={{ fontSize: 10, color: "#64748b" }}>{id}</div>
      <div style={{ fontSize: 9, color: "#94a3b8" }}>{relation}</div>
    </div>
  );
}

type CtxMenu = { x: number; y: number; kind: "node" | "edge"; id: string } | null;

const TreeCanvasV2Demo: React.FC = () => {
  const [nodes, , onNodesChange] = useNodesState(DEMO_NODES);
  const [edges, , onEdgesChange] = useEdgesState(DEMO_EDGES);
  const [ctx, setCtx] = useState<CtxMenu>(null);

  const onNodeCtx: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, kind: "node", id: node.id });
  }, []);

  const onEdgeCtx: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, kind: "edge", id: edge.id });
  }, []);

  return (
    <div className="w-full h-screen" onClick={() => setCtx(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeCtx}
        onEdgeContextMenu={onEdgeCtx}
        onPaneClick={() => setCtx(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <Background gap={20} color="#e2e8f0" />
        <Controls />
        <MiniMap zoomable pannable />
        <Panel position="top-left">
          <div className="bg-background/95 border rounded-lg shadow px-3 py-2 text-sm">
            <div className="font-semibold">Demo Tree — शर्मा वंश</div>
            <div className="text-xs text-muted-foreground font-mono">VS-DEMO</div>
            <div className="text-xs text-muted-foreground mt-1">Drag nodes · Right-click to edit/delete · Pink = spouse · Arrow = parent→child</div>
          </div>
        </Panel>
      </ReactFlow>

      {ctx && (
        <div
          className="fixed z-50 bg-background border rounded-lg shadow-xl py-1 min-w-[180px] text-sm"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.kind === "node" ? (
            <>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { toast.success("Would open profile"); setCtx(null); }}>✏️ Open & edit profile</button>
              <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { toast.success("Would check integrity"); setCtx(null); }}>🔍 Check integrity</button>
              <div className="border-t my-1" />
              <button className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive" onClick={() => { toast.success("Would delete person"); setCtx(null); }}>🗑 Delete person</button>
            </>
          ) : (
            <button className="w-full text-left px-3 py-2 hover:bg-destructive/10 text-destructive" onClick={() => { toast.success("Would delete relationship"); setCtx(null); }}>🗑 Delete relationship</button>
          )}
        </div>
      )}
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

  if (!vanshaId) return <TreeCanvasV2Demo />;
  return <TreeCanvasV2 vanshaId={vanshaId} />;
};

export default TreePageV2;
