/**
 * FamilyNode — custom React Flow node for family tree members.
 *
 * Handle layout (all type="source", connectionMode="loose" on ReactFlow):
 *   Top    → send child edge upward  (BT layout: ancestors bottom, descendants top)
 *   Bottom → receive parent edge from below
 *   Left / Right → spouse connections (horizontal)
 *
 * On hover three directional "+" buttons appear outside the card:
 *   ↑  (top)   → add child
 *   ↓  (bottom)→ add parent
 *   →  (right) → add spouse
 *
 * Left-click the card itself → opens the profile panel.
 * Callbacks are passed via node data:
 *   data.onAddRelative(nodeId, "child" | "parent" | "spouse")
 *   data.onOpenProfile(nodeId)
 */
import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FamilyNodeData {
  name: string;
  kutumbId?: string | null;
  gender?: string;
  generation?: number;
  relation?: string;
  hasOffset?: boolean;
  onAddRelative?: (nodeId: string, dir: "child" | "parent" | "spouse") => void;
  onOpenProfile?: (nodeId: string) => void;
  [key: string]: unknown;
}

function cardBg(gender?: string): string {
  const g = (gender ?? "").toLowerCase();
  if (g === "male")   return "#dbeafe";
  if (g === "female") return "#fce7f3";
  return "#f1f5f9";
}

const handleDot: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#6366f1",
  border: "2px solid #fff",
  borderRadius: "50%",
  opacity: 0,
  transition: "opacity 0.15s",
  zIndex: 10,
};

const addBtn: React.CSSProperties = {
  position: "absolute",
  width: 20,
  height: 20,
  borderRadius: "50%",
  border: "2px solid #6366f1",
  background: "#fff",
  color: "#6366f1",
  fontSize: 14,
  lineHeight: "16px",
  textAlign: "center",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
  transition: "background 0.12s, transform 0.12s",
  boxShadow: "0 1px 4px rgba(99,102,241,0.25)",
};

const FamilyNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as FamilyNodeData;
  const [hovered, setHovered] = useState(false);

  const fireAdd = (e: React.MouseEvent, dir: "child" | "parent" | "spouse") => {
    e.stopPropagation();
    e.preventDefault();
    d.onAddRelative?.(id, dir);
  };

  const openProfile = (e: React.MouseEvent) => {
    // Only open on direct card click (not on handles or add buttons)
    const target = e.target as HTMLElement;
    if (target.closest("[data-add-btn]")) return;
    d.onOpenProfile?.(id);
  };

  return (
    <div
      className="family-node"
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={openProfile}
    >
      {/* ── Add-child button (top) ───────────────────────── */}
      {hovered && (
        <div
          data-add-btn
          style={{ ...addBtn, top: -26, left: "50%", transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => fireAdd(e, "child")}
          title="Add child"
        >+</div>
      )}

      {/* ── Add-parent button (bottom) ────────────────────── */}
      {hovered && (
        <div
          data-add-btn
          style={{ ...addBtn, bottom: -26, left: "50%", transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => fireAdd(e, "parent")}
          title="Add parent"
        >+</div>
      )}

      {/* ── Add-spouse button (right) ─────────────────────── */}
      {hovered && (
        <div
          data-add-btn
          style={{ ...addBtn, right: -26, top: "50%", transform: "translateY(-50%)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => fireAdd(e, "spouse")}
          title="Add spouse"
        >+</div>
      )}

      {/* ── Card ─────────────────────────────────────────── */}
      <div
        style={{
          background: cardBg(d.gender),
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
          cursor: "pointer",
        }}
      >
        <Handle type="source" position={Position.Top}    id="s-top"    style={{ ...handleDot, top:    -7 }} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleDot, bottom: -7 }} />
        <Handle type="source" position={Position.Left}   id="s-left"   style={{ ...handleDot, left:   -7 }} />
        <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...handleDot, right:  -7 }} />

        <div style={{ textAlign: "center", padding: "8px 12px", lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{d.name}</div>
          {d.kutumbId ? (
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
              {d.kutumbId}
            </div>
          ) : null}
          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
            {d.generation !== undefined ? `G${d.generation}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(FamilyNode);
