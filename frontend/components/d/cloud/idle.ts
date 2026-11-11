/*
 * Idle life (docs/ui-d-cinematic.md, "Gaze": "idle looks only go up or to the reader"). When
 * the visitor has done nothing for a while, the clouds that stand in the page (a stage cloud, a
 * home cloud) glance up at the sky once and then look back at the visitor.
 *
 * Once for each pause, and nothing more until the visitor has done something again: there is no
 * loop beside text. Only ever straight up: sideways may be a card. And the roaming companion is
 * left out altogether, because where it sits, in the gap between two cards, up is the card above
 * it; its idle look is the one it already has, at the visitor.
 *
 * The look is the same two properties the gaze writes (./gaze): this file only borrows them
 * while the gaze is at rest, and hands them back the moment anything happens.
 */

import { watchAttention } from "./attention";
import { CLOUD, behindSheet, inViewport, isSeen, lookOf, writeLook } from "./dom";

/** How long nothing has to happen. Longer than the gaze takes to let go of a resting mouse (6 s) or a lifted finger (600 ms). */
const IDLE_MS = 6600;
/** How long the glance is held. */
const GLANCE_MS = 1200;
/** The look of the glance: ahead, and most of the way up. */
const UP = { "--gx": "0", "--gy": "-0.7" } as const;

/** Starts the idle glances inside `root` (the /d layout). Returns the way to stop. */
export function startIdle(root: HTMLElement): () => void {
  let idleTimer: number | null = null;
  let backTimer: number | null = null;
  /** The clouds wearing the glance right now. */
  let glancing: HTMLElement[] = [];

  /** Takes the glance off again, from every cloud that still wears it (one the gaze has aimed since is left alone). */
  function back() {
    if (backTimer !== null) window.clearTimeout(backTimer);
    backTimer = null;
    for (const cloud of glancing) {
      const look = lookOf(cloud);
      if (look.gx !== UP["--gx"] || look.gy !== UP["--gy"]) continue;
      writeLook(cloud, "", "");
    }
    glancing = [];
  }

  function glance() {
    idleTimer = null;
    // Behind an open sheet the page is inert, and so are its clouds.
    if (behindSheet(root)) return;
    // Every read before any write.
    const clouds: HTMLElement[] = [];
    for (const cloud of root.querySelectorAll<HTMLElement>(CLOUD)) {
      // Not the companion, not a cloud in the middle of a reaction, not one nobody can see.
      if (cloud.closest(".d-companion") || cloud.hasAttribute("data-mood")) continue;
      if (!isSeen(cloud) || !inViewport(cloud.getBoundingClientRect())) continue;
      // And not one that is looking somewhere already: the gaze still holds it, or its page gave it a look to rest in.
      const style = getComputedStyle(cloud);
      if (style.getPropertyValue("--gx").trim() || style.getPropertyValue("--gy").trim()) continue;
      clouds.push(cloud);
    }
    if (clouds.length === 0) return;
    for (const cloud of clouds) writeLook(cloud, UP["--gx"], UP["--gy"]);
    glancing = clouds;
    backTimer = window.setTimeout(back, GLANCE_MS);
  }

  /** The visitor did something: the clouds are theirs again, and the wait starts over. */
  function stirred() {
    if (glancing.length > 0) back();
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(glance, IDLE_MS);
  }

  const unwatch = watchAttention({
    move(_pointer, real) {
      if (real) stirred();
    },
    touch: stirred,
    tap: stirred,
    focus: stirred,
    stir: stirred,
    leave: stirred,
  });
  // A page nobody has touched yet is a pause too.
  stirred();

  return () => {
    unwatch();
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = null;
    back();
  };
}
