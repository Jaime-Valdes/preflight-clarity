/*
 * Where the clouds look (docs/ui-d-cinematic.md, "Gaze"): every cloud on screen turns its eyes to
 * the mouse, or to the thumb while a finger is down, and back to the visitor when that stops.
 * A look is two numbers on the cloud, --gx and --gy (-1 to 1); the drawing's CSS turns them into
 * a face that slides and eyes that lead (app/d/d-cloud.css). They are written at most once every
 * MOVE_MS per cloud and only when they change, because session replay records every write.
 * The only inputs are a point on the screen and each cloud's own box.
 */

import { MOVE_MS, watchAttention, type Pointer } from "./attention";
import { CLOUD, isSeen } from "./dom";

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

/** Writes one of the two look properties, or with "" takes it off: the cloud then looks ahead (or wherever an ancestor's --gx / --gy rests it). */
function setLook(cloud: HTMLElement, name: "--gx" | "--gy", value: string) {
  if (cloud.style.getPropertyValue(name) === value) return;
  if (value) cloud.style.setProperty(name, value);
  else cloud.style.removeProperty(name);
}

/** A CSS time ("760ms", "0.76s") in milliseconds. */
function milliseconds(text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  return text.trim().endsWith("ms") ? value : value * 1000;
}

/** A CSS length in px or vh as pixels of this viewport. */
function pixels(text: string): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  return text.trim().endsWith("vh") ? (value / 100) * window.innerHeight : value;
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
    for (const [cloud, gx, gy] of looks) {
      setLook(cloud, "--gx", gx);
      setLook(cloud, "--gy", gy);
    }
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
  function behindSheet(): boolean {
    if (!root.inert) {
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
   * The plane of the page transition crosses left to right on one linear clock, a little ahead of
   * its ribbon and climbing slightly (app/d/d-transition.css). The eyes travel with it and then
   * return to the visitor. An estimate of its path is enough for a look.
   */
  function followPlane() {
    const html = getComputedStyle(document.documentElement);
    const total = milliseconds(html.getPropertyValue("--d-vt")) ?? 760;
    const height = window.innerHeight;
    const tap = pixels(html.getPropertyValue("--d-tap-y")) ?? height * 0.42;
    const y = Math.min(Math.max(tap, height * 0.18), height * 0.72);
    const began = performance.now();
    endPlane();
    cancelRest();
    const step = () => {
      const done = (performance.now() - began) / total;
      if (done >= 1 || root.inert) {
        endPlane();
        ahead();
        return;
      }
      point = { x: window.innerWidth * (-0.24 + 1.8 * done), y: y - height * 0.03 * done };
      aim();
    };
    step();
    planeTimer = window.setInterval(step, MOVE_MS);
  }

  const unwatch = watchAttention({
    move(pointer: Pointer, real: boolean) {
      if (behindSheet() || planeTimer !== null) return;
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
      if (behindSheet() || planeTimer !== null) return;
      if (!down) aheadIn(LIFT_MS);
    },
    leave() {
      if (behindSheet() || planeTimer !== null) return;
      ahead();
    },
  });

  return {
    pageChanged() {
      endPlane();
      let plane = false;
      try {
        plane = document.documentElement.matches(":active-view-transition");
      } catch {
        // A browser without view transitions does not know the selector, and has no plane.
      }
      if (plane && !root.inert) followPlane();
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
