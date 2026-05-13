/**
 * FamilyNode — tree node card.
 *
 * Visual states:
 *   • Living         → gentle pulsing border ring
 *   • Deceased       → 🪔 diya in bottom-left corner
 *   • Pandit-verified → 🔱 rangoli badge top-right corner
 *
 * Handles (all source, ConnectionMode=Loose):
 *   Top/Bottom → parent-child  |  Left/Right → spouse
 * Drag from any handle to another node to create a relationship.
 */
import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FamilyNodeData {
  name: string;
  gender?: string;
  relation?: string;
  kutumbId?: string | null;
  hasOffset?: boolean;
  isDeceased?: boolean;
  isPanditVerified?: boolean;
  isUnclaimed?: boolean;
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

if (typeof document !== "undefined" && !document.getElementById("fn-pulse-style")) {
  const s = document.createElement("style");
  s.id = "fn-pulse-style";
  s.textContent = `
    @keyframes fn-pulse {
      0%   { transform: scale(1);    opacity: 0.6; }
      60%  { transform: scale(1.08); opacity: 0;   }
      100% { transform: scale(1.08); opacity: 0;   }
    }
    .fn-pulse-ring { animation: fn-pulse 2.6s ease-out infinite; }
  `;
  document.head.appendChild(s);
}

const FamilyNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as FamilyNodeData;
  const [hovered, setHovered] = useState(false);

  const firstName = (d.name ?? "").split(" ")[0] || "(unnamed)";
  const living    = !d.isDeceased;

  const openProfile = (e: React.MouseEvent) => {
    d.onOpenProfile?.(id);
  };

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={openProfile}
    >
      {/* ── Living pulse ring ────────────────────────────────── */}
      {living && (
        <div className="fn-pulse-ring" style={{
          position: "absolute", inset: -3, borderRadius: 14,
          border: `2px solid ${pulseColor(d.gender)}`, pointerEvents: "none",
        }} />
      )}

      {/* ── Card ─────────────────────────────────────────────── */}
      {/* Handles outside overflow:hidden so they can be dragged for connect */}
      <Handle type="source" position={Position.Top}    id="s-top"    style={{ ...handleDot, top: -6, left: "50%", transform: "translateX(-50%)", opacity: hovered ? 0.7 : 0 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...handleDot, bottom: -6, left: "50%", transform: "translateX(-50%)", opacity: hovered ? 0.7 : 0 }} />
      <Handle type="source" position={Position.Left}   id="s-left"   style={{ ...handleDot, left: -6, top: "50%", transform: "translateY(-50%)", opacity: hovered ? 0.7 : 0 }} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={{ ...handleDot, right: -6, top: "50%", transform: "translateY(-50%)", opacity: hovered ? 0.7 : 0 }} />

      <div className="fn-drag-handle" style={{
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
      }}>

        <div style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", letterSpacing: "-0.01em" }}>
            {firstName}
          </div>
          {d.relation && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
              {d.relation}
            </div>
          )}
        </div>

        {d.isDeceased && (
          <div title="Deceased" style={{
            position: "absolute", bottom: 4, left: 6,
            fontSize: 13, lineHeight: 1, pointerEvents: "none",
          }}>🪔</div>
        )}

        {d.isUnclaimed && !d.isDeceased && (
          <div title="Not yet claimed by this person" style={{
            position: "absolute", bottom: 4, left: 6,
            fontSize: 9, lineHeight: 1, pointerEvents: "none",
            color: "#f59e0b", fontWeight: 700, letterSpacing: "0.02em",
          }}>○ unclaimed</div>
        )}
      </div>

      {/* ── Pandit-verified badge ─────────────────────────────── */}
      {d.isPanditVerified && (
        <div title="Verified by Pandit Ji" style={{
          position: "absolute", top: -8, right: -8,
          width: 18, height: 18, borderRadius: "50%",
          background: "#16a34a",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(22,163,74,0.5)",
          zIndex: 30, pointerEvents: "none",
          border: "2px solid #fff",
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

    </div>
  );
};

export default memo(FamilyNode);
