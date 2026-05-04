import type { MouseEvent } from "react";
import type { PositionedTreeNode } from "@/engine/treeLayout";
import type { TreeNodeContainerVariant } from "@/constants/vrukshaRelations";

type Props = {
  node: PositionedTreeNode;
  hasDispute: boolean;
  onSelect: (e: MouseEvent<SVGGElement>) => void;
  onHoverChange?: (isHovering: boolean) => void;
  onDragStart?: (nodeId: string, e: MouseEvent<SVGGElement>) => void;
  isSelected?: boolean;
  hasMatrimonialBridge?: boolean;
  containerVariant?: TreeNodeContainerVariant;
  personalLabel?: string;
};

const R = 26;   // shape half-extent (up from 18)
const SEL = 3;  // extra radius when selected

function trianglePointsFlatBase(cx: number, cy: number, r: number): string {
  const halfBase = (2 * r) / Math.sqrt(3);
  return `${cx},${cy - r} ${cx - halfBase},${cy + r} ${cx + halfBase},${cy + r}`;
}

const VARIANT_STROKE: Record<TreeNodeContainerVariant, string> = {
  "bio-child":       "#ea580c",
  "adopted-child":   "#16a34a",
  "incoming-spouse": "#2563eb",
  "lineage-host":    "#ea580c",
  default:           "hsl(var(--primary))",
};

// Gradient IDs defined in TreePage SVG <defs>
const GENDER_GRAD: Record<string, string> = {
  male:   "url(#person-grad-male)",
  female: "url(#person-grad-female)",
  other:  "url(#person-grad-other)",
};

const PLACEHOLDER_FILL = "hsl(var(--muted) / 0.35)";
const FROZEN_FILL      = "hsl(var(--destructive) / 0.1)";

// Nameplate dimensions
const NP_W = 72;
const NP_H = 30;
const NP_RX = 7;

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

export function PersonNode({
  node,
  hasDispute,
  onSelect,
  onHoverChange,
  onDragStart,
  isSelected,
  hasMatrimonialBridge,
  containerVariant = "default",
  personalLabel = "",
}: Props) {
  const isDotted  = node.borderStyle === "dotted";
  const isFrozen  = node.status === "frozen";
  const isPh      = Boolean(node.isPlaceholder);
  const isDeceased = Boolean((node as Record<string, unknown>).deceased);

  const label = isPh && (!node.name.trim() || node.name === "—") ? "—" : node.name;
  const firstName = (() => {
    const given = (node.givenName ?? "").trim();
    return given || label.split(/\s+/)[0] || "—";
  })();

  const initials = (() => {
    if (label === "—") return "—";
    const given = (node.givenName ?? "").trim();
    const sur   = (node.surname  ?? "").trim();
    if (given || sur) return `${given.slice(0, 1)}${sur.slice(0, 1)}`.toUpperCase();
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "—";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  })();

  const strokeMain = hasDispute
    ? "hsl(var(--accent))"
    : isPh
      ? "hsl(var(--muted-foreground))"
      : VARIANT_STROKE[containerVariant];

  const fillMain = isFrozen
    ? FROZEN_FILL
    : isPh
      ? PLACEHOLDER_FILL
      : GENDER_GRAD[node.gender ?? "other"] ?? GENDER_GRAD.other;

  const { x, y } = node;
  const g  = node.gender ?? "other";
  const rr = isSelected ? R + SEL : R;
  const outerR = rr + 4;

  // Drop-shadow filter id (unique per node to avoid SVG conflicts)
  const shadowId = `ps-shadow-${node.id.replace(/[^a-z0-9]/gi, "")}`;

  // ── Shape inner ────────────────────────────────────────────────────────────
  const shapeInner = (() => {
    const common = {
      fill:        fillMain,
      stroke:      strokeMain,
      strokeWidth: isSelected ? 2.75 : 2,
      opacity:     isDeceased ? 0.55 : 1,
      filter:      isSelected ? `url(#${shadowId})` : undefined,
    };
    if (g === "male") {
      const s = rr * 2;
      return <rect x={x - rr} y={y - rr} width={s} height={s} rx={5} ry={5} {...common} />;
    }
    if (g === "female") {
      return <circle cx={x} cy={y} r={rr} {...common} />;
    }
    return (
      <polygon
        points={trianglePointsFlatBase(x, y, rr)}
        strokeLinejoin="round"
        {...common}
      />
    );
  })();

  // ── Verified gold ring ─────────────────────────────────────────────────────
  const verifiedRing = node.verificationTier && node.verificationTier !== "none" ? (
    g === "female"
      ? <circle cx={x} cy={y} r={outerR + 3} fill="none" stroke="#d49a1f" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.8} />
      : <rect x={x - outerR - 3} y={y - outerR - 3} width={(outerR + 3) * 2} height={(outerR + 3) * 2} rx={9} fill="none" stroke="#d49a1f" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.8} />
  ) : null;

  // ── Nameplate below shape ──────────────────────────────────────────────────
  const npY = y + rr + 8;
  const nameplate = !isPh ? (
    <g>
      {/* connector stem */}
      <line x1={x} y1={y + rr} x2={x} y2={npY} stroke={strokeMain} strokeWidth={1.5} strokeOpacity={0.25} />
      {/* pill */}
      <rect
        x={x - NP_W / 2}
        y={npY}
        width={NP_W}
        height={NP_H}
        rx={NP_RX}
        fill="rgba(252,250,244,0.92)"
        stroke={strokeMain}
        strokeWidth={isSelected ? 1.5 : 0.8}
        strokeOpacity={isSelected ? 0.5 : 0.2}
      />
      {/* first name */}
      <text
        x={x}
        y={npY + 11}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fontFamily="var(--font-heading, serif)"
        fill="rgba(46,19,70,0.9)"
        className="pointer-events-none"
      >
        {truncate(firstName, 10)}
      </text>
      {/* personal label or prompt */}
      <text
        x={x}
        y={npY + 23}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--font-mono, monospace)"
        fill={personalLabel ? "rgba(74,33,104,0.65)" : "rgba(212,154,31,0.8)"}
        className="pointer-events-none"
        letterSpacing="0.02em"
      >
        {personalLabel ? truncate(personalLabel, 11) : "set label →"}
      </text>
    </g>
  ) : null;

  // ── Badges ─────────────────────────────────────────────────────────────────
  const badgeX = x + rr - 2;
  const badgeY = y - rr + 2;

  const deceasedBadge = isDeceased ? (
    <text x={badgeX} y={badgeY} textAnchor="middle" fontSize={10} fill="rgba(74,33,104,0.55)" className="pointer-events-none">†</text>
  ) : null;

  const disputeBadge = hasDispute ? (
    <circle cx={badgeX} cy={badgeY} r={5} fill="hsl(var(--accent))" opacity={0.9} />
  ) : null;

  const bridgeBadge = hasMatrimonialBridge ? (
    <text x={x + rr - 4} y={y - rr - 4} textAnchor="middle" fontSize={9} fill="hsl(var(--primary))" className="pointer-events-none">↗</text>
  ) : null;

  return (
    <g
      className="cursor-pointer"
      onClick={onSelect}
      onMouseDown={(e) => onDragStart?.(node.id, e)}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      {/* Drop-shadow def scoped per node */}
      {isSelected && (
        <defs>
          <filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx={0} dy={4} stdDeviation={8} floodColor={strokeMain} floodOpacity={0.35} />
          </filter>
        </defs>
      )}
      {verifiedRing}
      {shapeInner}
      {/* Initials */}
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontFamily="var(--font-body, sans-serif)"
        className={`pointer-events-none ${isPh ? "fill-muted-foreground" : "fill-white"}`}
        opacity={isDeceased ? 0.7 : 1}
      >
        {initials}
      </text>
      {deceasedBadge}
      {disputeBadge}
      {bridgeBadge}
      {nameplate}
    </g>
  );
}
