/*
 * How a cloud answers what the visitor does (docs/ui-d-cinematic.md, "Reactions"). D's
 * components call cloudReact(kind) in ./react; this listens and has one cloud on screen wear the
 * matching mood for a moment (the acting itself is CSS on data-mood, app/d/d-cloud.css).
 * A reaction is its kind and nothing else: which cloud acts depends only on which clouds are on
 * screen, and the acting is the same every time, so "noted" looks identical whatever it was for.
 */

import { CLOUD, HOME, STAGE, behindSheet, inViewport, isSeen } from "./dom";
import { CLOUD_REACT_EVENT, type CloudReaction } from "./react";

/** How long each mood is worn (ms). The nod is its 300 ms of keyframes and a little to spare. */
const HOLD: Record<CloudReaction, number> = { nod: 340, curious: 800, glad: 900 };
/** With no cloud on screen yet (the companion is on its way to a first seat), one more try this much later. */
const AGAIN_MS = 200;

function isReaction(value: unknown): value is CloudReaction {
  return value === "nod" || value === "curious" || value === "glad";
}

/** Starts listening for reactions inside `root` (the /d layout). Returns the way to stop. */
export function startReactions(root: HTMLElement): () => void {
  /** Clouds wearing a mood, with the timer that takes it off again. */
  const worn = new Map<HTMLElement, number>();
  let again: number | null = null;

  /** The cloud that acts: the companion when it is out, else a stage cloud, else a home cloud, else any other on screen. */
  function actor(): HTMLElement | null {
    // Out, or just leaving for a seat: its home's box is already empty, so it is the one to answer.
    const companion = root.querySelector<HTMLElement>(`.d-companion[data-on] ${CLOUD}`);
    if (companion) return companion;
    let best: HTMLElement | null = null;
    let bestRank = -1;
    for (const cloud of root.querySelectorAll<HTMLElement>(CLOUD)) {
      if (!isSeen(cloud) || !inViewport(cloud.getBoundingClientRect())) continue;
      const rank = cloud.closest(STAGE) ? 2 : cloud.closest(HOME) ? 1 : 0;
      if (rank > bestRank) {
        best = cloud;
        bestRank = rank;
      }
    }
    return best;
  }

  function act(cloud: HTMLElement, kind: CloudReaction) {
    const timer = worn.get(cloud);
    if (timer !== undefined) window.clearTimeout(timer);
    if (cloud.hasAttribute("data-mood")) {
      // A second nod during the first has to start from the top: take the mood off and let the browser see it gone.
      cloud.removeAttribute("data-mood");
      void cloud.offsetWidth;
    }
    cloud.setAttribute("data-mood", kind);
    worn.set(
      cloud,
      window.setTimeout(() => {
        worn.delete(cloud);
        cloud.removeAttribute("data-mood");
      }, HOLD[kind]),
    );
  }

  function onReact(event: Event) {
    const kind: unknown = (event as CustomEvent<unknown>).detail;
    if (!isReaction(kind)) return;
    // Behind an open sheet the page is inert, and so is the cloud.
    if (behindSheet(root)) return;
    if (again !== null) window.clearTimeout(again);
    again = null;
    const cloud = actor();
    if (cloud) {
      act(cloud, kind);
      return;
    }
    // A first tap on a page can come a moment before the companion has reached its seat.
    again = window.setTimeout(() => {
      again = null;
      const late = behindSheet(root) ? null : actor();
      if (late) act(late, kind);
    }, AGAIN_MS);
  }

  window.addEventListener(CLOUD_REACT_EVENT, onReact);
  return () => {
    window.removeEventListener(CLOUD_REACT_EVENT, onReact);
    if (again !== null) window.clearTimeout(again);
    again = null;
    for (const [cloud, timer] of worn) {
      window.clearTimeout(timer);
      cloud.removeAttribute("data-mood");
    }
    worn.clear();
  };
}
