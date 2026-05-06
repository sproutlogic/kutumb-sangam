/**
 * FamilyNode — custom React Flow node for family tree members.
 *
 * Handle layout (all type="source", connectionMode="loose" on ReactFlow):
 *   Top    → parent sends child edge upward (BT layout: older = bottom, newer = top)
 *   Bottom → child receives parent edge from below
 *   Left / Right → spouse connections (horizontal)
 *
 * Handles are invisible until you hover over the node, keeping the canvas clean.
 */
import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FamilyNodeData {
  name: string;
  kutumbId?: string | null;
  gender?: string;
  generation?: number;
  relation?: string;
  hasOffset?: boolean;
  [key: string]: unknown;
}

function bg(gender?: string): string {
  const g = (gender ?? "").toLowerCase();
  if (g === "male") return "#dbeafe";
  if (g === "female") return "#fce7f3";
  return "#f1f5f9";
}

const dot: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#6366f1",
  border: "2px solid #fff",
  borderRadius: "50%",
  opacity: 0,           // hidden; shown via CSS :hover on parent (.family-node)
  transition: "opacity 0.15s",
  zIndex: 10,
};

const FamilyNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as FamilyNodeData;
  return (
    <div
      className="family-node"
      style={{
        background: bg(d.gender),
        border: selected
          ? "2px solid #6366f1"
          : d.hasOffset
            ? "1.5px dashed #6366f1"
            : "1px solid #94a3b8",
        borderRadius: 10,
        width: 168,
        minHeight: 72,
        boxShadow: selected
          ? "0 0 0 3px rgba(99,102,241,0.2)"
          : "0 1px 3px rgba(15,23,42,0.07)",
        position: "relative",
        cursor: "grab",
      }}
    >
      {/* All handles are type="source"; ReactFlow runs connectionMode="loose"
          so any handle can connect to any other handle.                       */}
      <Handle type="source" position={Position.Top}    id="s-top"    style={{ ...dot, top:    -7 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...dot, bottom: -7 }} />
      <Handle type="source" position={Position.Left}   id="s-left"   style={{ ...dot, left:   -7 }} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...dot, right:  -7 }} />

      <div style={{ textAlign: "center", padding: "8px 12px", lineHeight: 1.3 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{d.name}</div>
        {d.kutumbId ? (
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
            {d.kutumbId}
          </div>
        ) : null}
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
          {d.generation !== undefined ? `G${d.generation}` : ""}
          {d.relation ? ` · ${d.relation}` : ""}
        </div>
      </div>
    </div>
  );
};

export default memo(FamilyNode);
