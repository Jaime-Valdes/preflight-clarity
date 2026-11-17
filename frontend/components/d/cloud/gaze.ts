/*
 * Where the clouds look (docs/ui-d-cinematic.md, "Gaze"): every cloud on screen turns its eyes to
 * the mouse, or to the thumb while a finger is down, and back to the visitor when that stops.
 * A look is two numbers on the cloud, --gx and --gy (-1 to 1); the drawing's CSS turns them into
 * a face that slides and eyes that lead (app/d/d-cloud.css). They are written at most once every
 * MOVE_MS per cloud, both in one write, only when they change and only on a cloud that can be
 * seen, because session replay records every write. While a page transition runs the eyes look
 * ahead and hold still: no look is written until it has ended (in Safari each write would restyle
 * the live new page the transition is drawing).
 * The only inputs are a point on the screen and each cloud's own box.
 */

import { watchAttention, type Pointer } from "./attention";
import { AWAY, CLOUD, behindSheet, isSeen, transitionRunning, writeLook } from "./dom";

/** The face's place in the cloud's box: the eyes sit a little left of centre, below the middle. */
const FACE_X = 58 / 120;
const FACE_Y = 55 / 96;
/** A look is at full stretch from this far away (px). Nearer, it eases off, so the eyes do not snap as the pointer passes over. */
const REACH = 140;
/** The eyes stay on the spot this long after the finger lifts. */
const LIFT_MS = 600;
/** A mouse that has not moved for this long is no longer something to look at. */
const REST_MS = 6000;
/** Clouds further than this (px) above or below the screen are not aimed. */
const NEAR = 240;

export interface Gaze {
  /**
   * The page changed: every cloud looks ahead again (the ones on the page left behind keep no
   * stale look). During a page transition that is the last look written until it ends.
   */
  pageChanged(): void;
  stop(): void;
}

/** A look in hundredths: steps too small to see are not worth a write. */
function quantum(value: number): string {
  return String(Math.round(value * 100) / 100 || 0);
}

export function startGaze(root: HTMLElement): Gaze {
  /** What the eyes are on, in viewport coordinates; null is the visitor. */
  let point: { x: number; y: number } | null = null;
  let restTimer: number | null = null;
  /** A sheet is open over the page. */
  let frozen = false;

  function aim() {
    // Every read before any write, so the browser lays the page out once at most.
    const looks: Array<[cloud: HTMLElement, gx: string, gy: string]> = [];
    for (const cloud of root.querySelectorAll<HTMLElement>(CLOUD)) {
      // A home cloud whose companion is out is empty, or fading: nobody sees where it looks, and it
      // is not written. It takes the companion's look in the frame it shows again (companion.ts, land).
      if (cloud.closest(`[${AWAY}]`)) continue;
      // Nothing to look at, or a cloud that is hidden or far off screen: no look of its own.
      let gx = "";
      let gy = "";
      if (point && isSeen(cloud)) {
        const box = cloud.getBoundingClientRect();
        if (box.width > 0 && box.bottom > -NEAR && box.top < window.innerHeight + NEAR) {
          const dx = point.x - (box.left + box.width * FACE_X);
          const dy = point.y - (box.top + box.height * FACE_Y);
          const reach = Math.max(REACH, box.width, Math.hypot(dx, dy));
          gx = quantum(dx / reach);
          gy = quantum(dy / reach);
        }
      }
      looks.push([cloud, gx, gy]);
    }
    for (const [cloud, gx, gy] of looks) writeLook(cloud, gx, gy);
  }

  function cancelRest() {
    if (restTimer !== null) window.clearTimeout(restTimer);
    restTimer = null;
  }

  function ahead() {
    cancelRest();
    point = null;
    aim();
  }

  function aheadIn(ms: number) {
    cancelRest();
    restTimer = window.setTimeout(ahead, ms);
  }

  /** True while a sheet covers the page: the first time, the eyes go ahead and stay there. */
  function heldBySheet(): boolean {
    if (!behindSheet(root)) {
      frozen = false;
      return false;
    }
    if (!frozen) {
      frozen = true;
      ahead();
    }
    return true;
  }

  const unwatch = watchAttention({
    move(pointer: Pointer, real: boolean) {
      if (heldBySheet() || transitionRunning()) return;
      if (pointer.kind === "touch") {
        // A late report after the finger has lifted changes nothing: the look is already on its way back.
        if (!pointer.down) return;
        cancelRest();
      } else if (real) {
        aheadIn(REST_MS);
      } else if (!point) {
        // The page moved under a mouse that is resting and already forgotten.
        return;
      }
      point = { x: pointer.x, y: pointer.y };
      aim();
    },
    touch(down: boolean) {
      if (heldBySheet() || transitionRunning()) return;
      if (!down) aheadIn(LIFT_MS);
    },
    leave() {
      if (heldBySheet() || transitionRunning()) return;
      ahead();
    },
  });

  return {
    pageChanged() {
      ahead();
    },
    stop() {
      unwatch();
      cancelRest();
      point = null;
      aim();
    },
  };
}
