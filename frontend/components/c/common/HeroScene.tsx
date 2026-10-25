import { useId } from "react";
import { cn } from "@/lib/cn";

/*
 * Version C home: an illustrative scene for the hero — a plane climbing
 * through soft clouds over a sea-glass horizon, drawn in the design-system
 * palette (night navy, breeze, calm). Inline SVG, no imagery; decorative
 * (aria-hidden), the heading next to it carries the meaning. Fills its
 * container and crops (viewBox 520 × 320, slice), so it works as a strip on
 * phones and as the right half of the hero on laptops.
 */

export function HeroScene({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glow = `${id}-glow`;
  const sea = `${id}-sea`;
  const blur = `${id}-blur`;
  return (
    <svg viewBox="0 0 520 320" preserveAspectRatio="xMidYMid slice" aria-hidden className={cn("block h-full w-full", className)}>
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#85cdbb" stopOpacity="0.55" />
          <stop offset="1" stopColor="#85cdbb" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5bb7a2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3c9e89" stopOpacity="0.1" />
        </linearGradient>
        <filter id={blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* A soft sun behind the clouds. */}
      <circle cx="318" cy="118" r="112" fill={`url(#${glow})`} />
      <circle cx="318" cy="118" r="28" fill="#d5efe8" fillOpacity="0.5" />

      {/* Far clouds: blurred, low. */}
      <g fill="#dbe9f7" fillOpacity="0.16" filter={`url(#${blur})`}>
        <ellipse cx="160" cy="150" rx="84" ry="22" />
        <ellipse cx="430" cy="186" rx="84" ry="18" />
      </g>

      {/* Near clouds: layered rounded shapes. */}
      <g fill="#f3f6f9" fillOpacity="0.22">
        <path d="M84 214c0-16 13-28 29-28 4 0 8 1 11 2 5-14 18-24 34-24 18 0 33 13 36 30 2-1 5-1 7-1 13 0 24 10 24 23 0 2 0 4-1 6H86c-1-3-2-5-2-8Z" />
        <path d="M300 246c0-13 10-23 23-23 3 0 6 1 8 2 4-12 15-20 28-20 15 0 27 11 29 25h4c11 0 20 9 20 19 0 2 0 3-1 5H302c-1-3-2-5-2-8Z" />
      </g>
      <g fill="#f3f6f9" fillOpacity="0.34">
        <path d="M150 262c0-11 9-20 20-20 3 0 5 0 7 1 4-10 13-17 24-17 13 0 24 10 25 22h3c9 0 17 7 17 16 0 2 0 3-1 4H152c-1-2-2-4-2-6Z" />
      </g>

      {/* The contrail: a soft, dotted climb. */}
      <path
        d="M90 292 C 170 270, 240 240, 300 196 S 390 124, 420 104"
        fill="none"
        stroke="#b0e0d4"
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 10"
      />

      {/* The plane (the app mark's silhouette), climbing to the upper right. */}
      <g transform="translate(428 96) rotate(-32) scale(1.9)">
        <g fill="#f3f6f9">
          <rect x="-3.5" y="-22" width="7" height="40" rx="3.5" />
          <path d="M0 -10 L-26 7 V12 L0 5.5 L26 12 V7 Z" />
          <path d="M0 7 L-10 15 V18.5 L0 16 L10 18.5 V15 Z" />
        </g>
        <path d="M0 -10 L-26 7 V12 L0 5.5 Z" fill="#dbe9f7" fillOpacity="0.9" />
      </g>

      {/* The sea-glass horizon. */}
      <path d="M0 320 C 120 262, 300 258, 520 292 V320 Z" fill={`url(#${sea})`} />
      <path d="M0 320 C 120 262, 300 258, 520 292" fill="none" stroke="#9bdac9" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}
