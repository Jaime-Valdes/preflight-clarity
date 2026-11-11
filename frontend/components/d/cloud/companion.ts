/*
 * The companion (docs/ui-d-cinematic.md, "Where it lives"): the one roaming cloud. It rests in the
 * page's home cloud (or nowhere, on a page without one) and comes to sit on the top edge of the
 * card the visitor attends to:
 *
 *   mouse     the seat under the pointer, once it has stayed there 140 ms; the cloud then slides
 *             along the edge under the pointer
 *   touch     the seat crossing a line 40 % down the screen, once it has stayed there 140 ms (so
 *             a fling passes over), or a seat tapped in the last 4 s
 *   keyboard  the seat that holds focus
 *
 * It never arrives first: until the visitor moves, scrolls, taps or tabs on a page it stays home.
 * And it treats every seat alike: where it goes depends on which element the visitor's attention
 * is on and on that element's box, never on what the element shows. This file reads positions,
 * boxes and three attributes (dom.ts) and nothing else.
 *
 * The cloud is one absolutely placed element in the layout root, moved with `translate` in page
 * coordinates, so it scrolls with its card without a scroll handler; a CSS transition does the
 * gliding (app/d/d-cloud.css). Writes happen when something changes, at most once every MOVE_MS.
 */

import { MOVE_MS, nudgeAttention, watchAttention, type Pointer } from "./attention";
import { AWAY, HOME, SEAT, STAGE, cloudOf, isRendered } from "./dom";

/** A seat has to hold the visitor's attention this long before the cloud moves to it. */
const DWELL_MS = 140;
/** A tapped seat keeps the cloud this long, whatever the reading line says. */
const TAP_MS = 4000;
/** The glide between places; the same number as the transition in d-cloud.css. */
const GLIDE_MS = 420;
/** The cloud's centre stays this far (px) inside the two ends of a seat's top edge. */
const INSET = 40;
/** Where along the edge it sits when no pointer says otherwise: right of centre. */
const ALONG = 0.72;
/** How much of its base (px) rests over the card's top padding. */
const OVERLAP = 6;
/** The lower edge of the drawn body, outline included, as a share of the cloud's width. */
const BASE = 76 / 120;
/** The reading line, in percent of the viewport's height from the top. */
const READING_LINE = 40;
/** A stage cloud this much on screen keeps the companion away. */
const STAGE_SHARE = 0.3;
/** The home cloud counts as back in view when this much of it is on screen. */
const HOME_SHARE = 0.5;
/** On a page without a home the cloud appears from this far (px) below its place. */
const RISE = 10;

const BLINK: Keyframe[] = [
  { transform: "scaleY(1)" },
  { transform: "scaleY(0.1)", offset: 0.35 },
  { transform: "scaleY(0.1)", offset: 0.45 },
  { transform: "scaleY(1)" },
];

/** A place the cloud can be: on a seat, or in its home (hidden, on a page without one). */
type Spot = Element | "home";

export interface Companion {
  /** The address changed: straight back home, and nothing more until the visitor acts on the new page. */
  pageChanged(): void;
  stop(): void;
}

export function startCompanion(root: HTMLElement, host: HTMLElement): Companion {
  // ── What is on the page ────────────────────────────────────────────────────
  const seats = new Set<Element>();
  const stages = new Set<Element>();
  let home: HTMLElement | null = null;
  /** Seats crossing the reading line right now. */
  const onLine = new Set<Element>();
  /** How much of a stage, the home or a seat is on screen, 0 to 1. */
  const shares = new WeakMap<Element, number>();
  /** Whether a marked element is, or sits inside, something sticky or fixed: such a thing is never a seat. */
  let stuck = new WeakMap<Element, boolean>();

  // ── What the visitor has done on this page ─────────────────────────────────
  let pointer: Pointer | null = null;
  let mode: "mouse" | "touch" = window.matchMedia("(hover: hover) and (pointer: fine)").matches ? "mouse" : "touch";
  /** False on a fresh page: the cloud stays home until the visitor does something. */
  let armed = false;
  /** The keyboard is driving. */
  let keys = false;
  let hover: Element | null = null;
  let focused: Element | null = null;
  let tapped: Element | null = null;

  // ── Where the cloud is ─────────────────────────────────────────────────────
  let state: "home" | "out" | "returning" = "home";
  let seat: Element | null = null;
  /** Its place along the seat's edge in px from the seat's left; null is the usual place. */
  let along: number | null = null;
  let pose = { x: Number.NaN, y: Number.NaN, scale: 1 };
  /** The place it will move to if the visitor's attention stays there. */
  let pending: Spot | null = null;

  let dwellTimer: number | null = null;
  let tapTimer: number | null = null;
  let returnTimer: number | null = null;
  let settleTimer: number | null = null;
  let arriveTimer: number | null = null;
  let measureTimer: number | null = null;

  const clear = (timer: number | null) => {
    if (timer !== null) window.clearTimeout(timer);
    return null;
  };

  // ── Reading the page ───────────────────────────────────────────────────────

  function isStuck(el: Element): boolean {
    let known = stuck.get(el);
    if (known === undefined) {
      known = false;
      for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === "sticky" || position === "fixed") {
          known = true;
          break;
        }
      }
      stuck.set(el, known);
    }
    return known;
  }

  const usable = (el: Element) => isRendered(el) && !isStuck(el);

  function seatAt(target: Element | null): Element | null {
    const el = target?.closest(SEAT);
    return el && root.contains(el) && !isStuck(el) ? el : null;
  }

  function stageOn(): boolean {
    for (const stage of stages) if ((shares.get(stage) ?? 0) >= STAGE_SHARE) return true;
    return false;
  }

  const homeOn = () => home !== null && (shares.get(home) ?? 0) >= HOME_SHARE;

  /** The seat on the reading line. Two side by side: the one that reached the line last, then the first in the page. */
  function lineSeat(): Element | null {
    let best: Element | null = null;
    let bestTop = Number.NEGATIVE_INFINITY;
    for (const el of onLine) {
      if (!usable(el)) continue;
      const top = el.getBoundingClientRect().top;
      const earlier = best !== null && top === bestTop && (best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
      if (top > bestTop || earlier) {
        best = el;
        bestTop = top;
      }
    }
    return best;
  }

  const lineWatch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onLine.add(entry.target);
        else onLine.delete(entry.target);
      }
      review();
    },
    // A band a fraction of a percent tall: a line, for an observer that needs an area.
    { rootMargin: `-${READING_LINE}% 0px -${100 - READING_LINE - 0.1}% 0px` },
  );

  const viewWatch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) shares.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      review();
    },
    { threshold: [0, STAGE_SHARE, HOME_SHARE] },
  );

  function sync(known: Set<Element>, found: Set<Element>, add: (el: Element) => void, drop: (el: Element) => void) {
    for (const el of known) {
      if (found.has(el)) continue;
      known.delete(el);
      drop(el);
    }
    for (const el of found) {
      if (known.has(el)) continue;
      known.add(el);
      add(el);
    }
  }

  /** Finds the seats, stages and home of the page on screen. Pages kept alive but hidden have none. */
  function scan() {
    const foundSeats = new Set<Element>();
    for (const el of root.querySelectorAll(SEAT)) if (usable(el)) foundSeats.add(el);
    sync(
      seats,
      foundSeats,
      (el) => {
        lineWatch.observe(el);
        viewWatch.observe(el);
      },
      (el) => {
        lineWatch.unobserve(el);
        viewWatch.unobserve(el);
        onLine.delete(el);
        shares.delete(el);
      },
    );

    const foundStages = new Set<Element>();
    for (const el of root.querySelectorAll(STAGE)) {
      const cloud = cloudOf(el) ?? el;
      if (isRendered(cloud)) foundStages.add(cloud);
    }
    sync(
      stages,
      foundStages,
      (el) => viewWatch.observe(el),
      (el) => {
        viewWatch.unobserve(el);
        shares.delete(el);
      },
    );

    let foundHome: HTMLElement | null = null;
    for (const el of root.querySelectorAll<HTMLElement>(HOME)) {
      const cloud = cloudOf(el) ?? el;
      if (!isRendered(cloud)) continue;
      foundHome = cloud;
      break;
    }
    if (foundHome !== home) {
      if (home) {
        viewWatch.unobserve(home);
        shares.delete(home);
        home.removeAttribute(AWAY);
      }
      home = foundHome;
      if (home) {
        viewWatch.observe(home);
        // The cloud is out already: the new home's box is empty until it returns.
        if (state !== "home") home.setAttribute(AWAY, "");
      }
    }
  }

  // ── Deciding where to be ───────────────────────────────────────────────────

  /** The place the visitor's attention asks for, or null to stay put. */
  function choose(): Spot | null {
    if (!armed || stageOn()) return "home";
    if (tapped && usable(tapped)) return tapped;
    if (keys) return focused && usable(focused) ? focused : null;
    if (mode === "mouse") return hover && usable(hover) ? hover : null;
    return lineSeat() ?? (homeOn() ? "home" : null);
  }

  /** Staying put means staying on the seat, unless it is gone, or has left the screen while the home is back on it. */
  function settled(spot: Spot | null): Spot {
    if (spot !== null) return spot;
    if (!seat || !usable(seat)) return "home";
    // A seat not measured yet counts as on screen.
    if (homeOn() && (shares.get(seat) ?? 1) <= 0) return "home";
    return seat;
  }

  function review(now = false) {
    // While a sheet is open the page behind it is inert, and the companion does nothing.
    if (root.inert) return;
    const want = settled(choose());
    const here: Spot = state === "out" && seat ? seat : "home";
    if (want === here) {
      pending = null;
      dwellTimer = clear(dwellTimer);
      return;
    }
    if (now) {
      pending = null;
      dwellTimer = clear(dwellTimer);
      go(want);
      return;
    }
    if (pending === want && dwellTimer !== null) return;
    pending = want;
    dwellTimer = clear(dwellTimer);
    dwellTimer = window.setTimeout(() => {
      dwellTimer = null;
      const held = pending;
      pending = null;
      if (held === null || root.inert) return;
      if (settled(choose()) === held) go(held);
      else review();
    }, DWELL_MS);
  }

  // ── Being there ────────────────────────────────────────────────────────────

  /** A box in the layout root's coordinates: the ones `translate` on the companion uses. */
  function boxIn(el: Element) {
    const frame = root.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width };
  }

  /** The cloud's place on a seat: on the top edge, its base a little over the card, the rest above it. */
  function perch(el: Element) {
    const frame = root.getBoundingClientRect();
    const card = el.getBoundingClientRect();
    const width = host.offsetWidth;
    // Under a mouse it slides along the edge with the pointer; once the pointer leaves the card it keeps its place.
    if (mode === "mouse" && !keys && pointer?.known && hover === el) along = pointer.x - card.left;
    const wanted = card.left + (along ?? card.width * ALONG);
    const centre = card.width > INSET * 2 ? Math.min(Math.max(wanted, card.left + INSET), card.right - INSET) : card.left + card.width / 2;
    return { x: centre - width / 2 - frame.left, y: card.top + OVERLAP - BASE * width - frame.top };
  }

  function place(x: number, y: number, scale = 1) {
    const next = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, scale: Math.round(scale * 1000) / 1000 };
    if (next.x === pose.x && next.y === pose.y && next.scale === pose.scale) return;
    if (next.x !== pose.x || next.y !== pose.y) host.style.translate = `${next.x}px ${next.y}px`;
    if (next.scale !== pose.scale) host.style.scale = next.scale === 1 ? "" : String(next.scale);
    pose = next;
    // When it has arrived, a mouse resting on the page is in a different direction for the eyes.
    arriveTimer = clear(arriveTimer);
    arriveTimer = window.setTimeout(() => {
      arriveTimer = null;
      nudgeAttention();
    }, GLIDE_MS + 40);
  }

  /** Changes made in `change` take effect at once, without the glide. */
  function jump(change: () => void) {
    host.style.transition = "none";
    change();
    void host.offsetWidth;
    host.style.transition = "";
  }

  function copyLook(from: HTMLElement | null, to: HTMLElement | null) {
    if (!from || !to) return;
    for (const name of ["--gx", "--gy"]) {
      const value = from.style.getPropertyValue(name);
      if (value) to.style.setProperty(name, value);
      else to.style.removeProperty(name);
    }
  }

  function blink() {
    for (const part of host.querySelectorAll(".d-cloud-blinks")) part.animate?.(BLINK, { duration: 200, delay: GLIDE_MS * 0.7 });
  }

  /** Measures the seat again and moves if it has moved: the page grew, the pointer slid along, an entrance finished. */
  function follow() {
    if (root.inert) return;
    if (state === "returning" && home && isRendered(home)) {
      const to = boxIn(home);
      place(to.x, to.y, to.width / host.offsetWidth);
      return;
    }
    if (state !== "out" || !seat) return;
    if (!usable(seat)) {
      review(true);
      return;
    }
    const to = perch(seat);
    place(to.x, to.y);
  }

  function goSeat(el: Element) {
    returnTimer = clear(returnTimer);
    const fromHome = state === "home";
    if (el !== seat) along = null;
    seat = el;
    state = "out";
    const to = perch(el);
    if (fromHome) {
      const start = home && isRendered(home) ? home : null;
      jump(() => {
        if (start) {
          // It lifts out of the home cloud's box: same place, same size, same look, and the box empties in the same frame.
          const from = boxIn(start);
          place(from.x, from.y, from.width / host.offsetWidth);
          copyLook(start, cloudOf(host));
          start.setAttribute(AWAY, "");
          host.setAttribute("data-on", "");
        } else {
          place(to.x, to.y + RISE);
        }
      });
      host.setAttribute("data-on", "");
    }
    place(to.x, to.y);
    blink();
    // Once more when the glide is over: a card that was still arriving has settled by then.
    settleTimer = clear(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      follow();
    }, GLIDE_MS + 80);
  }

  /** Back in the home cloud's box (or gone, without one). The inline cloud shows again in the frame the roaming one leaves. */
  function land(atOnce: boolean) {
    returnTimer = clear(returnTimer);
    settleTimer = clear(settleTimer);
    state = "home";
    seat = null;
    along = null;
    const swap = () => {
      host.removeAttribute("data-on");
      for (const el of root.querySelectorAll<HTMLElement>(`[${AWAY}]`)) {
        if (el === home) copyLook(cloudOf(host), el);
        el.removeAttribute(AWAY);
      }
    };
    if (atOnce) jump(swap);
    else swap();
  }

  function goHome() {
    if (state !== "out") return;
    seat = null;
    along = null;
    settleTimer = clear(settleTimer);
    if (!home || !isRendered(home)) {
      // No home on this page: it fades out where it is.
      land(false);
      return;
    }
    home.setAttribute(AWAY, "");
    const to = boxIn(home);
    place(to.x, to.y, to.width / host.offsetWidth);
    state = "returning";
    returnTimer = window.setTimeout(() => land(true), GLIDE_MS + 30);
  }

  function go(spot: Spot) {
    if (spot === "home") goHome();
    else goSeat(spot);
  }

  /** The page's layout may have changed: look again at what is on it and where the seat is. */
  function measureSoon() {
    if (measureTimer !== null) return;
    measureTimer = window.setTimeout(() => {
      measureTimer = null;
      scan();
      follow();
      review();
    }, MOVE_MS);
  }

  // ── Listening ──────────────────────────────────────────────────────────────

  const unwatch = watchAttention({
    over(target) {
      const next = seatAt(target);
      if (next === hover) return;
      hover = next;
      if (mode === "mouse") review();
    },
    move(p, real) {
      pointer = p;
      if (root.inert || p.kind !== "mouse") return;
      if (real) {
        const woke = !armed || mode !== "mouse" || keys;
        mode = "mouse";
        keys = false;
        armed = true;
        if (woke) {
          hover = seatAt(p.target);
          review();
        }
      }
      if (state === "out" && seat !== null && seat === hover) follow();
    },
    touch(down, p) {
      pointer = p;
      if (root.inert || !down) return;
      mode = "touch";
      keys = false;
      armed = true;
      // New cards may have arrived since the last look; the reading line has to know them before the scroll.
      scan();
      review();
    },
    tap(target, p) {
      pointer = p;
      if (root.inert) return;
      const woke = !armed;
      armed = true;
      // Under a mouse the tapped seat is already the one being pointed at.
      if (p.kind !== "touch") {
        if (woke) review();
        return;
      }
      const el = seatAt(target);
      if (!el) return;
      tapped = el;
      tapTimer = clear(tapTimer);
      tapTimer = window.setTimeout(() => {
        tapTimer = null;
        tapped = null;
        review();
      }, TAP_MS);
      review(true);
    },
    focus(target, byKeys) {
      if (root.inert) return;
      keys = byKeys;
      focused = byKeys ? seatAt(target) : null;
      if (!byKeys) return;
      armed = true;
      review(true);
    },
    stir() {
      if (root.inert || armed) return;
      armed = true;
      review();
    },
    resize() {
      // A sticky column at one width is an ordinary card at another.
      stuck = new WeakMap();
      measureSoon();
    },
  });

  // The page's height changes when cards arrive, open or leave: everything below them moves.
  const main = root.querySelector("main");
  const sizeWatch = typeof ResizeObserver === "function" && main ? new ResizeObserver(measureSoon) : null;
  if (sizeWatch && main) sizeWatch.observe(main);
  scan();

  return {
    pageChanged() {
      armed = false;
      keys = false;
      hover = null;
      focused = null;
      tapped = null;
      pending = null;
      dwellTimer = clear(dwellTimer);
      tapTimer = clear(tapTimer);
      if (state !== "home") land(true);
      scan();
    },
    stop() {
      unwatch();
      lineWatch.disconnect();
      viewWatch.disconnect();
      sizeWatch?.disconnect();
      dwellTimer = clear(dwellTimer);
      tapTimer = clear(tapTimer);
      measureTimer = clear(measureTimer);
      arriveTimer = clear(arriveTimer);
      if (state !== "home") land(true);
      home?.removeAttribute(AWAY);
      host.style.translate = "";
      host.style.scale = "";
    },
  };
}
