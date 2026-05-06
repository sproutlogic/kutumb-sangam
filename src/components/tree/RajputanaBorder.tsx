/**
 * RajputanaBorder — ornate decorative frame around the tree canvas, evoking
 * Rajasthani Mughal-Rajput jharokha / gateway artwork. Pure CSS / SVG, no images.
 *
 * The border is fixed-position absolute around the canvas with:
 *   • A double gold-saffron frame (outer thick, inner thin) with rounded corners
 *   • Mandala medallions in each corner (SVG)
 *   • Toran-like scalloped edge along the top
 *   • Subtle inner glow
 *
 * Used as a wrapper:
 *   <RajputanaBorder>
 *     <TreeCanvasV2 ... />
 *   </RajputanaBorder>
 */
import React from "react";

interface RajputanaBorderProps {
  children: React.ReactNode;
  className?: string;
}

const Medallion: React.FC<{ position: "tl" | "tr" | "bl" | "br" }> = ({ position }) => {
  const corner = {
    tl: "top-0 left-0 -translate-x-1/3 -translate-y-1/3",
    tr: "top-0 right-0 translate-x-1/3 -translate-y-1/3",
    bl: "bottom-0 left-0 -translate-x-1/3 translate-y-1/3",
    br: "bottom-0 right-0 translate-x-1/3 translate-y-1/3",
  }[position];

  return (
    <div className={`absolute ${corner} pointer-events-none z-20`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <defs>
          <radialGradient id={`med-${position}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#fde68a" />
            <stop offset="60%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#7c2d12" />
          </radialGradient>
        </defs>
        <circle cx="28" cy="28" r="25" fill={`url(#med-${position})`} stroke="#7c2d12" strokeWidth="1.5" />
        <circle cx="28" cy="28" r="20" fill="none" stroke="#fde68a" strokeWidth="0.8" />
        <circle cx="28" cy="28" r="14" fill="none" stroke="#fde68a" strokeWidth="0.6" />
        {/* 8-petal mandala */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x1 = 28 + Math.cos(angle) * 6;
          const y1 = 28 + Math.sin(angle) * 6;
          const x2 = 28 + Math.cos(angle) * 18;
          const y2 = 28 + Math.sin(angle) * 18;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#fde68a" strokeWidth="1" strokeLinecap="round" />
          );
        })}
        <circle cx="28" cy="28" r="3" fill="#fde68a" />
      </svg>
    </div>
  );
};

const ToranTop: React.FC = () => (
  <div className="absolute top-0 left-0 right-0 h-3 pointer-events-none z-10 overflow-hidden">
    <svg width="100%" height="12" viewBox="0 0 1000 12" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0,12 L0,4 Q15,0 30,4 T60,4 T90,4 T120,4 T150,4 T180,4 T210,4 T240,4 T270,4 T300,4 T330,4 T360,4 T390,4 T420,4 T450,4 T480,4 T510,4 T540,4 T570,4 T600,4 T630,4 T660,4 T690,4 T720,4 T750,4 T780,4 T810,4 T840,4 T870,4 T900,4 T930,4 T960,4 T990,4 L1000,4 L1000,12 Z"
        fill="url(#toran-grad)"
      />
      <defs>
        <linearGradient id="toran-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="#fde68a" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

const RajputanaBorder: React.FC<RajputanaBorderProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        // Outer frame — saffron / maroon double border with subtle inset shadow
        padding: "10px",
        background:
          "linear-gradient(135deg,#7c2d12 0%,#b45309 25%,#fde68a 50%,#b45309 75%,#7c2d12 100%)",
        boxShadow:
          "0 0 0 2px #fde68a inset, 0 0 0 4px #7c2d12 inset, 0 8px 24px rgba(120,45,18,0.25)",
      }}
    >
      {/* Inner canvas surface */}
      <div
        className="relative w-full h-full rounded-xl overflow-hidden"
        style={{
          boxShadow:
            "0 0 0 1px #fde68a inset, 0 0 0 3px #7c2d12 inset, 0 0 30px rgba(252,211,77,0.20) inset",
          background: "transparent",
        }}
      >
        <ToranTop />
        {children}
      </div>

      {/* Corner medallions */}
      <Medallion position="tl" />
      <Medallion position="tr" />
      <Medallion position="bl" />
      <Medallion position="br" />
    </div>
  );
};

export default RajputanaBorder;
