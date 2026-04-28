import type { PositionedTreeNode } from "@/engine/treeLayout";

/** Person glyph baseline radius from center. */
const NODE_R = 18;
/** Tight padding so pair frame only wraps the two people. */
const FRAME_MARGIN_X = 3;
const FRAME_MARGIN_Y = 3;

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

function nodeHalfWidth(node: PositionedTreeNode): number {
  if (node.gender === "female" || node.gender === "male") return NODE_R;
  // Triangle nodes are a little wider than the square/circle at the same R.
  return (2 * NODE_R) / Math.sqrt(3);
}

function nodeHalfHeight(): number {
  return NODE_R;
}

/** Rectangle around mother/wife (left) and father/husband (right); drawn behind nodes. */
export function SpouseCoupleFrame({ left, right }: { left: PositionedTreeNode; right: PositionedTreeNode }) {
  const { a, b } = orderedPair(left, right);
  const y = a.y;
  const x1 = Math.min(a.x - nodeHalfWidth(a), b.x - nodeHalfWidth(b)) - FRAME_MARGIN_X;
  const x2 = Math.max(a.x + nodeHalfWidth(a), b.x + nodeHalfWidth(b)) + FRAME_MARGIN_X;
  const yHalf = nodeHalfHeight() + FRAME_MARGIN_Y;
  const y1 = y - yHalf;
  const y2 = y + yHalf;
  const w = x2 - x1;
  const h = y2 - y1;
  return (
    <g className="pointer-events-none" aria-hidden>
      <rect
        x={x1}
        y={y1}
        width={w}
        height={h}
        rx={4}
        ry={4}
        fill="hsl(var(--primary) / 0.06)"
        stroke="hsl(var(--primary) / 0.5)"
        strokeWidth={2}
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
