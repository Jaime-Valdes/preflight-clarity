/*
 * The companion (docs/ui-d-cinematic.md, "Where it lives"): the one roaming cloud. It rests in the
 * page's home cloud (or nowhere, on a page without one) and comes to sit on the top edge of the
 * card the visitor attends to:
 *
 *   mouse     the seat under the pointer, once it has stayed there 140 ms; the cloud then slides
 *             along the edge under the pointer
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
import { AWAY, HOME, SEAT, STAGE, cloudOf, isRendered } from "./dom";

/** A seat has to hold the visitor's attention this long before the cloud moves to it. */
const DWELL_MS = 140;
/** A tapped seat keeps the cloud this long, whatever the reading line says. */
const TAP_MS = 4000;
/** The glide between places; the same number as the transition in d-cloud.css. */
const GLIDE_MS = 420;
/** How long the cloud takes to fade out; the same number as the opacity transition in d-cloud.css. */
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
/** How long the mark for the landing blink stays on: the blink's delay and its 200 ms (both in d-cloud.css), and a little to spare. */
const BLINK_MS = GLIDE_MS * 0.7 + 240;

/** A place the cloud can be: on a seat, or in its home (hidden, on a page without one). */
type Spot = Element | "home";
/** Where a seat is at a line across the screen: all of it above the line, its top edge above and the rest below, or all of it below. */
type Side = "above" | "cut" | "below";

export interface Companion {
  /** The address changed: straight back home, and nothing more until the visitor acts on the new page. */
  pageChanged(): void;
  stop(): void;
}

export function startCompanion(root: HTMLElement, host: HTMLElement): Companion {
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
  /** Each seat at the line a top edge must stay below for the whole cloud to show above it. */
  let atTop = new WeakMap<Element, Side>();
  /** Each seat at a second line SLACK further down. */
  let nearTop = new WeakMap<Element, Side>();
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

  /** The seat's top edge is low enough on the screen for the whole cloud to show above it. A seat not heard of yet counts as fine. */
  const edgeShows = (el: Element) => (atTop.get(el) ?? "below") === "below";

  /** The first seat further down the page whose top edge is on screen, with room for the cloud above it. */
  function seatBelow(el: Element): Element | null {
    for (let i = order.indexOf(el) + 1; i > 0 && i < order.length; i++) {
      const next = order[i];
      if (inSight.has(next) && edgeShows(next) && usable(next)) return next;
    }
    return null;
  }

  /**
   * Where the cloud sits for a seat the visitor attends to by touch. On it, while its top edge is
   * on screen: the cloud is in the gap above the card being read. Once that edge has scrolled off
   * the top, on the next seat whose top edge is on screen: in the gap below that card. Null when
   * neither is in view. The same for every seat: nothing but where the boxes are decides it.
   */
  function stand(el: Element): Element | null {
    if (!edgeShows(el)) return seatBelow(el);
    if ((nearTop.get(el) ?? "below") === "below") return el;
    // Its edge is on screen but close to the top. A cloud that already moved down stays down, so a
    // page nudged a few pixels back and forth does not send it back and forth.
    const below = seatBelow(el);
    return below !== null && state === "out" && seat === below ? below : el;
  }

  /** The seat on the reading line, and since when: a visitor who has been on one seat for a while is reading it, not flinging past. */
  let reading: { seat: Element | null; since: number } = { seat: null, since: 0 };
  const isReading = () => mode === "touch" && !keys && reading.seat !== null && performance.now() - reading.since >= DWELL_MS;

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
   * Keeps `into` saying on which side of a line `y` px down the screen each seat is. The observer
   * watches a thin band that ends at the line: a seat in the band has its top edge above the
   * line and the rest of it below; out of the band it is wholly above or wholly below.
   */
  function watchLine(y: number, into: WeakMap<Element, Side>): IntersectionObserver {
    const share = Math.min(Math.max((y / Math.max(window.innerHeight, 1)) * 100, BAND), 100);
    return new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const line = entry.rootBounds?.bottom ?? y;
          into.set(entry.target, entry.isIntersecting ? "cut" : entry.boundingClientRect.top >= line - 0.5 ? "below" : "above");
        }
        // The seat being read has not changed; only its top edge has reached the top of the screen.
        // The cloud goes at once, while it can still be seen leaving. In a fling no seat is read
        // for long enough, and the usual wait applies.
        review(isReading());
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
    atTop = new WeakMap();
    nearTop = new WeakMap();
    topWatch = watchLine(line, atTop);
    nearWatch = watchLine(line + SLACK, nearTop);
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
        atTop.delete(el);
        nearTop.delete(el);
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
        inSight.delete(el);
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

  /** The place the visitor's attention asks for, or null to stay put. */
  function choose(): Spot | null {
    if (!armed || stageOn()) return "home";
    const pressed = tapped && usable(tapped) ? tapped : null;
    if (!pressed) {
      if (keys) return focused && usable(focused) ? focused : null;
      if (mode === "mouse") return hover && usable(hover) ? hover : null;
    }
    // By touch: the seat just tapped, else the one being read, as long as there is a top edge in view to sit on.
    const attended = pressed ?? lineSeat();
    const spot = attended ? stand(attended) : null;
    return spot ?? (homeOn() ? "home" : null);
  }

  /** Staying put means staying on the seat, unless it is gone, or has left the screen while the home is coming back onto it. */
  function settled(spot: Spot | null): Spot {
    if (spot !== null) return spot;
    if (!seat || !usable(seat)) return "home";
    // A seat not measured yet counts as on screen.
    if (home !== null && inSight.has(home) && (shares.get(seat) ?? 1) <= 0) return "home";
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

  /** The cloud's place on a seat: on the top edge, its base a little over the card, the rest above it. */
  function perch(el: Element) {
    const frame = root.getBoundingClientRect();
    const card = el.getBoundingClientRect();
    const width = host.offsetWidth;
    // Under a mouse it slides along the edge with the pointer; once the pointer leaves the card it keeps its place.
    if (mode === "mouse" && !keys && pointer?.known && hover === el) along = pointer.x - card.left;
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
    }, BLINK_MS);
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
    }, GLIDE_MS + 80);
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
      parkTimer = window.setTimeout(park, FADE_MS + 40);
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
