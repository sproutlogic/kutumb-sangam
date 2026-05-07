/**
 * FamilyNode — redesigned tree node card.
 *
 * Displays first name only. Visual states:
 *   • Living   → gentle pulsing border ring
 *   • Deceased → 🪔 diya in bottom-left corner
 *   • Pandit-verified → rangoli badge (🔱) in top-right corner
 *
 * Handles (all source, ConnectionMode=Loose):
 *   Top/Bottom → parent-child  |  Left/Right → spouse
 */
import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FamilyNodeData {
  name: string;
  gender?: string;
  relation?: string;
  hasOffset?: boolean;
  isDeceased?: boolean;
  isPanditVerified?: boolean;
  onAddRelative?: (nodeId: string, dir: "child" | "parent" | "spouse") => void;
  onOpenProfile?: (nodeId: string) => void;
  [key: string]: unknown;
}

function cardGradient(gender?: string): string {
  const g = (gender ?? "").toLowerCase();
  if (g === "male")   return "linear-gradient(145deg,#dbeafe,#eff6ff)";
  if (g === "female") return "linear-gradient(145deg,#fce7f3,#fdf2f8)";
  return "linear-gradient(145deg,#f1f5f9,#f8fafc)";
}

function pulseColor(gender?: string): string {
  const g = (gender ?? "").toLowerCase();
  if (g === "male")   return "rgba(99,132,241,0.45)";
  if (g === "female") return "rgba(236,72,153,0.35)";
  return "rgba(100,116,139,0.30)";
}

const handleDot: React.CSSProperties = {
  width: 10, height: 10,
  background: "#6366f1",
  border: "2px solid #fff",
  borderRadius: "50%",
  opacity: 0,
  transition: "opacity 0.15s",
  zIndex: 10,
};

const addBtn: React.CSSProperties = {
  position: "absolute",
  width: 22, height: 22,
  borderRadius: "50%",
  border: "2px solid #6366f1",
  background: "#fff",
  color: "#6366f1",
  fontSize: 15,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
  transition: "background 0.12s, transform 0.12s",
  boxShadow: "0 2px 6px rgba(99,102,241,0.3)",
};

// Keyframe injected once at module load — keeps component self-contained.
if (typeof document !== "undefined" && !document.getElementById("fn-pulse-style")) {
  const s = document.createElement("style");
  s.id = "fn-pulse-style";
  s.textContent = `
    @keyframes fn-pulse {
      0%   { transform: scale(1);    opacity: 0.6; }
      60%  { transform: scale(1.07); opacity: 0;   }
      100% { transform: scale(1.07); opacity: 0;   }
    }
    .fn-pulse-ring {
      animation: fn-pulse 2.4s ease-out infinite;
    }
  `;
  document.head.appendChild(s);
}

const FamilyNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as FamilyNodeData;
  const [hovered, setHovered] = useState(false);

  const firstName = (d.name ?? "").split(" ")[0] || "(unnamed)";
  const living = !d.isDeceased;

  const fireAdd = (e: React.MouseEvent, dir: "child" | "parent" | "spouse") => {
    e.stopPropagation();
    e.preventDefault();
    d.onAddRelative?.(id, dir);
  };

  const openProfile = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-add-btn]")) return;
    d.onOpenProfile?.(id);
  };

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={openProfile}
    >
      {/* ── Living pulse ring ──────────────────────────────── */}
      {living && (
        <div
          className="fn-pulse-ring"
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 14,
            border: `2px solid ${pulseColor(d.gender)}`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* ── Pandit-verified rangoli badge ──────────────────── */}
      {d.isPanditVerified && (
        <div
          title="Verified by Pandit ji"
          style={{
            position: "absolute",
            top: -10, right: -10,
            width: 20, height: 20,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#f97316,#dc2626)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11,
            boxShadow: "0 1px 4px rgba(249,115,22,0.5)",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >🔱</div>
      )}

      {/* ── Add buttons — always in DOM, opacity-toggled so the mouse
           can travel from card edge to button without triggering onMouseLeave
           on the wrapper and unmounting the target before it's reachable. ── */}
      <div data-add-btn
        style={{ ...addBtn, top: -28, left: "50%", transform: "translateX(-50%)",
          opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.12s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => fireAdd(e, "child")}
        title="Add child">+</div>

      <div data-add-btn
        style={{ ...addBtn, bottom: -28, left: "50%", transform: "translateX(-50%)",
          opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.12s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => fireAdd(e, "parent")}
        title="Add parent">+</div>

      <div data-add-btn
        style={{ ...addBtn, right: -28, top: "50%", transform: "translateY(-50%)",
          opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.12s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => fireAdd(e, "spouse")}
        title="Add spouse">+</div>

      {/* ── Card ───────────────────────────────────────────── */}
      <div
        style={{
          background: cardGradient(d.gender),
          border: selected
            ? "2px solid #6366f1"
            : d.hasOffset
              ? "1.5px dashed #6366f1"
              : "1px solid rgba(148,163,184,0.6)",
          borderRadius: 12,
          width: 148,
          minHeight: 60,
          boxShadow: selected
            ? "0 0 0 3px rgba(99,102,241,0.2), 0 2px 8px rgba(15,23,42,0.1)"
            : "0 2px 8px rgba(15,23,42,0.08)",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Handle type="source" position={Position.Top}    id="s-top"    style={{ ...handleDot, top:    -6 }} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleDot, bottom: -6 }} />
        <Handle type="source" position={Position.Left}   id="s-left"   style={{ ...handleDot, left:   -6 }} />
        <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...handleDot, right:  -6 }} />

        {/* Name + relation */}
        <div style={{ padding: "10px 12px 10px", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", letterSpacing: "-0.01em" }}>
            {firstName}
          </div>
          {d.relation && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
              {d.relation}
            </div>
          )}
        </div>

        {/* ── Diya for deceased (bottom-left) ──────────────── */}
        {d.isDeceased && (
          <div
            title="Deceased"
            style={{
              position: "absolute",
              bottom: 4, left: 6,
              fontSize: 13,
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >🪔</div>
        )}
      </div>
    </div>
  );
};

export default memo(FamilyNode);
