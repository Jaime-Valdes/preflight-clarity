"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PaperPlane } from "@/components/d/brand/FlightPath";
import {
  animateOnce,
  D_FLY_EVENT,
  D_FLY_MS,
  D_RING_FROM_EVENT,
  D_RING_FROM_MS,
  D_TAP_RING_MS,
  EASE_IN_OUT,
  EASE_OUT,
  type FlyDetail,
  type RingFromDetail,
} from "./motion";

/** The ring starts at 12 px and ends at its full 44 px. */
const RING_FROM = 12 / 44;
/** A press that travelled further than this before letting go was a drag (a text selection), not a tap. */
const TAP_SLOP = 12;
/** A click belongs to the release just before it; anything older is not its release. */
const RELEASE_WINDOW_MS = 700;
/**
 * What can start a page move: a link, or a form's submit button (the search form pushes a route on submit;
 * pressing Enter in a field clicks its submit button too). Only a click on one of these writes --d-tap-y.
 */
const NAVIGATES = 'a[href], form button:not([type="button"]):not([type="reset"]), form input[type="submit"]';
/** The plane's place is sampled this many times along its arc; the browser interpolates between the samples. */
const ARC_STEPS = 12;
/** The plane keeps its nose a few degrees up the whole way: it glides, it never dives. */
const PLANE_PITCH = -4;
/** How far the soft ring travels out from a control's edge, on every side. */
const RING_FROM_REACH = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Whether this click will move this tab to another page: a form's submit button, or a plain primary click on a
 * same-origin link (no modifier key, no other target, no download) to a path or query other than the current
 * one. A Cmd / Ctrl / Shift / Alt or middle click, a new-tab or download link, a hash link (the skip link) and a
 * link to the page already showing start no page move here. (It runs before Next's Link handler, so it cannot ask
 * whether that handler cancelled the default; it reads the same signs the handler does.)
 */
function changesPage(event: MouseEvent): boolean {
  const el = event.target instanceof Element ? event.target.closest(NAVIGATES) : null;
  if (!el) return false;
  if (!el.matches("a[href]")) return true;
  if (!(el instanceof HTMLAnchorElement)) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = el.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return false;
  if (el.hasAttribute("download")) return false;
  let url: URL;
  try {
    url = new URL(el.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

function cancelAll(el: Element) {
  for (const animation of el.getAnimations()) animation.cancel();
}

/** The scroll reveal's class (docs/ui-d-cinematic.md, "Motion kit"), the shared cards that cannot wear it (each
    of the flight page's other flights: components/c/flight/OtherFlights.tsx, under the id DFlightDetail gives
    it; checked by scripts/d-hooks.mjs), and what it never moves: a card holding a combobox (its suggestion list
    would be trapped under the next card) and the sign-up card (its view event watches its box). */
const REVEAL = '.d-reveal, [data-theme="d"] #other-flights > ul > li > div';
const REVEAL_NEVER = ':has([role="combobox"]), [aria-labelledby^="c-interest-"]';
/** A card rises only while the page is scrolling down: the last downward scroll is at most this old... */
const REVEAL_SCROLL_MS = 250;
/** ...and the card comes in through the bottom of the screen: its top within this band of the bottom edge. */
function revealBand(height: number): number {
  return Math.max(96, height * 0.25);
}

/** document.activeViewTransition (Chrome 142+, Safari 26.2+), not yet in TypeScript's DOM types. */
type ActiveViewTransitionDocument = Document & { activeViewTransition?: { skipTransition(): void } | null };

interface Reveals {
  /** Looks again at every .d-reveal not yet seen: after a route change, a kept-alive page may be showing. */
  rescan(): void;
  stop(): void;
}

/**
 * The scroll reveal: an element that is below the screen when it is first seen rises its last 16 px, once, as
 * the page's scrolling brings it in through the bottom edge; one already on screen (or above it) when first seen
 * never moves. A reveal is a scroll animation and nothing else: a card that comes into view any other way (a
 * sort, a filter or a date change re-deals the list under a still page, or the layout shifts) is only marked
 * seen, so a re-dealt list settles as one piece, the same for every flight. One IntersectionObserver for the
 * whole layout, a childList observer to find new ones, and a passive scroll listener that only notes when the
 * page last moved down; the rise is a Web Animations API one-shot (animateOnce, "reveal"), so nothing is written
 * to the DOM and nothing stays on the element, not even a compositor layer, once it has played. Position only;
 * nothing at all under reduced motion. The inputs are the scroll and the card's box, never what the card holds.
 *
 * An element is "seen" when the observer first reports it with a box: a kept-alive page is display: none, and
 * its elements wait (unseen) until it shows again and rescan() asks the observer for a fresh report.
 */
function watchReveals(root: Element): Reveals | null {
  if (typeof IntersectionObserver !== "function" || typeof MutationObserver !== "function") return null;
  const done = new WeakSet<Element>();
  const below = new WeakSet<Element>();
  let lastY = window.scrollY;
  let scrolledDownAt = -Infinity;
  // Writes nothing: a scroll up (or a page that got shorter and pulled the scroll back) is not a reveal's scroll.
  const onScroll = () => {
    const y = window.scrollY;
    if (y > lastY) scrolledDownAt = performance.now();
    lastY = y;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  const io = new IntersectionObserver((entries) => {
    const scrolling = performance.now() - scrolledDownAt <= REVEAL_SCROLL_MS;
    for (const entry of entries) {
      const el = entry.target;
      const box = entry.boundingClientRect;
      const bottom = entry.rootBounds?.bottom ?? window.innerHeight;
      if (entry.isIntersecting) {
        done.add(el);
        io.unobserve(el);
        // It came up through the bottom edge because the page scrolled; anything else stays put.
        const entering = below.has(el) && box.top > 0 && box.top > bottom - revealBand(bottom);
        if (scrolling && entering && !el.matches(REVEAL_NEVER)) animateOnce(el, "reveal");
      } else if (box.width === 0 && box.height === 0) {
        // Not laid out: a hidden page. Not seen yet.
      } else if (box.top >= bottom) {
        below.add(el);
      } else if (box.bottom <= 0) {
        done.add(el);
        io.unobserve(el);
      }
    }
  });
  const watch = (el: Element) => {
    if (!done.has(el)) io.observe(el);
  };
  const scan = (node: Element) => {
    if (node.matches(REVEAL)) watch(node);
    for (const el of node.querySelectorAll(REVEAL)) watch(el);
  };
  const mo = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  scan(root);
  return {
    rescan() {
      for (const el of root.querySelectorAll(REVEAL)) {
        if (done.has(el)) continue;
        io.unobserve(el);
        io.observe(el);
      }
    },
    stop() {
      window.removeEventListener("scroll", onScroll);
      mo.disconnect();
      io.disconnect();
    },
  };
}

/**
 * The fixed layer for small motion that belongs to no component (docs/ui-d-cinematic.md,
 * "Motion kit"). Mounted once in app/d/layout.tsx, above the page and the tray, below sheets.
 *
 *  - The tap ring: every click made with a pointer leaves one soft gold ring at the tap
 *    point. Three pooled elements restarted with the Web Animations API, so a tap adds no
 *    DOM node and writes no attribute (session replay records both).
 *  - `--d-tap-y` on <html>: the height of the press behind the last click that changes page
 *    (a plain click on a link to another page, or a submit button: changesPage), which the
 *    page transition's plane enters at; the same click ends a wipe still running. Written on that click and
 *    only when it changed, never on a bare press: any custom property changed on <html>
 *    restyles the whole document (in Chrome, registered as not inherited or not), and every
 *    scroll on a phone starts with a press.
 *  - The fly-to plane and the soft ring around a control: flyTo() and ringFrom() in
 *    ./motion ask for them with a window event that carries geometry and nothing else.
 *  - The scroll reveal for every .d-reveal in the layout, and for the flight page's shared
 *    other-flight cards (watchReveals, above).
 *
 * Decoration only: aria-hidden, no pointer events, nothing focusable, no analytics. Its
 * listeners are passive, sit on the window (the pointer and click ones in the capture
 * phase) and never stop or cancel an event, so no tap is delayed and no click is renamed.
 * The rings and the plane are off under reduced motion; the custom property is still
 * written, since nothing moves by it.
 */
export function DMotionLayer() {
  const layerRef = useRef<HTMLDivElement>(null);
  const revealsRef = useRef<Reveals | null>(null);
  const pathname = usePathname();

  // The layer is the last child of the layout's root, which holds the header, every page and the footer.
  useEffect(() => {
    const root = layerRef.current?.parentElement;
    if (!root) return;
    const reveals = watchReveals(root);
    revealsRef.current = reveals;
    return () => {
      reveals?.stop();
      revealsRef.current = null;
    };
  }, []);

  // A route change can show a kept-alive page whose elements were never laid out: look at them again.
  useEffect(() => {
    revealsRef.current?.rescan();
  }, [pathname]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const html = document.documentElement;
    const rings = Array.from(layer.querySelectorAll<HTMLElement>(".d-tap-ring"));
    const planes = Array.from(layer.querySelectorAll<HTMLElement>(".d-fly-plane"));
    const halos = Array.from(layer.querySelectorAll<HTMLElement>(".d-ring-from"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canAnimate = typeof layer.animate === "function";
    let nextRing = 0;
    let nextPlane = 0;
    let nextHalo = 0;
    let lastRingAt = -Infinity;
    let downX = 0;
    let downY = 0;
    let upX = 0;
    let upY = 0;
    let upAt = -Infinity;
    let tapY: number | null = null;

    // The transition's plane stays between 18 % and 72 % of the screen's height, wherever the press was.
    function setTapY(y: number) {
      const height = window.innerHeight;
      if (!height || !Number.isFinite(y)) return;
      const next = Math.round(clamp(y, height * 0.18, height * 0.72));
      if (next === tapY) return;
      tapY = next;
      html.style.setProperty("--d-tap-y", `${next}px`);
    }

    function onPointerDown(event: PointerEvent) {
      if (!event.isPrimary) return;
      downX = event.clientX;
      downY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
      if (!event.isPrimary) return;
      upX = event.clientX;
      upY = event.clientY;
      upAt = event.timeStamp;
    }

    function ring(x: number, y: number) {
      const el = rings[nextRing];
      if (!el) return;
      nextRing = (nextRing + 1) % rings.length;
      cancelAll(el);
      const at = `translate(${round(x)}px, ${round(y)}px)`;
      // Two animations so the size can ease out while the fade stays even: with one easing for both, the ring
      // would be nearly gone before it had grown.
      el.animate({ transform: [`${at} scale(${RING_FROM})`, `${at} scale(1)`] }, { duration: D_TAP_RING_MS, easing: EASE_OUT });
      el.animate({ opacity: [0.7, 0.7, 0], offset: [0, 0.3, 1] }, { duration: D_TAP_RING_MS, easing: "linear" });
    }

    function onClick(event: MouseEvent) {
      // A keyboard activation (and element.click()) is a click with no pointer: detail 0, and an empty
      // pointerType where click is a PointerEvent. It gets no ring; the transition's plane enters level
      // with the focused control instead.
      const pointerType = (event as PointerEvent).pointerType;
      const navigates = changesPage(event);
      // A second page move asked for while a wipe still runs: React holds the next page until the running
      // transition has finished, so the new tap would wait out the old wipe. Finish that wipe now instead. A click
      // that moves nowhere in this tab (changesPage) leaves the wipe, and --d-tap-y, alone.
      if (navigates) (document as ActiveViewTransitionDocument).activeViewTransition?.skipTransition();
      if (event.detail === 0 || pointerType === "") {
        const focused = document.activeElement;
        const el = focused instanceof Element && focused !== document.body ? focused : event.target;
        if (navigates && el instanceof Element) {
          const box = el.getBoundingClientRect();
          if (box.width > 0 || box.height > 0) setTapY(box.top + box.height / 2);
        }
        return;
      }
      // The ring grows from where the finger lifted. A touch browser may nudge the click itself onto the
      // nearest control, so the click's own point is only the fallback; the plane enters where it pressed.
      const released = event.timeStamp - upAt < RELEASE_WINDOW_MS;
      if (navigates) setTapY(released ? downY : event.clientY);
      if (!canAnimate || reduced.matches) return;
      // A label passes its click on to its control: one tap, one ring.
      if (event.timeStamp - lastRingAt < 40) return;
      if (released && Math.hypot(upX - downX, upY - downY) > TAP_SLOP) return;
      // This layer sits under an open sheet (the layer table in the contract), so a ring there would only show
      // as a sliver beside the panel. A tap on the scrim closes the sheet and gets its ring on the page.
      if (event.target instanceof Element && event.target.closest('[role="dialog"][aria-modal="true"]')) return;
      lastRingAt = event.timeStamp;
      ring(released ? upX : event.clientX, released ? upY : event.clientY);
    }

    function onFly(event: Event) {
      const detail = (event as CustomEvent<FlyDetail>).detail;
      if (!detail || !canAnimate || reduced.matches) return;
      const el = planes[nextPlane];
      if (!el) return;
      nextPlane = (nextPlane + 1) % planes.length;
      cancelAll(el);
      // Both ends stay on screen: a tray chip can sit beyond the edge of its own scroller.
      const maxX = window.innerWidth - 12;
      const maxY = window.innerHeight - 12;
      const ax = clamp(detail.fromX, 12, maxX);
      const ay = clamp(detail.fromY, 12, maxY);
      const bx = clamp(detail.toX, 12, maxX);
      const by = clamp(detail.toY, 12, maxY);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length < 1) return;
      // A shallow arc: the control point is off the straight line by a quarter of its length (64 px at most),
      // on the side that is up on the screen, so the plane lifts a little before it comes down.
      const lift = Math.min(length * 0.24, 64);
      let nx = dy / length;
      let ny = -dx / length;
      if (ny > 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }
      const cx = (ax + bx) / 2 + nx * lift;
      const cy = (ay + by) / 2 + ny * lift;
      // It faces the way it travels and keeps a level attitude; flying left is the mirror image.
      const facing = dx < 0 ? " scaleX(-1)" : "";
      const path: string[] = [];
      for (let i = 0; i <= ARC_STEPS; i += 1) {
        const t = i / ARC_STEPS;
        const u = 1 - t;
        const x = u * u * ax + 2 * u * t * cx + t * t * bx;
        const y = u * u * ay + 2 * u * t * cy + t * t * by;
        path.push(`translate(${round(x)}px, ${round(y)}px)${facing} rotate(${PLANE_PITCH}deg)`);
      }
      el.animate({ transform: path }, { duration: D_FLY_MS, easing: EASE_IN_OUT });
      el.animate({ opacity: [0, 1, 1, 0], offset: [0, 0.15, 0.8, 1] }, { duration: D_FLY_MS, easing: "linear" });
    }

    function onRingFrom(event: Event) {
      const detail = (event as CustomEvent<RingFromDetail>).detail;
      if (!detail || !canAnimate || reduced.matches) return;
      const el = halos[nextHalo];
      if (!el || !(detail.width > 0 && detail.height > 0)) return;
      nextHalo = (nextHalo + 1) % halos.length;
      cancelAll(el);
      const width = `${round(detail.width)}px`;
      const height = `${round(detail.height)}px`;
      // The pooled element takes the control's size and corners from the animation itself, held for its whole
      // length, so even this writes no attribute. It then grows by the same few pixels on every side.
      el.animate(
        { width: [width, width], height: [height, height], borderRadius: [detail.radius, detail.radius] },
        { duration: D_RING_FROM_MS },
      );
      const at = `translate(${round(detail.left)}px, ${round(detail.top)}px)`;
      const sx = (detail.width + RING_FROM_REACH * 2) / detail.width;
      const sy = (detail.height + RING_FROM_REACH * 2) / detail.height;
      el.animate({ transform: [`${at} scale(1)`, `${at} scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`] }, { duration: D_RING_FROM_MS, easing: EASE_OUT });
      el.animate({ opacity: [0.4, 0.4, 0], offset: [0, 0.25, 1] }, { duration: D_RING_FROM_MS, easing: "linear" });
    }

    const listen = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onPointerDown, listen);
    window.addEventListener("pointerup", onPointerUp, listen);
    window.addEventListener("click", onClick, listen);
    window.addEventListener(D_FLY_EVENT, onFly, { passive: true });
    window.addEventListener(D_RING_FROM_EVENT, onRingFrom, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, listen);
      window.removeEventListener("pointerup", onPointerUp, listen);
      window.removeEventListener("click", onClick, listen);
      window.removeEventListener(D_FLY_EVENT, onFly);
      window.removeEventListener(D_RING_FROM_EVENT, onRingFrom);
      for (const el of [...rings, ...planes, ...halos]) cancelAll(el);
      html.style.removeProperty("--d-tap-y");
    };
  }, []);

  return (
    <div ref={layerRef} aria-hidden className="d-motion-layer">
      <span className="d-tap-ring" />
      <span className="d-tap-ring" />
      <span className="d-tap-ring" />
      <FlyPlane />
      <FlyPlane />
      <span className="d-ring-from" />
      <span className="d-ring-from" />
    </div>
  );
}

/** The 14 px outlined paper plane (the brand's own glyph, 20 units long, drawn at 0.7 px a unit). */
function FlyPlane() {
  return (
    <span className="d-fly-plane">
      <svg viewBox="-12 -10 26 20" width="18.2" height="14" focusable="false">
        <PaperPlane />
      </svg>
    </span>
  );
}
