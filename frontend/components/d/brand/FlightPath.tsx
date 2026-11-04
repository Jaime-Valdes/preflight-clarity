import { cn } from "@/lib/cn";

/*
 * The hand-drawn flight path (docs/ui-d-theme.md): one curved ink stroke that
 * draws itself in once, then a tiny outlined paper plane eases along it to the
 * end. Decorative. The plane rides a CSS motion path; where that isn't
 * supported, or under reduced motion, the resting plane simply sits at the end.
 */

const PATH = "M-20 150C110 70 200 215 320 125S500 20 590 70";
/** Where the path ends (the resting plane) and the stroke's direction there, for its heading. */
const END = { x: 590, y: 70, angle: -24 };

/** The tiny outlined paper plane, drawn around (0, 0) heading right; rotate it to the stroke's direction. */
export function PaperPlane() {
  return (
    <>
      <path d="M11 0L-9-7L-5 0L-9 7Z" fill="#ffffff" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M-5 0H3" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

export function FlightPath({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 200" aria-hidden className={cn("block h-auto w-full overflow-visible", className)}>
      <path
        d={PATH}
        pathLength={1}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1"
        className="animate-d-draw"
      />
      {/* Flying: along the path with CSS motion (see globals.css for the fallbacks). */}
      <g className="d-plane-flying animate-d-fly" style={{ offsetPath: `path("${PATH}")` }}>
        <PaperPlane />
      </g>
      {/* Resting: the same plane at the end of the stroke. */}
      <g className="d-plane-resting" transform={`translate(${END.x} ${END.y}) rotate(${END.angle})`}>
        <PaperPlane />
      </g>
    </svg>
  );
}
