import { cn } from "@/lib/cn";

/*
 * The flight line of the home's hero (docs/ui-d-cinematic.md, "Home"): one ink stroke on a white
 * contrail that sweeps up from the left, passes behind the stage cloud and climbs across the sun to
 * a paper plane at the top right. It only ever climbs, a little at first and never steeply, and
 * levels out at the end. On arrival the line draws itself and the plane flies it; at rest and under
 * reduced motion the line is simply there and the plane sits at its end. Decorative.
 *
 * Two drawings, one per arrangement of the scene, each in the units of its stage (the box
 * components/d/home/DHeroScene.tsx lays the sun and the cloud out in): `band` for the strip of sky
 * above the words on phones and tablets, `tall` for the right-hand column on laptops. The band's
 * line starts far to the left of its stage, so below 1024 px it always comes in from beyond the edge
 * of the screen; the tall one starts at the column's edge, where the plane waits for its line.
 *
 * Where the plane rests and how it flies there are in app/d/d-home.css (.d-home-plane-band,
 * .d-home-plane-tall and the d-home-fly-… keyframes): plain transforms sampled from these two paths.
 * Change a path here and they have to be sampled again (the comment above the keyframes says how).
 */

interface Line {
  /** The stage, as an SVG viewBox. */
  box: string;
  d: string;
  /** The plane's size against its 20-unit drawing. */
  plane: number;
  ink: number;
  trail: number;
}

const LINES = {
  band: {
    box: "0 0 358 216",
    d: "M-500 199C-380 198 -250 197 -140 194C-70 192 14 188 70 172C120 158 172 124 212 98C244 77 288 57 338 50",
    plane: 1.2,
    ink: 2.6,
    trail: 8,
  },
  tall: {
    box: "0 0 512 414",
    d: "M0 336C34 336 62 330 90 320C140 302 232 272 286 232C332 198 404 128 492 114",
    plane: 1.5,
    ink: 3,
    trail: 9,
  },
} as const satisfies Record<string, Line>;

/** The tiny outlined paper plane, drawn around (0, 0) heading right; rotate it to the stroke's direction. */
export function PaperPlane() {
  return (
    <>
      <path d="M11 0L-9-7L-5 0L-9 7Z" fill="#ffffff" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M-5 0H3" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

interface FlightPathProps {
  /** Which arrangement of the scene the line is drawn for. */
  variant?: keyof typeof LINES;
  className?: string;
}

export function FlightPath({ variant = "band", className }: FlightPathProps) {
  const line = LINES[variant];
  // A dash as long as the path with a longer gap after it: at an offset of 1 nothing at all is drawn, not even a cap.
  const stroke = { d: line.d, pathLength: 1, fill: "none", strokeLinecap: "round", strokeDasharray: "1 2" } as const;
  return (
    <svg viewBox={line.box} aria-hidden className={cn("d-home-line", className)}>
      <path {...stroke} className="d-home-trail" stroke="#ffffff" strokeOpacity="0.85" strokeWidth={line.trail} />
      <path {...stroke} className="d-home-route" stroke="var(--color-ink)" strokeWidth={line.ink} />
      {/* The plane. The stylesheet puts it at the end of the stroke, and flies it there along the line. */}
      <g className={cn("d-home-plane", variant === "band" ? "d-home-plane-band" : "d-home-plane-tall")}>
        <g transform={`scale(${line.plane})`}>
          <PaperPlane />
        </g>
      </g>
    </svg>
  );
}
