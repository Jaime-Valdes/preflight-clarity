"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * The drawing of the Cloud9 cloud for version D (docs/ui-d-cinematic.md, "The cloud"); ./CloudMascot is
 * the component to use. One drawing in a 120 x 96 box, in layers so its parts can act:
 *
 *   .d-cloud              the box: width from the caller, receives --gx / --gy (-1 to 1, where it looks),
 *                         data-face (a face: bright, beam) and data-mood (a motion: nod, lift, curious)
 *   .d-cloud-pose         floats once as it arrives (a loading cloud for as long as it loads), and tilts when curious
 *   .d-cloud-art          the drawing; dips for a nod, rises for a lift
 *     (svg)               the body; by night on the sky, a moonlit rim outside its outline
 *     .d-cloud-face       cheeks and mouths; slides toward the look with everything in it: a head turning
 *       .d-cloud-part …   each mouth (smile, wide, open) in a box of its own
 *       .d-cloud-blinks   closes for a blink
 *         .d-cloud-eyes   the eyes (open, happy, closed, each in a box of its own) travel a little further than
 *                         the face, and sooner
 *         .d-cloud-glints the catch-lights, which do not travel
 *
 * Every part that moves or changes is an HTML box around its own piece of the drawing, each piece an SVG
 * the size of the whole cloud, rather than a group inside one SVG. Browsers move HTML boxes and change
 * their opacity off the main thread and repaint nothing; a group inside an SVG that moves or fades is
 * laid out and painted again on every frame, along with the page layer it sits in.
 *
 * The faces swap whole parts by opacity (nothing morphs): rest (open eyes, smile), bright (open eyes, an
 * open smile) and beam (happy arcs, the wide smile). data-eyes="happy | closed" or data-mouth="wide" on
 * the box pick a still face without a reaction. All motion and every state is CSS in app/d/d-cloud.css;
 * the code under components/d/cloud only writes the two look properties, the face and the mood (and
 * empties a home cloud's box while the companion is out). No hooks at all, so it renders on the server
 * (the loading state is prerendered HTML) and looks the same before any script runs.
 *
 * A client component only so that a server component's page (the not-found card, the loading state) sends
 * the browser a reference to it and its props, not the whole drawing a second time in the page's data: it
 * is in the client's code anyway, for the screens that draw it. ./CloudMascot gives it its ids.
 */

/** One closed outline, so the stroke never crosses itself. */
const BODY = "M24 74C8 74 6 54 20 50C16 36 32 26 42 35C44 17 68 13 75 30C87 23 103 34 97 50C111 52 111 74 96 74Z";
const INK = "var(--color-ink)";
const LINE = { fill: "none", stroke: INK, strokeWidth: 3.8, strokeLinecap: "round" } as const;
const SOLID = { fill: INK, stroke: INK, strokeWidth: 2.85, strokeLinejoin: "round" } as const;
const VIEW_BOX = "0 0 120 96";
/** A box laid over the whole drawing. Spelled out here as well as in the stylesheet: the layers have to stack even before that arrives. */
const OVER = "absolute inset-0 block";
/** A piece of the drawing in such a box: the same 120 x 96 units as the body under it. */
const PIECE = "absolute inset-0 block h-full w-full overflow-visible";

/**
 * One state of a feature (a mouth, a pair of eyes, the catch-lights) in a box of its own, so it can fade by itself.
 * The stylesheet makes the box cover the drawing (.d-cloud-part); its piece is placed by its own classes, so it
 * stacks even before that arrives. Hook-free.
 */
function Part({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className={cn("d-cloud-part", name)}>
      <svg viewBox={VIEW_BOX} className={PIECE}>
        {children}
      </svg>
    </span>
  );
}

export interface CloudDrawingProps {
  /** The unique base of the drawing's gradient and clip ids (CloudMascot's useId). */
  id: string;
  className?: string;
  float: boolean;
  label?: string;
  home?: boolean;
  stage?: boolean;
  eyes?: "happy" | "closed";
  mouth?: "wide";
}

export function CloudDrawing({ id, className, float, label, home, stage, eyes, mouth }: CloudDrawingProps) {
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

            {/* Body: fill, the warm underside and the sunlit rim inside the outline, then the outline over them. By
                night on the sky the fill also wears a moonlit stroke under itself (.d-cloud-body in d-cloud.css,
                painted before the fill), so a thin rim of moonlight shows outside the outline. */}
            <path className="d-cloud-body" d={BODY} fill={`url(#${id}-fill)`} />
            <g clipPath={`url(#${id}-clip)`}>
              <ellipse cx="60" cy="86" rx="56" ry="18" fill="var(--color-cream-deep)" />
            </g>
            <path d="M27 43C29 36 35 33 40 35" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d={BODY} fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          </svg>

          <span className={cn("d-cloud-face", OVER)}>
            {/* The cheeks, the same in every face. */}
            <svg viewBox={VIEW_BOX} className={PIECE}>
              <ellipse cx="38.4" cy="58.6" rx="5.6" ry="3.7" fill="var(--color-gold)" />
              <ellipse cx="77.6" cy="58.6" rx="5.6" ry="3.7" fill="var(--color-gold)" />
            </svg>
            <Part name="d-cloud-smile">
              <path d="M49 58.4C52.4 65.1 63.6 65.1 67 58.4" {...LINE} />
            </Part>
            <Part name="d-cloud-wide">
              <path d="M47.2 57.8C51 66.6 65 66.6 68.8 57.8" {...LINE} />
            </Part>
            {/* A grin: a flat-ish top edge and a round bottom, never an "O". */}
            <Part name="d-cloud-open">
              <path d="M50 57.8Q58 59.4 66 57.8C65 66.6 51 66.6 50 57.8Z" {...SOLID} />
            </Part>
            <span className={cn("d-cloud-blinks", OVER)}>
              <span className={cn("d-cloud-eyes", OVER)}>
                <Part name="d-cloud-eyes-open">
                  <ellipse cx="48.5" cy="50.4" rx="4.5" ry="5.4" fill={INK} />
                  <ellipse cx="67.5" cy="50.4" rx="4.5" ry="5.4" fill={INK} />
                </Part>
                <Part name="d-cloud-eyes-happy">
                  <path d="M43.7 52.8Q48.5 44.4 53.3 52.8" {...LINE} />
                  <path d="M62.7 52.8Q67.5 44.4 72.3 52.8" {...LINE} />
                </Part>
                <Part name="d-cloud-eyes-closed">
                  <path d="M44 50.6Q48.5 55 53 50.6" {...LINE} />
                  <path d="M63 50.6Q67.5 55 72 50.6" {...LINE} />
                </Part>
              </span>
              {/* Catch-lights sit outside the eyes' box: light does not follow a gaze, so they stay put while the eyes travel. */}
              <Part name="d-cloud-glints">
                <circle cx="50" cy="48.3" r="1.6" fill="#fff" />
                <circle cx="69" cy="48.3" r="1.6" fill="#fff" />
              </Part>
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
