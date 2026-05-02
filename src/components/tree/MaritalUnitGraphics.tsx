import type { PositionedTreeNode } from "@/engine/treeLayout";

/** Must match PersonNode R constant. */
const NODE_R = 26;
/** Half of PersonNode nameplate width (NP_W=84). Frame must enclose the nameplate, not just the shape. */
const NP_HALF_W = 42;
/** Snug horizontal padding around the pair. */
const FRAME_MARGIN_X = 10;
/** Vertical padding — top above shape, bottom below nameplate (shape R + stem 8 + NP_H 30 + margin). */
const FRAME_MARGIN_Y_TOP = 10;
const FRAME_MARGIN_Y_BOTTOM = 50;

/** Vertical offset from node center to “+” (must match trunk origin in TreePage). */
export const SPOUSE_PLUS_Y_OFFSET = 2;

/** Y coordinate of the + between spouses (same row Y for both). */
export function spousePlusCenterY(nodeY: number): number {
  return nodeY - SPOUSE_PLUS_Y_OFFSET;
}

type Pair = { a: PositionedTreeNode; b: PositionedTreeNode };

function orderedPair(na: PositionedTreeNode, nb: PositionedTreeNode): Pair {
  return na.x <= nb.x ? { a: na, b: nb } : { a: nb, b: na };
}

function nodeHalfWidth(_node: PositionedTreeNode): number {
  // Use nameplate half-width (42) — wider than shape radius (26) — so frame encloses nameplates.
  return NP_HALF_W;
}

function nodeHalfHeight(): number {
  return NODE_R;
}

/** Dotted rectangle snugly encasing the married pair (shapes + nameplates). */
export function SpouseCoupleFrame({ left, right }: { left: PositionedTreeNode; right: PositionedTreeNode }) {
  const { a, b } = orderedPair(left, right);
  const y = a.y;
  const x1 = Math.min(a.x - nodeHalfWidth(a), b.x - nodeHalfWidth(b)) - FRAME_MARGIN_X;
  const x2 = Math.max(a.x + nodeHalfWidth(a), b.x + nodeHalfWidth(b)) + FRAME_MARGIN_X;
  const y1 = y - nodeHalfHeight() - FRAME_MARGIN_Y_TOP;
  const y2 = y + nodeHalfHeight() + FRAME_MARGIN_Y_BOTTOM;
  const w = x2 - x1;
  const h = y2 - y1;
  return (
    <g className="pointer-events-none" aria-hidden>
      {/* Subtle warm fill */}
      <rect
        x={x1} y={y1} width={w} height={h} rx={10} ry={10}
        fill="rgba(212,154,31,0.04)"
      />
      {/* Dotted brass border */}
      <rect
        x={x1} y={y1} width={w} height={h} rx={10} ry={10}
        fill="none"
        stroke="#b8860b"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        strokeOpacity={0.55}
      />
    </g>
  );
}

/** “+” between the two nodes (centered in the gap; draw on top). */
export function SpousePlusMark({ left, right }: { left: PositionedTreeNode; right: PositionedTreeNode }) {
  const { a, b } = orderedPair(left, right);
  const mx = (a.x + b.x) / 2;
  const my = spousePlusCenterY(a.y);
  return (
    <text
      x={mx}
      y={my}
      textAnchor="middle"
      className="pointer-events-none fill-primary font-heading text-[15px] font-bold"
      style={{ textShadow: "0 0 8px hsl(var(--card))" }}
    >
      +
    </text>
  );
}
