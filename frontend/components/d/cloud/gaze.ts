/*
 * Where the clouds look (docs/ui-d-cinematic.md, "Gaze"): every cloud on screen turns its eyes to
 * the mouse, or to the thumb while a finger is down, and back to the visitor when that stops.
 * A look is two numbers on the cloud, --gx and --gy (-1 to 1); the drawing's CSS turns them into
 * a face that slides and eyes that lead (app/d/d-cloud.css). They are written at most once every
 * MOVE_MS per cloud, both in one write, only when they change and only on a cloud that can be
 * seen, because session replay records every write.
 * The only inputs are a point on the screen and each cloud's own box.
 */

import { MOVE_MS, watchAttention, type Pointer } from "./attention";
import { AWAY, CLOUD, behindSheet, isSeen, writeLook } from "./dom";

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
   * stale look), and if the page-transition plane is crossing, the eyes go with it first.
   */
  pageChanged(): void;
  stop(): void;
}

/** A look in hundredths: steps too small to see are not worth a write. */
function quantum(value: number): string {
  return String(Math.round(value * 100) / 100 || 0);
}

/** A CSS time ("760ms", "0.76s") in milliseconds. */
function milliseconds(text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  return text.trim().endsWith("ms") ? value : value * 1000;
}

/** A plain CSS length in px, vw or vh as pixels of this viewport. */
function pixels(text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  const length = text.trim();
  if (length.endsWith("vw")) return (value / 100) * window.innerWidth;
  if (length.endsWith("vh")) return (value / 100) * window.innerHeight;
  return value;
}

export function startGaze(root: HTMLElement): Gaze {
  /** What the eyes are on, in viewport coordinates; null is the visitor. */
  let point: { x: number; y: number } | null = null;
  let restTimer: number | null = null;
  /** Running while the eyes follow the plane; the pointer waits its turn. */
  let planeTimer: number | null = null;
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

  function endPlane() {
    if (planeTimer !== null) window.clearInterval(planeTimer);
    planeTimer = null;
  }

  /** True while a sheet covers the page: the first time, the eyes go ahead and stay there. */
  function heldBySheet(): boolean {
    if (!behindSheet(root)) {
      frozen = false;
      return false;
    }
    if (!frozen) {
      frozen = true;
      endPlane();
      ahead();
    }
    return true;
  }

  /**
   * Whether the page transition is still running: true or false where the browser can tell, null
   * where it cannot (no view transitions, or no :active-view-transition), which leaves the clock.
   */
  function transitionRunning(): boolean | null {
    try {
      return document.documentElement.matches(":active-view-transition");
    } catch {
      return null;
    }
  }

  /**
   * The plane of the page transition crosses left to right on one linear clock, ahead of its
   * ribbon and climbing slightly. Its stylesheet (app/d/d-transition.css) publishes the path for
   * this screen width on <html>: the seam under the ribbon travels from --d-vt-from to --d-vt-to
   * and the middle of the plane flies --d-vt-lead ahead of it. The eyes travel with the plane and
   * then return to the visitor. The fallbacks are that stylesheet's first numbers.
   */
  function followPlane() {
    const html = getComputedStyle(document.documentElement);
    const total = milliseconds(html.getPropertyValue("--d-vt")) ?? 760;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const from = pixels(html.getPropertyValue("--d-vt-from")) ?? width * -0.4;
    const to = pixels(html.getPropertyValue("--d-vt-to")) ?? width * 1.4;
    const lead = pixels(html.getPropertyValue("--d-vt-lead")) ?? width * 0.16;
    const tap = pixels(html.getPropertyValue("--d-tap-y")) ?? height * 0.42;
    const y = Math.min(Math.max(tap, height * 0.18), height * 0.72);
    const began = performance.now();
    endPlane();
    cancelRest();
    const step = () => {
      const done = (performance.now() - began) / total;
      // A click that ends the wipe early (one that opens a new tab, the skip link, the same page)
      // takes the plane away with it: the eyes leave it at once rather than follow it to the end.
      if (done >= 1 || behindSheet(root) || transitionRunning() === false) {
        endPlane();
        ahead();
        return;
      }
      point = { x: from + (to - from) * done + lead, y: y - height * 0.03 * done };
      aim();
    };
    step();
    planeTimer = window.setInterval(step, MOVE_MS);
  }

  const unwatch = watchAttention({
    move(pointer: Pointer, real: boolean) {
      if (heldBySheet() || planeTimer !== null) return;
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
      if (heldBySheet() || planeTimer !== null) return;
      if (!down) aheadIn(LIFT_MS);
    },
    leave() {
      if (heldBySheet() || planeTimer !== null) return;
      ahead();
    },
  });

  return {
    pageChanged() {
      endPlane();
      // A browser without view transitions does not know the selector, and has no plane.
      if (transitionRunning() === true && !behindSheet(root)) followPlane();
      else ahead();
    },
    stop() {
      unwatch();
      endPlane();
      cancelRest();
      point = null;
      aim();
    },
  };
}
