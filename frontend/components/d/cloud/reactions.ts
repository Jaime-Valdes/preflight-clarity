/*
 * How a cloud answers what the visitor does (docs/ui-d-cinematic.md, "Reactions"). D's components
 * call cloudReact(kind) in ./react; every other control gets a generic tap from one delegated
 * listener here; and a page that has settled gets a small greeting. One cloud on screen wears the
 * matching face (data-face) and motion (data-mood) for a moment; the acting itself is CSS on those
 * two attributes (app/d/d-cloud.css).
 *
 * A reaction is its kind and nothing else: which cloud acts depends only on which clouds are on
 * screen, and the acting is the same every time, so "noted" looks identical whatever it was for and
 * in both directions. The listener reads only whether the clicked element is a control, whether it
 * is one of the excluded ones, whether a link goes to another page, and whether it is one of the
 * compare tray's buttons: never text, labels or anything about a flight.
 *
 *   kind      source                                     face    motion   held     rank
 *   greet     a page has settled, nothing done yet        bright  lift     900 ms   0
 *   tap       any other control (delegated, rate-capped)  bright  lift     700 ms   1
 *   curious   "Why?" opened                               bright  tilt     1000 ms  2
 *   nod       a pick or a withdrawal                      none    nod      340 ms   3
 *   noted     compare added or removed (also the tray's   beam    nod      800 ms   3
 *             chip removals and Clear), a priority
 *             ranked or un-ranked, "Start over"
 *   glad      the setup answered                          beam    none     900 ms   4
 *
 * One reaction per cloud at a time: a lower rank than the one worn is dropped (never queued), an
 * equal or higher one replaces it, except that a tap during a tap extends the hold (to 1.8 s after
 * that face began at most) and a nod during a nod's first 600 ms extends it with no second dip. A
 * new tap face starts at most once every 1.2 s, and not within 0.6 s of the last one ending. Never
 * for the sign-up card, the Flight Day Pack card and the general feedback, the footer, a sheet opener, anything in a dialog, a disabled control, a
 * form's submit button, a link to another page or a hash link; nothing behind an open sheet or
 * while a page transition runs. Under reduced motion the faces still change and nothing moves.
 */

import { CLOUD, HOME, STAGE, behindSheet, inViewport, isSeen, transitionRunning, whenTransitionEnds } from "./dom";
import { CLOUD_REACT_EVENT, type CloudReaction } from "./react";

type Kind = CloudReaction | "tap" | "greet";
type Face = "bright" | "beam";
type Mood = "lift" | "nod" | "curious";

interface Act {
  face: Face | null;
  mood: Mood | null;
  /** How long the reaction is worn (ms). */
  hold: number;
  /** How long its motion's mark stays on (ms): the keyframes and a little to spare, or the whole hold for the tilt. */
  moodHold: number;
  rank: number;
}

const ACTS: Record<Kind, Act> = {
  greet: { face: "bright", mood: "lift", hold: 900, moodHold: 420, rank: 0 },
  tap: { face: "bright", mood: "lift", hold: 700, moodHold: 420, rank: 1 },
  curious: { face: "bright", mood: "curious", hold: 1000, moodHold: 1000, rank: 2 },
  nod: { face: null, mood: "nod", hold: 340, moodHold: 340, rank: 3 },
  noted: { face: "beam", mood: "nod", hold: 800, moodHold: 340, rank: 3 },
  glad: { face: "beam", mood: null, hold: 900, moodHold: 0, rank: 4 },
};

/** A tap face is held at most this long after it began, however many taps extend it. */
const TAP_MAX_MS = 1800;
/** After a tap face ends, the next one waits at least this long. */
const TAP_REST_MS = 600;
/** Two tap faces start at least this far apart. */
const TAP_GAP_MS = 1200;
/** A nod asked for this soon after the last dip began extends it instead: at most one dip per 600 ms. */
const NOD_AGAIN_MS = 600;
/** With no cloud on screen yet (the companion is on its way to a first seat), one more try this much later. */
const AGAIN_MS = 200;
/** The greeting looks this often whether the page has settled, for this long at most, and plays this long after it has. */
const GREET_POLL_MS = 100;
const GREET_WAIT_MS = 4000;
const GREET_DELAY_MS = 200;

/** What counts as a control for the generic tap. */
const CONTROL =
  'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="switch"], ' +
  '[role="checkbox"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], ' +
  '[role="menuitemcheckbox"], input[type="checkbox"], input[type="radio"]';
/**
 * What never gets a reaction (shared markup pinned in scripts/d-hooks.mjs): the sign-up card, the
 * footer, sheet openers, dialogs, disabled controls, the skip link and form submit buttons. And the
 * Flight Day Pack's offer card and the general feedback (docs/FLIGHT_DAY_PACK.md): a price test, so
 * "Add" and "No thanks" must get exactly the same from the cloud, which is nothing.
 */
const NEVER =
  '[aria-labelledby^="c-interest-"], [data-theme="d"] > footer, [aria-haspopup="dialog"], [data-d-offer], [data-d-feedback], ' +
  '[role="dialog"], :disabled, [aria-disabled="true"], a[href^="#"], ' +
  'form button:not([type="button"]):not([type="reset"]), form input[type="submit"]';
/** The compare tray's buttons: a chip's remove and "Clear" change the compare list, so they get "noted". */
const TRAY_CHANGE = "#c-compare-tray [data-tray-remove], #c-compare-tray button:not([data-tray-remove])";

export interface Reactions {
  /** A page arrived at this pathname (or it is the first): worn faces end, and the greeting waits for the page to settle. */
  arrived(pathname: string): void;
  stop(): void;
}

/** A reaction a cloud is wearing. */
interface Worn {
  cloud: HTMLElement;
  kind: Kind;
  rank: number;
  startedAt: number;
  /** When its dip began, for the nod-again rule. */
  dipAt: number;
  faceTimer: number | undefined;
  moodTimer: number | undefined;
}

/** The running instance's hand-over, for companion.ts (one instance at a time: the /d layout's). */
let handOver: ((from: HTMLElement, to: HTMLElement) => void) | null = null;

/**
 * The companion lifted out of its home cloud or appeared elsewhere (from: the home, to: the
 * companion's cloud), or it sat back down in it (the other way round): the reaction worn goes with
 * it, with what is left of its hold. A dip or lift already playing is not played again; a tilt
 * carries on. Nothing happens when no reaction is worn.
 */
export function handOverFace(from: HTMLElement | null, to: HTMLElement | null): void {
  if (from && to && from !== to) handOver?.(from, to);
}

function isReaction(value: unknown): value is CloudReaction {
  return value === "noted" || value === "nod" || value === "curious" || value === "glad";
}

/** Starts the reactions inside `root` (the /d layout). `still` (reduced motion): faces only, never a motion. */
export function startReactions(root: HTMLElement, options: { still: boolean }): Reactions {
  const { still } = options;
  const worn = new Map<HTMLElement, Worn>();
  let again: number | undefined;
  let greetTimer: number | undefined;
  /** The greeting waiting for a page transition to end (the cancel). */
  let greetWait: (() => void) | undefined;
  /** The visitor did something since the page arrived: no greeting. */
  let acted = false;
  let lastPath: string | null = null;
  let lastTapStart = Number.NEGATIVE_INFINITY;
  let tapRestUntil = Number.NEGATIVE_INFINITY;
  /** The delegated listener's decisions waiting for their frame, then for their task. */
  const frames = new Set<number>();
  const tasks = new Set<number>();

  const held = () => behindSheet(root) || transitionRunning();

  /** The cloud that acts: the companion when it is out and on screen, else a stage cloud, else a home cloud, else any other on screen. Never the loader's. */
  function actor(): HTMLElement | null {
    const companion = root.querySelector<HTMLElement>(`.d-companion[data-on] ${CLOUD}`);
    if (companion && inViewport(companion.getBoundingClientRect())) return companion;
    let best: HTMLElement | null = null;
    let bestRank = -1;
    for (const cloud of root.querySelectorAll<HTMLElement>(CLOUD)) {
      if (cloud.closest(".d-companion") || cloud.closest('[aria-busy="true"]')) continue;
      if (!isSeen(cloud) || !inViewport(cloud.getBoundingClientRect())) continue;
      const rank = cloud.matches(STAGE) ? 2 : cloud.matches(HOME) ? 1 : 0;
      if (rank > bestRank) {
        best = cloud;
        bestRank = rank;
      }
    }
    return best;
  }

  function setFace(cloud: HTMLElement, face: Face | null) {
    if ((cloud.getAttribute("data-face") ?? null) === face) return;
    if (face) cloud.setAttribute("data-face", face);
    else cloud.removeAttribute("data-face");
  }

  /** `restart`: a motion already on is taken off and the browser made to see it gone, so it plays from the top. */
  function setMood(cloud: HTMLElement, mood: Mood | null, restart = false) {
    if (still) return;
    const now = cloud.getAttribute("data-mood");
    if (now !== null && (restart || now !== mood)) {
      cloud.removeAttribute("data-mood");
      if (mood) void cloud.offsetWidth;
    }
    if (mood && cloud.getAttribute("data-mood") !== mood) cloud.setAttribute("data-mood", mood);
  }

  /** Takes a reaction off at once, its marks with it. */
  function takeOff(w: Worn) {
    window.clearTimeout(w.faceTimer);
    window.clearTimeout(w.moodTimer);
    if (worn.get(w.cloud) === w) worn.delete(w.cloud);
    setMood(w.cloud, null);
    setFace(w.cloud, null);
  }

  function hold(w: Worn, until: number) {
    window.clearTimeout(w.faceTimer);
    w.faceTimer = window.setTimeout(
      () => {
        if (worn.get(w.cloud) !== w) return;
        takeOff(w);
        if (w.kind === "tap") tapRestUntil = performance.now() + TAP_REST_MS;
      },
      Math.max(0, until - performance.now()),
    );
  }

  function play(cloud: HTMLElement, kind: Kind) {
    const act = ACTS[kind];
    const now = performance.now();
    const cur = worn.get(cloud);
    if (cur && cur.rank > act.rank) return;
    if (kind === "tap") {
      if (cur?.kind === "tap") {
        hold(cur, Math.min(now + act.hold, cur.startedAt + TAP_MAX_MS));
        return;
      }
      if (now < tapRestUntil || now - lastTapStart < TAP_GAP_MS) return;
      lastTapStart = now;
    }
    // A nod during a nod's first 600 ms never dips again, so toggling fast never bobs: the same kind is
    // held longer; the other nod (a pick during "noted", or the reverse) takes over the face and lets
    // the dip under way finish.
    const dipping = cur !== undefined && act.mood === "nod" && ACTS[cur.kind].mood === "nod" && now - cur.dipAt < NOD_AGAIN_MS;
    if (dipping && cur.kind === kind) {
      hold(cur, now + act.hold);
      return;
    }
    if (cur) {
      window.clearTimeout(cur.faceTimer);
      window.clearTimeout(cur.moodTimer);
      worn.delete(cloud);
    }
    const dipAt = dipping ? cur.dipAt : now;
    const w: Worn = { cloud, kind, rank: act.rank, startedAt: now, dipAt, faceTimer: undefined, moodTimer: undefined };
    worn.set(cloud, w);
    // The face and the motion in one task: one record each for session replay.
    setFace(cloud, act.face);
    if (act.mood && !dipping) setMood(cloud, act.mood, true);
    else if (!act.mood) setMood(cloud, null);
    if (act.mood) w.moodTimer = window.setTimeout(() => setMood(w.cloud, null), Math.max(0, dipAt + act.moodHold - now));
    hold(w, now + act.hold);
  }

  function request(kind: Kind) {
    if (kind !== "greet") {
      acted = true;
      window.clearTimeout(greetTimer);
      greetTimer = undefined;
    }
    if (held()) return;
    window.clearTimeout(again);
    again = undefined;
    const cloud = actor();
    if (cloud) {
      play(cloud, kind);
      return;
    }
    // A tap or a greeting with no cloud on screen is dropped; a component's reaction tries once more (the companion may be on its way).
    if (kind === "tap" || kind === "greet") return;
    again = window.setTimeout(() => {
      again = undefined;
      const late = held() ? null : actor();
      if (late) play(late, kind);
    }, AGAIN_MS);
  }

  /** A link to another page: the page transition takes over, and the cloud holds still for it. */
  function movesPage(control: Element): boolean {
    if (!(control instanceof HTMLAnchorElement) || !control.href) return false;
    try {
      const to = new URL(control.href, window.location.href);
      return to.origin !== window.location.origin || to.pathname !== window.location.pathname;
    } catch {
      return true;
    }
  }

  /**
   * Decides a frame and a task later, after every click handler and every one-frame-later
   * cloudReact (the compare table's removal answers a frame late): a component's own reaction is
   * then already on the cloud and outranks the tap, so a click changes the face once, never
   * bright and then beam.
   */
  function soon(kind: Kind) {
    const frame = window.requestAnimationFrame(() => {
      frames.delete(frame);
      const task = window.setTimeout(() => {
        tasks.delete(task);
        request(kind);
      }, 0);
      tasks.add(task);
    });
    frames.add(frame);
  }

  function onClick(event: MouseEvent) {
    acted = true;
    window.clearTimeout(greetTimer);
    greetTimer = undefined;
    if (held()) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(CONTROL);
    if (!control || !root.contains(control) || control.closest(NEVER) || movesPage(control)) return;
    soon(control.matches(TRAY_CHANGE) ? "noted" : "tap");
  }

  /** A select or a range slider answers on change, as a tap. */
  function onChange(event: Event) {
    const el = event.target;
    if (!(el instanceof HTMLSelectElement) && !(el instanceof HTMLInputElement && el.type === "range")) return;
    if (!root.contains(el) || el.closest(NEVER) || held()) return;
    acted = true;
    soon("tap");
  }

  function onReact(event: Event) {
    const kind: unknown = (event as CustomEvent<unknown>).detail;
    if (isReaction(kind)) request(kind);
  }

  /** The cloud, or a box it sits in, is still arriving (the home hero's drift, a card's entrance). */
  function settling(cloud: HTMLElement): boolean {
    for (let node = cloud.parentElement; node && node !== root; node = node.parentElement) {
      for (const animation of node.getAnimations()) {
        if (animation.playState !== "running") continue;
        const end = animation.effect?.getComputedTiming().endTime;
        if (typeof end === "number" && Number.isFinite(end)) return true;
      }
    }
    return false;
  }

  const mine = (from: HTMLElement, to: HTMLElement) => {
    const w = worn.get(from);
    if (!w) return;
    worn.delete(from);
    const mood = from.getAttribute("data-mood");
    setMood(from, null);
    setFace(from, null);
    const other = worn.get(to);
    if (other) takeOff(other);
    w.cloud = to;
    worn.set(to, w);
    setFace(to, ACTS[w.kind].face);
    if (mood === "curious") setMood(to, "curious");
  };
  handOver = mine;

  window.addEventListener(CLOUD_REACT_EVENT, onReact);
  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("change", onChange, { capture: true, passive: true });

  return {
    arrived(pathname) {
      if (pathname === lastPath) return;
      const first = lastPath === null;
      lastPath = pathname;
      acted = false;
      // The page is being replaced: every worn reaction ends at once, on hidden (kept-alive) pages too.
      if (!first) for (const w of [...worn.values()]) takeOff(w);
      window.clearTimeout(again);
      again = undefined;
      window.clearTimeout(greetTimer);
      greetWait?.();
      greetWait = undefined;
      const began = performance.now();
      const check = () => {
        greetTimer = undefined;
        greetWait = undefined;
        if (acted || performance.now() - began > GREET_WAIT_MS) return;
        // A page transition: wait for its end, then look again as usual (100 ms later), so the greeting comes about
        // 300 ms after the end and never under the transition's last frame.
        if (transitionRunning()) {
          greetWait = whenTransitionEnds(() => {
            greetWait = undefined;
            greetTimer = window.setTimeout(check, GREET_POLL_MS);
          });
          return;
        }
        const cloud = behindSheet(root) ? null : actor();
        if (!cloud || settling(cloud)) {
          greetTimer = window.setTimeout(check, GREET_POLL_MS);
          return;
        }
        greetTimer = window.setTimeout(() => {
          greetTimer = undefined;
          if (!acted) request("greet");
        }, GREET_DELAY_MS);
      };
      greetTimer = window.setTimeout(check, GREET_POLL_MS);
    },
    stop() {
      window.removeEventListener(CLOUD_REACT_EVENT, onReact);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("change", onChange, { capture: true });
      if (handOver === mine) handOver = null;
      window.clearTimeout(again);
      window.clearTimeout(greetTimer);
      greetWait?.();
      for (const frame of frames) window.cancelAnimationFrame(frame);
      for (const task of tasks) window.clearTimeout(task);
      frames.clear();
      tasks.clear();
      for (const w of [...worn.values()]) takeOff(w);
      worn.clear();
    },
  };
}
