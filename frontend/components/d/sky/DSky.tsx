"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { transitionRunning } from "@/components/d/motion/motion";
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
 * movement is CSS (transitions, keyframes, a scroll timeline). This file writes two things on
 * the sky's root and nothing else: the pointer's place, for the mouse parallax, and a mark once
 * the sky has been drawn (`data-drawn`), which lets a sprite a scene shows again glide back in.
 *
 * The clouds and the deck travel slowly from left to right, for ever (the owner's request). The
 * sun never travels.
 *
 * By night (data-d-time on the D root; docs/ui-d-cinematic.md, "Day and night") the same boxes are
 * drawn in moonlight, the airs carry the star field (a pseudo-element, no element of its own), eight
 * stars twinkle now and then, and tonight's moon (its phase is a style the boot script and the sky's
 * clock write in <head>) takes the sun's place. By day the twinkles and the moon are not drawn.
 *
 * The boxes around each drawing have one job each (see the stylesheet): d-sky-at (d-sky-deck for
 * the deck), a child of the root carrying the sprite's name, which the scenes place, takes the
 * scene position (translate, opacity; for the sun and the deck also scale) and the pointer
 * parallax (transform); d-sky-par the scroll parallax; d-sky-trip the travel across the frame
 * (d-sky-band for the deck); d-sky-size a cloud's size in the scene (scale), innermost so that
 * the travel is in frame pixels and a size change never slides a cloud sideways. The scene box is
 * outermost so that the pointer's place, written on the root, reaches the boxes that read it and
 * nothing under them. There is no frame-sized wrapper: every cloud's boxes are the size of its
 * drawing, and a deck band is two decks wide, because WebKit pays for each of the sky's boxes in
 * every frame of a page transition, moving or not.
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
  useDrawnMark(skyRef);

  return (
    <div ref={skyRef} className="d-sky" data-scene={scene} data-elsewhere={elsewhere ? "" : undefined} aria-hidden="true">
      {/* Air: one gradient per scene, in page order. */}
      <div className="d-sky-air d-sky-air-home" />
      <div className="d-sky-air d-sky-air-results" />
      <div className="d-sky-air d-sky-air-flight" />
      <div className="d-sky-air d-sky-air-compare" />

      {/* By night: eight stars that twinkle now and then, at the edges and the top (the stylesheet places them). */}
      <div className="d-sky-tw">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="d-sky-at d-sky-sun">
        <div className="d-sun" />
        <div className="d-moon" />
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
        {/* The travel is on a box around the drawing: animated on the <svg> itself it would run on the main thread. */}
        <div className="d-sky-trip">
          <div className="d-sky-size">
            <DSkyCloud shape={shape} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One band of the deck: the same shape twice, in daylight white and in butter, so the afternoon can fade one
 * over the other. The band box is two decks wide (each drawing is two periods of the shape) and travels by one.
 */
function DeckBand({ className, mirrored }: { className: string; mirrored?: boolean }) {
  return (
    <div className={`d-sky-deck ${className}`}>
      <div className="d-sky-band">
        <div className="d-sky-band-day">
          <DSkyDeck mirrored={mirrored} />
        </div>
        <div className="d-sky-band-gold">
          <DSkyDeck mirrored={mirrored} />
        </div>
      </div>
    </div>
  );
}

/**
 * Marks the sky as drawn: `data-drawn` on the root once the sky has been on screen for a frame,
 * taken off again when the layout is hidden (a kept-alive page) or unmounted. A sprite that a
 * scene leaves out is out of the render tree, and the stylesheet starts its return from where
 * the scenes left it (a starting style) only under this mark. Without it that starting style
 * would also apply whenever the whole sky is drawn for the first time, and the clouds would
 * glide and fade in on a tab opened in the background, on an arrival from another layout and
 * on a return to a kept-alive page, where today the sky simply is where its scene puts it.
 */
function useDrawnMark(skyRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const sky = skyRef.current;
    if (!sky) return;
    // Two frames: the first callback runs before its frame's styles are worked out, so the sky is
    // drawn once without the mark; the second sets it. Neither runs while the tab is hidden.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => sky.setAttribute("data-drawn", ""));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      sky.removeAttribute("data-drawn");
    };
  }, [skyRef]);
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
      // Under an open sheet the page is inert; the sky holds still with it. So it does during a page
      // transition, which WebKit draws only as fast as the page commits: the next move after it writes.
      if (sky.closest("[inert]") || transitionRunning()) return;
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
