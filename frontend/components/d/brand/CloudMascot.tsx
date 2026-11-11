import { useId } from "react";
import { cn } from "@/lib/cn";

/*
 * The Cloud9 cloud for version D, as a character (docs/ui-d-cinematic.md, "The cloud").
 * One drawing in a 120 x 96 box, in layers so its parts can act:
 *
 *   .d-cloud              the box: width from the caller, receives --gx / --gy (-1 to 1, where it looks)
 *                         and data-mood (calm by default; curious, nod, glad)
 *   .d-cloud-pose         floats once as it arrives (a loading cloud for as long as it loads), and leans when curious
 *   .d-cloud-art          the drawing; dips for a nod
 *     (svg)               the body
 *     .d-cloud-face       cheeks and mouth; slides toward the look with everything in it: a head turning
 *       .d-cloud-blinks   closes for a blink
 *         .d-cloud-eyes   the eyes travel a little further than the face, and sooner
 *         .d-cloud-glints the catch-lights, which do not travel
 *
 * Every part that moves is an HTML box around its own piece of the drawing, each piece an SVG the
 * size of the whole cloud, rather than a group inside one SVG. Browsers move HTML boxes off the
 * main thread and repaint nothing; a moving group inside an SVG is laid out and painted again on
 * every frame, along with the page layer it sits in.
 *
 * Eyes (open, happy arcs, closed arcs) and mouths (smile, wide) are all in the drawing and swap by
 * opacity: glad shows the happy eyes and the wide smile, and data-eyes="happy | closed" or
 * data-mouth="wide" on the box pick one without a mood. All motion and every state is CSS in
 * app/d/d-cloud.css; the code under components/d/cloud only writes the two look properties and the
 * mood (and empties a home cloud's box while the companion is out). No hooks but useId, so it
 * renders on the server (the loading state is prerendered HTML) and looks the same before any
 * script runs.
 */

/** One closed outline, so the stroke never crosses itself. */
const BODY = "M24 74C8 74 6 54 20 50C16 36 32 26 42 35C44 17 68 13 75 30C87 23 103 34 97 50C111 52 111 74 96 74Z";
const INK = "var(--color-ink)";
const LINE = { fill: "none", stroke: INK, strokeWidth: 3.2, strokeLinecap: "round" } as const;
const VIEW_BOX = "0 0 120 96";
/** A box laid over the whole drawing. Spelled out here as well as in the stylesheet: the layers have to stack even before that arrives. */
const OVER = "absolute inset-0 block";
/** A piece of the drawing in such a box: the same 120 x 96 units as the body under it. */
const PIECE = "absolute inset-0 block h-full w-full overflow-visible";

interface CloudMascotProps {
  /** Width in CSS; the drawing keeps its 5:4 shape. */
  className?: string;
  float?: boolean;
  /** Decorative by default; pass a label when it stands in for text (an empty state). */
  label?: string;
  /** This small inline cloud is where the roaming companion starts and returns to on its page. */
  "data-cloud-home"?: boolean;
  /** This large inline cloud is the page's character: while it is on screen the companion stays away. */
  "data-cloud-stage"?: boolean;
  /** A still face other than the usual one, for a drawing that needs it. The eyes are open and the mouth is a smile by default. */
  "data-eyes"?: "happy" | "closed";
  "data-mouth"?: "wide";
}

export function CloudMascot({
  className,
  float = true,
  label,
  "data-cloud-home": home,
  "data-cloud-stage": stage,
  "data-eyes": eyes,
  "data-mouth": mouth,
}: CloudMascotProps) {
  // Gradient and clip ids have to be unique on a page with several clouds, and the same on the server and the client.
  const id = `d-cloud-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span
      className={cn("d-cloud inline-block", float && "d-cloud-floats", className)}
      data-cloud-home={home ? "" : undefined}
      data-cloud-stage={stage ? "" : undefined}
      data-eyes={eyes}
      data-mouth={mouth}
    >
      <span className="d-cloud-pose">
        {/* One picture to a screen reader, whatever it is made of. */}
        <span
          role={label ? "img" : undefined}
          aria-label={label}
          aria-hidden={label ? undefined : true}
          className="d-cloud-art relative isolate block"
        >
          <svg viewBox={VIEW_BOX} className="block h-auto w-full overflow-visible">
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.3" style={{ stopColor: "var(--color-cream)" }} />
                <stop offset="1" style={{ stopColor: "#FFF1CF" }} />
              </linearGradient>
              <clipPath id={`${id}-clip`}>
                <path d={BODY} />
              </clipPath>
            </defs>

            {/* Where it rests on a card: shown only on the perched companion. */}
            <ellipse className="d-cloud-shadow" cx="60" cy="77.5" rx="36" ry="3.5" fill={INK} />

            {/* Body: fill, the warm underside and the sunlit rim inside the outline, then the outline over them. */}
            <path d={BODY} fill={`url(#${id}-fill)`} />
            <g clipPath={`url(#${id}-clip)`}>
              <ellipse cx="60" cy="86" rx="56" ry="18" fill="var(--color-cream-deep)" />
            </g>
            <path d="M27 43C29 36 35 33 40 35" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d={BODY} fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          </svg>

          <span className={cn("d-cloud-face", OVER)}>
            <svg viewBox={VIEW_BOX} className={PIECE}>
              <ellipse className="d-cloud-cheek" cx="41" cy="59" rx="4.6" ry="3" fill="var(--color-gold)" />
              <ellipse className="d-cloud-cheek" cx="75" cy="59" rx="4.6" ry="3" fill="var(--color-gold)" />
              <path className="d-cloud-smile" d="M52 60.5C55 64.5 61 64.5 64 60.5" {...LINE} />
              <path className="d-cloud-wide" d="M50.5 60C54 66 62 66 65.5 60" {...LINE} />
            </svg>
            <span className={cn("d-cloud-blinks", OVER)}>
              <span className={cn("d-cloud-eyes", OVER)}>
                <svg viewBox={VIEW_BOX} className={PIECE}>
                  <g className="d-cloud-eyes-open">
                    <circle cx="49" cy="52" r="3.5" fill={INK} />
                    <circle cx="67" cy="52" r="3.5" fill={INK} />
                  </g>
                  <g className="d-cloud-eyes-happy">
                    <path d="M45.4 53.2Q49 48.6 52.6 53.2" {...LINE} />
                    <path d="M63.4 53.2Q67 48.6 70.6 53.2" {...LINE} />
                  </g>
                  <g className="d-cloud-eyes-closed">
                    <path d="M45.6 52Q49 55 52.4 52" {...LINE} />
                    <path d="M63.6 52Q67 55 70.4 52" {...LINE} />
                  </g>
                </svg>
              </span>
              {/* Catch-lights sit outside the eyes' box: light does not follow a gaze, so they stay put while the eyes travel. */}
              <svg viewBox={VIEW_BOX} className={cn("d-cloud-glints", PIECE)}>
                <circle cx="50" cy="50.8" r="1.05" fill="#fff" />
                <circle cx="68" cy="50.8" r="1.05" fill="#fff" />
              </svg>
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
