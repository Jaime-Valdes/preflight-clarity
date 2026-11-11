"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { DSkyCloud, DSkyDeck } from "./DSkyCloud";
import { skySceneFor } from "./scene";

/**
 * The fixed sky behind every /d page (docs/ui-d-cinematic.md, "The sky"), mounted once in
 * app/d/layout.tsx so it survives navigation. A page is a camera position in it: the
 * pathname picks one of four scenes, `data-scene` carries it, and app/d/d-sky.css moves the
 * air, the sun, four clouds and the cloud deck to that scene's places. Nothing is swapped on
 * a page change, so the sky glides while the page under it changes.
 *
 * Decoration only: hidden from assistive technology, takes no input, logs nothing. All the
 * movement is CSS (transitions, keyframes, a scroll timeline). The one thing this file
 * writes is the pointer's place, for the mouse parallax.
 *
 * The wrappers around each drawing have one job each (see the stylesheet): d-sky-at is the
 * scene position, d-sky-par the scroll parallax, d-sky-ptr the pointer parallax and
 * d-sky-drift the slow drift.
 */
export function DSky() {
  // The layout stays mounted across /d, so the pathname is the only thing that changes here:
  // links, router pushes, Back and Forward all arrive as a new pathname.
  const scene = skySceneFor(usePathname());
  const skyRef = useRef<HTMLDivElement>(null);
  usePointerPlace(skyRef);

  return (
    <div ref={skyRef} className="d-sky" data-scene={scene} aria-hidden="true">
      {/* Air: one gradient per scene, in page order. */}
      <div className="d-sky-air d-sky-air-home" />
      <div className="d-sky-air d-sky-air-results" />
      <div className="d-sky-air d-sky-air-flight" />
      <div className="d-sky-air d-sky-air-compare" />

      <div className="d-sky-at d-sky-sun">
        <div className="d-sky-ptr">
          <div className="d-sun" />
        </div>
      </div>

      {/* Far, mid, then the two near clouds. */}
      <Cloud className="d-sky-a" />
      <Cloud className="d-sky-b" />
      <Cloud className="d-sky-c" />
      <Cloud className="d-sky-d" shape="round" />

      <DeckBand className="d-sky-deck-back" />
      <DeckBand className="d-sky-deck-front" mirrored />
    </div>
  );
}

function Cloud({ className, shape }: { className: string; shape?: "wide" | "round" }) {
  return (
    <div className={`d-sky-at d-sky-cloud ${className}`}>
      <div className="d-sky-par">
        <div className="d-sky-ptr">
          {/* The drift is on a box around the drawing: animated on the <svg> itself it would run on the main thread. */}
          <div className="d-sky-drift">
            <DSkyCloud shape={shape} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One band of the deck: the same shape twice, in daylight white and in butter, so the afternoon can fade one over the other. */
function DeckBand({ className, mirrored }: { className: string; mirrored?: boolean }) {
  return (
    <div className={`d-sky-deck ${className}`}>
      <div className="d-sky-ptr">
        <div className="d-sky-drift d-sky-band">
          <div className="d-sky-band-day">
            <DSkyDeck mirrored={mirrored} />
          </div>
          <div className="d-sky-band-gold">
            <DSkyDeck mirrored={mirrored} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mouse parallax runs only where there is a hovering, precise pointer and no request for less motion. */
const WANTS_PARALLAX = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
/** At most one write every 100 ms: session replay records each one, and keeps at most ten a second per element. */
const WRITE_EVERY_MS = 100;
/** The place is rounded to fiftieths, so a resting or barely moving pointer writes nothing. */
const STEPS = 50;

/**
 * Tells the stylesheet where the mouse is: `--d-sky-px` and `--d-sky-py` on the sky root, each
 * from -1 to 1 measured from the middle of the window. The layers shift against it by their depth
 * and a CSS transition does the easing, so there is no animation loop here.
 */
function usePointerPlace(skyRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const sky = skyRef.current;
    if (!sky) return;
    const wanted = window.matchMedia(WANTS_PARALLAX);
    let clientX = 0;
    let clientY = 0;
    let writtenX = 0;
    let writtenY = 0;
    let timer: number | undefined;

    const place = (at: number, size: number) => Math.max(-1, Math.min(1, Math.round((at / size) * 2 * STEPS - STEPS) / STEPS));

    const write = () => {
      timer = undefined;
      // Under an open sheet the page is inert; the sky holds still with it.
      if (sky.closest("[inert]")) return;
      const x = place(clientX, window.innerWidth || 1);
      const y = place(clientY, window.innerHeight || 1);
      if (x === writtenX && y === writtenY) return;
      writtenX = x;
      writtenY = y;
      sky.style.setProperty("--d-sky-px", String(x));
      sky.style.setProperty("--d-sky-py", String(y));
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      clientX = event.clientX;
      clientY = event.clientY;
      if (timer === undefined) timer = window.setTimeout(write, WRITE_EVERY_MS);
    };

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(timer);
      timer = undefined;
      writtenX = 0;
      writtenY = 0;
      sky.style.removeProperty("--d-sky-px");
      sky.style.removeProperty("--d-sky-py");
    };

    const sync = () => {
      stop();
      if (wanted.matches) window.addEventListener("pointermove", onMove, { passive: true });
    };

    sync();
    wanted.addEventListener("change", sync);
    return () => {
      wanted.removeEventListener("change", sync);
      stop();
    };
  }, [skyRef]);
}
