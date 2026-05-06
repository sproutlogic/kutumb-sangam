/**
 * GhostNode — temporary placeholder shown on canvas when the user clicks a
 * directional "+" button on an existing node.
 *
 * Renders a dashed card with an inline name input + gender toggle.
 * Press Enter or click "Add" to confirm; press Escape or "✕" to cancel.
 */
import React, { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface GhostNodeData {
  onConfirm: (name: string, gender: "male" | "female" | "other") => void;
  onCancel: () => void;
  [key: string]: unknown;
}

const GhostNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as GhostNodeData;
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so ReactFlow finishes positioning before we steal focus.
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const confirm = () => {
    if (name.trim()) d.onConfirm(name.trim(), gender);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") d.onCancel();
    e.stopPropagation(); // don't let ReactFlow eat keystrokes
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        border: "2px dashed #94a3b8",
        borderRadius: 10,
        width: 210,
        background: "#fefce8",
        boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
        padding: "10px 12px",
        position: "relative",
      }}
    >
      {/* Handles so the temp edge can connect */}
      <Handle type="source" position={Position.Top}    id="s-top"    style={{ opacity: 0, top:    -6 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ opacity: 0, bottom: -6 }} />
      <Handle type="source" position={Position.Left}   id="s-left"   style={{ opacity: 0, left:   -6 }} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={{ opacity: 0, right:  -6 }} />

      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, textAlign: "center", letterSpacing: "0.05em" }}>
        NEW MEMBER
      </div>

      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKey}
        placeholder="Enter name…"
        style={{
          width: "100%",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 13,
          outline: "none",
          background: "#fff",
          marginBottom: 7,
          boxSizing: "border-box",
        }}
      />

      {/* Gender toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["male", "female", "other"] as const).map((g) => (
          <button
            key={g}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setGender(g)}
            style={{
              flex: 1,
              padding: "3px 0",
              fontSize: 10,
              borderRadius: 4,
              border: `1px solid ${gender === g ? "#6366f1" : "#e2e8f0"}`,
              background: gender === g ? "#ede9fe" : "#fff",
              color: gender === g ? "#4338ca" : "#64748b",
              cursor: "pointer",
              fontWeight: gender === g ? 600 : 400,
            }}
          >
            {g === "male" ? "♂ M" : g === "female" ? "♀ F" : "—"}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={confirm}
          disabled={!name.trim()}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: 11,
            borderRadius: 4,
            border: "none",
            background: name.trim() ? "#6366f1" : "#e2e8f0",
            color: name.trim() ? "#fff" : "#94a3b8",
            cursor: name.trim() ? "pointer" : "default",
            fontWeight: 500,
          }}
        >
          ✓ Add
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={d.onCancel}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: 11,
            borderRadius: 4,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default memo(GhostNode);
