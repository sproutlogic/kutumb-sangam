/**
 * LockedNode — ghost card rendered at the boundary of a user's visible window.
 * Shows a count of hidden members but no PII. Tapping opens a sachet purchase
 * modal (handled by parent canvas).
 */
import React from "react";
import { Lock } from "lucide-react";

interface LockedNodeProps {
  generation: number;
  lockedCount: number;
  side: "ancestor" | "descendant";
  onClick?: () => void;
}

export const LockedNode: React.FC<LockedNodeProps> = ({
  generation,
  lockedCount,
  side,
  onClick,
}) => {
  const label = side === "ancestor" ? "ancestors" : "descendants";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-[160px] h-[70px] rounded-lg border-2 border-dashed
                 border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30
                 backdrop-blur-sm flex flex-col items-center justify-center
                 transition-all hover:border-amber-700 hover:bg-amber-100/80
                 hover:shadow-md cursor-pointer overflow-hidden"
      aria-label={`${lockedCount} ${label} hidden — tap to unlock`}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(45deg, rgba(180,140,80,0.10) 0 6px, transparent 6px 12px)",
        }}
        aria-hidden="true"
      />
      <Lock className="w-4 h-4 text-amber-800 mb-1 relative z-10" />
      <span className="relative z-10 text-xs font-medium text-amber-900 dark:text-amber-200">
        🔒 {lockedCount} {label}
      </span>
      <span className="relative z-10 text-[10px] text-amber-700/80">
        Gen {generation > 0 ? `+${generation}` : generation} • tap to unlock
      </span>
    </button>
  );
};

export default LockedNode;
