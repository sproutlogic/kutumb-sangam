interface KutumbLogoProps {
  /** Pixel size (both width and height). Default: 36 */
  size?: number;
  className?: string;
}

/**
 * Kutumb Map brand logo icon.
 *
 * Concept: a classic family-tree org-chart — one ancestral node (gold) at the
 * top, two child nodes (ivory) below, connected by branches, set on the app's
 * signature plum gradient rounded-square badge.
 *
 * Scales cleanly from 20 px (header) to 72 px (sign-in splash).
 */
const KutumbLogo = ({ size = 36, className = '' }: KutumbLogoProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Kutumb Map"
    role="img"
  >
    <defs>
      {/* Plum gradient — mirrors --gradient-plum from index.css */}
      <linearGradient id="km-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#180a2c" />
        <stop offset="30%"  stopColor="#2b0f4d" />
        <stop offset="62%"  stopColor="#481d65" />
        <stop offset="100%" stopColor="#66274e" />
      </linearGradient>

      {/* Inner glow on background for depth */}
      <radialGradient id="km-glow" cx="35%" cy="30%" r="60%" gradientUnits="objectBoundingBox">
        <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.10" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* ── Rounded-square badge background ── */}
    <rect width="36" height="36" rx="9" fill="url(#km-bg)" />
    <rect width="36" height="36" rx="9" fill="url(#km-glow)" />

    {/* ── Family tree structure ── */}

    {/* Vertical stem: ancestor node → horizontal branch */}
    <line x1="18" y1="12" x2="18" y2="18.5"
          stroke="white" strokeWidth="1.7" strokeLinecap="round" opacity="0.70" />

    {/* Horizontal branch connecting left and right children */}
    <line x1="10.5" y1="18.5" x2="25.5" y2="18.5"
          stroke="white" strokeWidth="1.7" strokeLinecap="round" opacity="0.65" />

    {/* Left child stem */}
    <line x1="10.5" y1="18.5" x2="10.5" y2="22"
          stroke="white" strokeWidth="1.7" strokeLinecap="round" opacity="0.60" />

    {/* Right child stem */}
    <line x1="25.5" y1="18.5" x2="25.5" y2="22"
          stroke="white" strokeWidth="1.7" strokeLinecap="round" opacity="0.60" />

    {/* Trunk below branch */}
    <rect x="16.5" y="18.5" width="3" height="8.5" rx="1.5"
          fill="white" opacity="0.55" />

    {/* ── Ancestor node (top) — gold ── */}
    <circle cx="18" cy="8.8" r="3.6" fill="#c8860a" />
    <circle cx="18" cy="8.8" r="2.2" fill="#f0b429" />
    {/* Small highlight on gold node */}
    <circle cx="17" cy="7.8" r="0.7" fill="white" opacity="0.55" />

    {/* ── Left child node ── */}
    <circle cx="10.5" cy="24.5" r="3.0" fill="white" opacity="0.92" />
    <circle cx="10.5" cy="24.5" r="1.4" fill="#2b0f4d" opacity="0.45" />

    {/* ── Right child node ── */}
    <circle cx="25.5" cy="24.5" r="3.0" fill="white" opacity="0.92" />
    <circle cx="25.5" cy="24.5" r="1.4" fill="#2b0f4d" opacity="0.45" />

    {/* Subtle champagne border ring */}
    <rect width="36" height="36" rx="9"
          stroke="#d4a84b" strokeWidth="0.8" strokeOpacity="0.35" fill="none" />
  </svg>
);

export default KutumbLogo;
