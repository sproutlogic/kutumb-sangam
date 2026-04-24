import type { MouseEvent } from "react";
import type { PositionedTreeNode } from "@/engine/treeLayout";
import type { TreeNodeContainerVariant } from "@/constants/vrukshaRelations";

type Props = {
  node: PositionedTreeNode;
  hasDispute: boolean;
  onSelect: (e: MouseEvent<SVGGElement>) => void;
  isSelected?: boolean;
  hasMatrimonialBridge?: boolean;
  containerVariant?: TreeNodeContainerVariant;
};

/** Visual half-extent from center (aligns with trunk attach: bottom = y + R). */
const R = 18;
const SEL = 2;

/** Equilateral triangle: apex (x, y−R), base on line y+R (same vertical span as circle r=R). */
function trianglePointsFlatBase(cx: number, cy: number, R: number): string {
  const halfBase = (2 * R) / Math.sqrt(3);
  return `${cx},${cy - R} ${cx - halfBase},${cy + R} ${cx + halfBase},${cy + R}`;
}

const VARIANT_STROKE: Record<TreeNodeContainerVariant, string> = {
  "bio-child": "#ea580c",
  "adopted-child": "#16a34a",
  "incoming-spouse": "#2563eb",
  "lineage-host": "#ea580c",
  default: "hsl(var(--primary))",
};

const VARIANT_FILL: Record<TreeNodeContainerVariant, string> = {
  "bio-child": "rgba(234, 88, 12, 0.12)",
  "adopted-child": "rgba(22, 163, 74, 0.12)",
  "incoming-spouse": "rgba(37, 99, 235, 0.1)",
  "lineage-host": "rgba(234, 88, 12, 0.12)",
  default: "hsl(var(--card))",
};

/**
 * Genogram-style shapes: male = square, female = circle, other / non-disclosing = triangle.
 * Container tint by biological / adopted / incoming spouse (.cursorrules lineage).
 */
export function PersonNode({
  node,
  hasDispute,
  onSelect,
  isSelected,
  hasMatrimonialBridge,
  containerVariant = "default",
}: Props) {
  const isDotted = node.borderStyle === "dotted";
  const isFrozen = node.status === "frozen";
  const isPh = Boolean(node.isPlaceholder);
  const label =
    isPh && (!node.name.trim() || node.name === "\u2014") ? "\u2014" : node.name;
  const showLabel = label.length > 10 ? label.slice(0, 10) + "\u2026" : label;

  const strokeMain = hasDispute
    ? "hsl(var(--accent))"
    : isPh
      ? "hsl(var(--muted-foreground))"
      : VARIANT_STROKE[containerVariant];
  const fillMain = isFrozen
    ? "hsl(var(--destructive) / 0.1)"
    : isPh
      ? "hsl(var(--muted) / 0.35)"
      : VARIANT_FILL[containerVariant];

  const { x, y } = node;
  const g = node.gender;
  const rr = isSelected ? R + SEL : R;
  const outerR = rr + 3;

  const shapeInner = (() => {
    if (g === "male") {
      const s = rr * 2;
      return (
        <rect
          x={x - rr}
          y={y - rr}
          width={s}
          height={s}
          rx={3}
          ry={3}
          fill={fillMain}
          stroke={strokeMain}
          strokeWidth={isSelected ? 2.75 : 2.5}
          strokeDasharray={isDotted || isPh ? "4 3" : "none"}
        />
      );
    }
    if (g === "female") {
      return (
        <circle
          cx={x}
          cy={y}
          r={rr}
          fill={fillMain}
          stroke={strokeMain}
          strokeWidth={isSelected ? 2.75 : 2.5}
          strokeDasharray={isDotted || isPh ? "4 3" : "none"}
        />
      );
    }
    return (
      <polygon
        points={trianglePointsFlatBase(x, y, rr)}
        fill={fillMain}
        stroke={strokeMain}
        strokeWidth={isSelected ? 2.75 : 2.5}
        strokeLinejoin="round"
        strokeDasharray={isDotted || isPh ? "4 3" : "none"}
      />
    );
  })();

  const shapeOuter = (() => {
    if (g === "male") {
      const s = outerR * 2;
      return (
        <rect
          x={x - outerR}
          y={y - outerR}
          width={s}
          height={s}
          rx={4}
          ry={4}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={isSelected ? 2 : 1}
          strokeOpacity={isSelected ? 0.45 : 0.15}
          className={isSelected ? "" : "animate-pulse-warm"}
        />
      );
    }
    if (g === "female") {
      return (
        <circle
          cx={x}
          cy={y}
          r={outerR}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={isSelected ? 2 : 1}
          strokeOpacity={isSelected ? 0.45 : 0.15}
          className={isSelected ? "" : "animate-pulse-warm"}
        />
      );
    }
    return (
      <polygon
        points={trianglePointsFlatBase(x, y, outerR)}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={isSelected ? 2 : 1}
        strokeOpacity={isSelected ? 0.45 : 0.15}
        strokeLinejoin="round"
        className={isSelected ? "" : "animate-pulse-warm"}
      />
    );
  })();

  return (
    <g className="animate-fade-in cursor-pointer" onClick={(e) => onSelect(e)}>
      {shapeOuter}
      {shapeInner}
      <text
        x={node.x}
        y={node.y + 4}
        textAnchor="middle"
        className={`text-[9px] font-body pointer-events-none ${isPh ? "fill-muted-foreground" : "fill-foreground"}`}
      >
        {showLabel}
      </text>
      <text
        x={node.x}
        y={node.y + 34}
        textAnchor="middle"
        className="text-[7px] font-body fill-muted-foreground pointer-events-none"
      >
        {node.relation}
      </text>
      {hasMatrimonialBridge && (
        <text
          x={node.x + 20}
          y={node.y - 18}
          textAnchor="middle"
          className="text-[9px] fill-primary pointer-events-none"
        >
          ↗
        </text>
      )}
    </g>
  );
}
