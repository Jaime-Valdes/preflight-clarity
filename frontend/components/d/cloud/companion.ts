/*
 * The companion (docs/ui-d-cinematic.md, "Where it lives"): the one roaming cloud. It rests in the
 * page's home cloud (or nowhere, on a page without one) and comes to sit on the top edge of the
 * card the visitor attends to:
 *
 *   mouse     the seat under the pointer, once it has stayed there 140 ms; the cloud then slides
 *             along the edge under the pointer. As on touch, when that seat's top edge has
 *             scrolled off the top of the screen it sits on the next seat whose top edge is on
 *             screen, and slides along that one
 *   touch     the seat crossing a line 40 % down the screen, once it has stayed there 140 ms (so
 *             a fling passes over), or a seat tapped in the last 4 s. When that seat's top edge
 *             has scrolled off the top of the screen the cloud sits on the next seat whose top
 *             edge is on screen instead: in the gap just below the card being read, in view
 *   keyboard  the seat that holds focus
 *
 * It never arrives first: until the visitor moves, scrolls, taps or tabs on a page it stays home.
 * And it treats every seat alike: where it goes depends on which element the visitor's attention
 * is on and on where the seats' boxes are, never on what an element shows. This file reads
 * positions, boxes and three attributes (dom.ts) and nothing else.
 *
 * The cloud is one absolutely placed element in the layout root, moved with `translate` in page
 * coordinates, so it scrolls with its card without a scroll handler; a CSS transition does the
 * gliding (app/d/d-cloud.css). What happens while the page scrolls is heard from intersection
 * observers (a seat reaches the reading line, a top edge leaves or enters the screen), never from
 * the scroll itself. Writes happen when something changes, at most once every MOVE_MS.
 */

import { MOVE_MS, nudgeAttention, watchAttention, type Pointer } from "./attention";
import { AWAY, HOME, SEAT, STAGE, behindSheet, cloudOf, isRendered, lookOf, writeLook } from "./dom";

/** A seat has to hold the visitor's attention this long before the cloud moves to it. */
const DWELL_MS = 140;
/** A tapped seat keeps the cloud this long, whatever the reading line says. */
const TAP_MS = 4000;
/**
 * The glide between places and the fade out: read once from the companion's stylesheet
 * (--d-companion-glide and --d-companion-fade in app/d/d-cloud.css, which its transitions and
 * landing blink use), these numbers only if it has not arrived.
 */
const GLIDE_MS = 420;
const FADE_MS = 160;
/** The cloud's centre stays this far (px) inside the two ends of a seat's top edge. */
const INSET = 40;
/** Where along the edge it sits when no pointer says otherwise: right of centre. */
const ALONG = 0.72;
/** How much of its base (px) rests over the card's top padding. */
const OVERLAP = 6;
/** The lower edge of the drawn body, outline included, as a share of the cloud's width. */
const BASE = 76 / 120;
/** The top of the drawn outline, as a share of the cloud's width below the top of its box. */
const CROWN = 17.2 / 120;
/** The reading line, in percent of the viewport's height from the top. */
const READING_LINE = 40;
/** This much of the outline's top (px) may go under the top of the screen before a top edge counts as gone. */
const TRIM = 2;
/** A top edge that went off the top of the screen has to come this far (px) back down before the cloud returns to it. */
const SLACK = 40;
/**
 * The observers on those two lines are set this far (px) past them, so that when one calls, the
 * edge measures past its line too. An observer rounds its band to whole pixels, and an edge it
 * reports at the line can measure half a pixel short of it: the cloud would stay, and with no
 * other card left to pass a line (the end of a list), nothing would call again.
 */
const PAST = 2;
/** How tall (percent of the viewport) the bands are that stand in for lines: an observer needs an area. */
const BAND = 0.1;
/** A seat drawn further than this (px) from where layout puts it is not just settling: it is taken where it is drawn. */
const DRIFT = 20;
/** A stage cloud this much on screen keeps the companion away. */
const STAGE_SHARE = 0.3;
/** The home cloud counts as back in view when this much of it is on screen. */
const HOME_SHARE = 0.5;
/** When it cannot lift out of its home (there is none, or it is off screen) the cloud appears from this far (px) below its place. */
const RISE = 10;
/** How long the mark for the landing blink stays on, past the blink's delay (0.7 of the glide, in d-cloud.css): its 200 ms and a little to spare. */
const BLINK_MS = 240;

/** A place the cloud can be: on a seat, or in its home (hidden, on a page without one). */
type Spot = Element | "home";
/**
 * What the visitor's attention asks for: a place; null, to stay put (nothing is attended to); or
 * "nowhere": a seat is attended to but neither its top edge nor one further down is on screen.
 */
type Want = Spot | null | "nowhere";

export interface Companion {
  /** The address changed: straight back home, and nothing more until the visitor acts on the new page. */
  pageChanged(): void;
  stop(): void;
}

/** A CSS time ("420ms", "0.42s") in milliseconds, or `fallback` when there is none. */
function timeOf(text: string, fallback: number): number {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return text.trim().endsWith("ms") ? value : value * 1000;
}

export function startCompanion(root: HTMLElement, host: HTMLElement): Companion {
  const look = getComputedStyle(host);
  const glideMs = timeOf(look.getPropertyValue("--d-companion-glide"), GLIDE_MS);
  const fadeMs = timeOf(look.getPropertyValue("--d-companion-fade"), FADE_MS);

  // ── What is on the page ────────────────────────────────────────────────────
  const seats = new Set<Element>();
  /** The seats in the order they come in the page. */
  let order: Element[] = [];
  const stages = new Set<Element>();
  let home: HTMLElement | null = null;
  /** Seats crossing the reading line right now. */
  const onLine = new Set<Element>();
  /** Seats, stages and the home with any part of them on screen. */
  const inSight = new Set<Element>();
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
  /** When the pointer came onto the seat under it. */
  let hoverSince = 0;
  /** Where the cloud sits for the seat under the pointer, as last chosen: that seat, or the next one with its top edge on screen. */
  let hoverSpot: { hover: Element; spot: Element | null } | null = null;
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
  let blinkTimer: number | null = null;
  let parkTimer: number | null = null;

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
    for (const stage of stages) if (stage.isConnected && (shares.get(stage) ?? 0) >= STAGE_SHARE) return true;
    return false;
  }

  /** The home cloud is back in view, as far as the observer last heard: time to go back to it. */
  const homeOn = () => home !== null && (shares.get(home) ?? 0) >= HOME_SHARE;

  /** All of the home cloud's box is on screen at this moment (measured): the cloud can be seen getting up from it, or sitting back down in it. */
  function homeWhole(): boolean {
    if (!home || !isRendered(home)) return false;
    const box = home.getBoundingClientRect();
    return box.height > 0 && box.top >= -1 && box.left >= -1 && box.bottom <= window.innerHeight + 1 && box.right <= window.innerWidth + 1;
  }

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

  /**
   * How far (px) the seat's top edge is below the line where the cloud's outline would start to be
   * cut: under 0 the edge is gone. Measured, one box per seat a decision looks at. The observers
   * on the two lines (watchLine) only say when to look again: a seat that jumps from wholly above
   * a line to wholly below it in one frame (focus moved, scrollIntoView, find in page) tells them
   * nothing.
   */
  const edgeRoom = (el: Element) => el.getBoundingClientRect().top - edgesFor.line + 0.5;
  const edgeShows = (el: Element) => edgeRoom(el) >= 0;

  /** The first seat further down the page whose top edge is on screen, with room for the cloud above it. */
  function seatBelow(el: Element): Element | null {
    for (let i = order.indexOf(el) + 1; i > 0 && i < order.length; i++) {
      const next = order[i];
      if (inSight.has(next) && edgeShows(next) && usable(next)) return next;
    }
    return null;
  }

  /**
   * Where the cloud sits for a seat the visitor attends to, by touch or under the mouse. On it,
   * while its top edge is on screen: the cloud is in the gap above that card. Once that edge has
   * scrolled off the top, on the next seat whose top edge is on screen: in the gap below that card.
   * Null when neither is in view. The same for every seat: nothing but where the boxes are decides it.
   */
  function stand(el: Element): Element | null {
    const room = edgeRoom(el);
    if (room >= SLACK) {
      if (edgeGone === el) edgeGone = null;
      return el;
    }
    if (room < 0) edgeGone = el;
    // Its edge is on screen but close to the top: it is the cloud's again only once it has come
    // SLACK back down, so a page nudged a few pixels back and forth does not send it back and forth.
    return edgeGone === el ? seatBelow(el) : el;
  }

  /** The attended seat whose top edge last went off the top of the screen, until it has come SLACK back down. */
  let edgeGone: Element | null = null;

  /** The seat on the reading line, and since when: a visitor who has been on one seat for a while is reading it, not flinging past. */
  let reading: { seat: Element | null; since: number } = { seat: null, since: 0 };
  const isReading = () => mode === "touch" && !keys && reading.seat !== null && performance.now() - reading.since >= DWELL_MS;
  /** The same for a mouse: it has rested on one seat for a while. */
  const isPointing = () => mode === "mouse" && !keys && hover !== null && performance.now() - hoverSince >= DWELL_MS;

  const lineWatch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onLine.add(entry.target);
        else onLine.delete(entry.target);
      }
      const now = lineSeat();
      if (now !== reading.seat) reading = { seat: now, since: performance.now() };
      review();
    },
    // A band a fraction of a percent tall: a line, for an observer that needs an area.
    { rootMargin: `-${READING_LINE}% 0px -${100 - READING_LINE - BAND}% 0px` },
  );

  const viewWatch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        shares.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        if (entry.isIntersecting) inSight.add(entry.target);
        else inSight.delete(entry.target);
      }
      review();
    },
    { threshold: [0, STAGE_SHARE, HOME_SHARE] },
  );

  /**
   * Hears a seat's top edge cross a line `y` px down the screen: the observer watches a thin band
   * that ends at the line, and a top edge passing it enters and leaves the band. Where the edge
   * then is, is measured (edgeRoom), not taken from the observer.
   */
  function watchLine(y: number): IntersectionObserver {
    const share = Math.min(Math.max((y / Math.max(window.innerHeight, 1)) * 100, BAND), 100);
    return new IntersectionObserver(
      () => {
        // The seat being read, or pointed at, has not changed; only its top edge has reached the
        // top of the screen. The cloud goes at once, while it can still be seen leaving. In a
        // fling no seat is read for long enough, and the usual wait applies.
        review(isReading() || isPointing());
      },
      // In percent, like the reading line: whatever height the browser counts as the screen, the band keeps its place in it.
      { rootMargin: `-${(share - BAND).toFixed(3)}% 0px -${(100 - share).toFixed(3)}% 0px` },
    );
  }

  let topWatch: IntersectionObserver | null = null;
  let nearWatch: IntersectionObserver | null = null;
  /** What the two lines were last worked out from. */
  let edgesFor = { line: Number.NaN, height: Number.NaN };

  /** Sets up the two lines near the top of the screen, again when the screen or the cloud has changed size. */
  function watchEdges() {
    // The cloud's outline rises this far above the edge it sits on. (Its box is 60 or 64 px wide;
    // the limit is for a page whose stylesheet has not arrived, where the box would be as wide as the page.)
    const rise = (BASE - CROWN) * Math.min(host.offsetWidth, 96) - OVERLAP;
    const line = Math.max(rise - TRIM, 1);
    const height = window.innerHeight;
    // The lines are kept as shares of the screen's height, so a phone's toolbar sliding away (a few
    // percent of it) moves them by a pixel or two: not worth starting over for. Turning the phone is.
    if (topWatch && line === edgesFor.line && Math.abs(height - edgesFor.height) <= edgesFor.height * 0.1) return;
    edgesFor = { line, height };
    topWatch?.disconnect();
    nearWatch?.disconnect();
    topWatch = watchLine(line - PAST);
    nearWatch = watchLine(line + SLACK + PAST);
    for (const el of seats) {
      topWatch.observe(el);
      nearWatch.observe(el);
    }
  }

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
    order = [...foundSeats];
    sync(
      seats,
      foundSeats,
      (el) => {
        lineWatch.observe(el);
        viewWatch.observe(el);
        topWatch?.observe(el);
        nearWatch?.observe(el);
      },
      (el) => {
        lineWatch.unobserve(el);
        viewWatch.unobserve(el);
        topWatch?.unobserve(el);
        nearWatch?.unobserve(el);
        onLine.delete(el);
        inSight.delete(el);
        shares.delete(el);
      },
    );

    const foundStages = new Set<Element>();
    for (const el of root.querySelectorAll(STAGE)) if (isRendered(el)) foundStages.add(el);
    sync(
      stages,
      foundStages,
      (el) => viewWatch.observe(el),
      (el) => {
        viewWatch.unobserve(el);
        inSight.delete(el);
        shares.delete(el);
      },
    );

    let foundHome: HTMLElement | null = null;
    for (const el of root.querySelectorAll<HTMLElement>(HOME)) {
      if (!isRendered(el)) continue;
      foundHome = el;
      break;
    }
    if (foundHome !== home) {
      if (home) {
        viewWatch.unobserve(home);
        inSight.delete(home);
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

  /** The place the visitor's attention asks for, null to stay put, or "nowhere" when the attended seat has no top edge in view to sit on. */
  function choose(): Want {
    if (!armed || stageOn()) return "home";
    const pressed = tapped && usable(tapped) ? tapped : null;
    if (!pressed && keys) return focused && usable(focused) ? focused : null;
    if (!pressed && mode === "mouse") {
      // Under the mouse: the seat pointed at, or the next one down while its top edge is off the top of the screen.
      if (!hover || !usable(hover)) return null;
      const spot = stand(hover);
      hoverSpot = { hover, spot };
      return spot ?? (homeOn() ? "home" : "nowhere");
    }
    // By touch: the seat just tapped, else the one being read, as long as there is a top edge in view to sit on.
    const attended = pressed ?? lineSeat();
    if (!attended) return homeOn() ? "home" : null;
    return stand(attended) ?? (homeOn() ? "home" : "nowhere");
  }

  /**
   * Staying put means staying on the seat, unless it is gone, or has left the screen while the home
   * is coming back onto it. With nowhere to sit (the last card's top edge has gone, the home is far
   * up the page) it stays only on a top edge that is on screen; otherwise it goes home, which here
   * means it fades where it is and waits, hidden, to appear on the next top edge, or to be home, that
   * comes back into view. It does not hang on an edge that has gone and scroll off with it.
   */
  function settled(spot: Want): Spot {
    if (spot === "nowhere") {
      if (!seat || !usable(seat)) return "home";
      const top = seat.getBoundingClientRect().top;
      return edgeShows(seat) && top < window.innerHeight ? seat : "home";
    }
    if (spot !== null) return spot;
    if (!seat || !usable(seat)) return "home";
    // A seat not measured yet counts as on screen.
    if (home !== null && inSight.has(home) && (shares.get(seat) ?? 1) <= 0) return "home";
    return seat;
  }

  function review(now = false) {
    // While a sheet is open the page behind it is inert, and the companion does nothing.
    if (behindSheet(root)) return;
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
      if (held === null || behindSheet(root)) return;
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

  /**
   * A seat's top edge where layout puts it, in the layout root's coordinates. A card is drawn a
   * little off that at times (rising its last pixels into place as it scrolls in, lifted under a
   * pointer), and the cloud takes the place the card comes back to: on a moving edge it would be
   * left behind, because nothing tells it how far the page has scrolled since. `drawn` is where
   * the edge is drawn now, and the answer whenever layout cannot say.
   */
  function restTop(el: Element, drawn: number): number {
    let y = 0;
    let node: Element | null = el;
    while (node instanceof HTMLElement && node !== root) {
      y += node.offsetTop;
      const parent: Element | null = node.offsetParent;
      if (parent instanceof HTMLElement && parent !== root) y += parent.clientTop;
      node = parent;
    }
    return node === root && Math.abs(y - drawn) <= DRIFT ? y : drawn;
  }

  /** The cloud on `el` is there for the seat under the mouse (that seat, or the next one down in its place): it slides with the pointer. */
  const slides = (el: Element) => mode === "mouse" && !keys && pointer?.known === true && hover !== null && (hover === el || (hoverSpot?.hover === hover && hoverSpot.spot === el));

  /** The cloud's place on a seat: on the top edge, its base a little over the card, the rest above it. */
  function perch(el: Element) {
    const frame = root.getBoundingClientRect();
    const card = el.getBoundingClientRect();
    const width = host.offsetWidth;
    // Under a mouse it slides along the edge with the pointer; once the pointer leaves the card it keeps its place.
    if (pointer && slides(el)) along = pointer.x - card.left;
    const wanted = card.left + (along ?? card.width * ALONG);
    const centre = card.width > INSET * 2 ? Math.min(Math.max(wanted, card.left + INSET), card.right - INSET) : card.left + card.width / 2;
    return { x: centre - width / 2 - frame.left, y: restTop(el, card.top - frame.top) + OVERLAP - BASE * width };
  }

  /** To whole screen pixels: between two of them the drawing goes soft, and its eyes, which the browser keeps on a layer of their own, part from its face. */
  function snap(value: number) {
    const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    return Math.round(Math.round(value * ratio) / ratio * 1000) / 1000;
  }

  function place(x: number, y: number, scale = 1) {
    const next = { x: snap(x), y: snap(y), scale: Math.round(scale * 1000) / 1000 };
    if (next.x === pose.x && next.y === pose.y && next.scale === pose.scale) return;
    if (next.x !== pose.x || next.y !== pose.y) host.style.translate = `${next.x}px ${next.y}px`;
    if (next.scale !== pose.scale) host.style.scale = next.scale === 1 ? "" : String(next.scale);
    pose = next;
    // When it has arrived, a mouse resting on the page is in a different direction for the eyes.
    arriveTimer = clear(arriveTimer);
    arriveTimer = window.setTimeout(() => {
      arriveTimer = null;
      nudgeAttention();
    }, glideMs + 40);
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
    const { gx, gy } = lookOf(from);
    writeLook(to, gx, gy);
  }

  /**
   * One blink as it lands. The stylesheet plays it while the mark is on, in place of the eyes'
   * usual round of blinks: one animation on the eyes at a time, which is what lets the browser
   * run either of them off the main thread.
   */
  function blink() {
    blinkTimer = clear(blinkTimer);
    if (host.hasAttribute("data-blink")) {
      // A second landing during the first blink has to start from the top: take the mark off and let the browser see it gone.
      host.removeAttribute("data-blink");
      void host.offsetWidth;
    }
    host.setAttribute("data-blink", "");
    blinkTimer = window.setTimeout(() => {
      blinkTimer = null;
      host.removeAttribute("data-blink");
    }, glideMs * 0.7 + BLINK_MS);
  }

  /** Measures the seat again and moves if it has moved: the page grew, the pointer slid along, an entrance finished. */
  function follow() {
    if (behindSheet(root)) return;
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

  /** No part of the cloud is on screen: it is home, or the seat it sits on has scrolled away with it. */
  function outOfSight(): boolean {
    if (state === "home") return true;
    const box = host.getBoundingClientRect();
    return box.bottom <= 0 || box.top >= window.innerHeight;
  }

  function goSeat(el: Element) {
    returnTimer = clear(returnTimer);
    parkTimer = clear(parkTimer);
    const fromHome = state === "home";
    const unseen = outOfSight();
    if (el !== seat) along = null;
    seat = el;
    state = "out";
    const to = perch(el);
    if (unseen) {
      // It glides between two places that can both be seen: out of its home when all of the home
      // is on screen, from one top edge to the next. From anywhere else (a home or a seat that has
      // scrolled away or is half off the screen's edge, a page without a home) it does not fly in
      // across the page: it appears at the seat, rising its last few pixels.
      const start = fromHome && homeWhole() ? home : null;
      jump(() => {
        if (start) {
          // Same place, same size, same look as the home cloud, and that box empties in the same frame.
          const from = boxIn(start);
          place(from.x, from.y, from.width / host.offsetWidth);
          copyLook(start, cloudOf(host));
          start.setAttribute(AWAY, "");
          host.setAttribute("data-on", "");
        } else {
          host.removeAttribute("data-on");
          place(to.x, to.y + RISE);
          // What can still be seen of the home cloud fades as the companion appears elsewhere.
          home?.setAttribute(AWAY, "fade");
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
    }, glideMs + 80);
  }

  /**
   * Takes the hidden cloud back to the layout root's corner. Left where it last sat, the invisible
   * box still counts toward the page's height: a short page reached from far down a long one would
   * scroll on into nothing, and could open already scrolled.
   */
  function park() {
    parkTimer = clear(parkTimer);
    if (state !== "home") return;
    jump(() => {
      host.style.translate = "";
      host.style.scale = "";
    });
    pose = { x: Number.NaN, y: Number.NaN, scale: 1 };
  }

  /** Back in the home cloud's box (or gone, without one). The inline cloud shows again in the frame the roaming one leaves. */
  function land(atOnce: boolean) {
    returnTimer = clear(returnTimer);
    settleTimer = clear(settleTimer);
    arriveTimer = clear(arriveTimer);
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
    if (atOnce) {
      jump(swap);
      park();
    } else {
      // It fades out where it is; once it cannot be seen it is taken off the page's far reaches.
      swap();
      parkTimer = clear(parkTimer);
      parkTimer = window.setTimeout(park, fadeMs + 40);
    }
  }

  function goHome() {
    if (state !== "out") return;
    const unseen = outOfSight();
    seat = null;
    along = null;
    settleTimer = clear(settleTimer);
    if (unseen) {
      // Nobody can see it where it is: it is simply home when its home scrolls back into view.
      land(true);
      return;
    }
    if (!home || !homeWhole()) {
      // No home on this page, or not all of it is on screen: the cloud fades out where it is.
      land(false);
      return;
    }
    home.setAttribute(AWAY, "");
    const to = boxIn(home);
    place(to.x, to.y, to.width / host.offsetWidth);
    state = "returning";
    returnTimer = window.setTimeout(() => land(true), glideMs + 30);
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
      watchEdges();
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
      hoverSince = performance.now();
      if (mode === "mouse") review();
    },
    move(p, real) {
      pointer = p;
      if (behindSheet(root) || p.kind !== "mouse") return;
      if (real) {
        const woke = !armed || mode !== "mouse" || keys;
        mode = "mouse";
        keys = false;
        armed = true;
        if (woke) {
          const next = seatAt(p.target);
          if (next !== hover) hoverSince = performance.now();
          hover = next;
          review();
        }
      }
      if (state === "out" && seat !== null && slides(seat)) follow();
    },
    touch(down, p) {
      pointer = p;
      if (behindSheet(root) || !down) return;
      mode = "touch";
      keys = false;
      armed = true;
      // New cards may have arrived since the last look; the reading line has to know them before the scroll.
      scan();
      review();
    },
    tap(target, p) {
      pointer = p;
      if (behindSheet(root)) return;
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
      if (behindSheet(root)) return;
      keys = byKeys;
      focused = byKeys ? seatAt(target) : null;
      if (!byKeys) return;
      armed = true;
      review(true);
    },
    stir() {
      if (behindSheet(root) || armed) return;
      armed = true;
      review();
    },
    resize() {
      // A sticky column at one width is an ordinary card at another, and the lines near the top of the screen are placed by its height.
      stuck = new WeakMap();
      watchEdges();
      measureSoon();
    },
  });

  // The page's height changes when cards arrive, open or leave: everything below them moves.
  const main = root.querySelector("main");
  const sizeWatch = typeof ResizeObserver === "function" && main ? new ResizeObserver(measureSoon) : null;
  if (sizeWatch && main) sizeWatch.observe(main);
  watchEdges();
  scan();

  return {
    pageChanged() {
      armed = false;
      keys = false;
      hover = null;
      hoverSpot = null;
      edgeGone = null;
      focused = null;
      tapped = null;
      pending = null;
      reading = { seat: null, since: 0 };
      dwellTimer = clear(dwellTimer);
      tapTimer = clear(tapTimer);
      if (state !== "home") land(true);
      scan();
    },
    stop() {
      unwatch();
      lineWatch.disconnect();
      viewWatch.disconnect();
      topWatch?.disconnect();
      nearWatch?.disconnect();
      sizeWatch?.disconnect();
      dwellTimer = clear(dwellTimer);
      tapTimer = clear(tapTimer);
      measureTimer = clear(measureTimer);
      arriveTimer = clear(arriveTimer);
      blinkTimer = clear(blinkTimer);
      parkTimer = clear(parkTimer);
      if (state !== "home") land(true);
      home?.removeAttribute(AWAY);
      host.removeAttribute("data-blink");
      host.style.translate = "";
      host.style.scale = "";
    },
  };
}
