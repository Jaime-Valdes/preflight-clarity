"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { DSkyCloud, DSkyDeck } from "./DSkyCloud";
import { skyFramesPage, skySceneFor } from "./scene";

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
 * The wrappers around each drawing have one job each (see the stylesheet): d-sky-ptr, outermost
 * and a child of the root, the pointer parallax (it also carries the sprite's name, which the
 * scenes place); d-sky-at (d-sky-deck for the deck) the scene position; d-sky-par the scroll
 * parallax; d-sky-drift the slow drift. The pointer wrapper is outermost so that the pointer's
 * place, written on the root, reaches the boxes that read it and nothing under them.
 */
export function DSky() {
  // The layout stays mounted across /d, so the pathname is the only thing that changes here:
  // links, router pushes, Back and Forward all arrive as a new pathname.
  const pathname = usePathname();
  const scene = skySceneFor(pathname);
  // A /d route that is none of the four pages (not-found): its scene has no card for the low clouds to wait behind.
  const elsewhere = !skyFramesPage(pathname);
  const skyRef = useRef<HTMLDivElement>(null);
  usePointerPlace(skyRef);

  return (
    <div ref={skyRef} className="d-sky" data-scene={scene} data-elsewhere={elsewhere ? "" : undefined} aria-hidden="true">
      {/* Air: one gradient per scene, in page order. */}
      <div className="d-sky-air d-sky-air-home" />
      <div className="d-sky-air d-sky-air-results" />
      <div className="d-sky-air d-sky-air-flight" />
      <div className="d-sky-air d-sky-air-compare" />

      <div className="d-sky-ptr d-sky-sun">
        <div className="d-sky-at">
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
    <div className={`d-sky-ptr ${className}`}>
      <div className="d-sky-at d-sky-cloud">
        <div className="d-sky-par">
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
    <div className={`d-sky-ptr ${className}`}>
      <div className="d-sky-deck">
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
/**
 * At most one write every 100 ms, a whole interval after the last: session replay records each one, and
 * keeps at most ten a second per element. Both values go in one write, so a write is one recorded mutation.
 */
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
      // React never sets a style on this node, so the attribute is ours to replace whole.
      sky.setAttribute("style", `--d-sky-px:${x};--d-sky-py:${y}`);
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
      sky.removeAttribute("style");
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
