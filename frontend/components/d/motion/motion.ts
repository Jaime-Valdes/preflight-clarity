/*
 * Version D motion helpers (docs/ui-d-cinematic.md, "Motion kit"): the easings and
 * durations every D component shares, three one-shot Web Animations API presets, and
 * the two calls that draw on the fixed motion layer (DMotionLayer): the small paper
 * plane and the soft ring around a control. Nothing here takes a flight, a rating, a
 * price or a position in a list, so no motion can treat one flight differently from
 * another. The CSS side of the kit (app/d/d-motion.css) carries the same easings and the
 * move duration as --d-ease-out, --d-ease-in-out and --d-move, plus --d-press (100 ms) and
 * --d-quick (160 ms), which only CSS uses.
 */

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_IN_OUT = "cubic-bezier(0.45, 0, 0.25, 1)";
/** Things that travel or open. */
export const D_MOVE_MS = 320;
/** The tap ring's life (DMotionLayer). */
export const D_TAP_RING_MS = 420;
/** The fly-to plane's flight (DMotionLayer). */
export const D_FLY_MS = 520;
/** The soft ring that leaves a control (DMotionLayer). */
export const D_RING_FROM_MS = 520;

/** A glyph arriving, a badge stamping, content settling, a card rising as it scrolls in: one-shot presets. */
export type MotionPreset = "pop" | "stamp" | "settle" | "reveal";

export interface AnimateOnceOptions {
  /** Milliseconds to wait first (a stagger). The element holds the preset's first frame meanwhile. */
  delay?: number;
}

/** A rectangle in viewport coordinates: what getBoundingClientRect() returns, or a plain object of the same shape. */
export type MotionRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

/** How flyTo() reaches the layer: a window event, like the cloud's reactions. The detail is two points and nothing else. */
export const D_FLY_EVENT = "d-fly-to";

export interface FlyDetail {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/** How ringFrom() reaches the layer: the control's box and corner radius, and nothing else. */
export const D_RING_FROM_EVENT = "d-ring-from";

export interface RingFromDetail {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: string;
}

interface Preset {
  keyframes: Keyframe[];
  duration: number;
}

/*
 * Every preset moves `transform` only (opacity is never touched, so nothing starts
 * invisible) and ends on the identity, so the element's own style is the resting frame.
 *   pop     a glyph of 28 px or less arriving: from 60 % to full size, 8 % past on the way.
 *   stamp   a badge landing: from 80 % to full size, no overshoot.
 *   settle  content settling into place: a 10 px rise.
 *   reveal  a .d-reveal element coming up from below the screen: its last 16 px (DMotionLayer plays it).
 */
const PRESETS: Record<MotionPreset, Preset> = {
  pop: {
    keyframes: [
      { transform: "scale(0.6)", easing: EASE_OUT },
      { transform: "scale(1.08)", offset: 0.55, easing: "ease-in-out" },
      { transform: "scale(1)" },
    ],
    duration: 260,
  },
  stamp: {
    keyframes: [{ transform: "scale(0.8)", easing: EASE_OUT }, { transform: "scale(1)" }],
    duration: 240,
  },
  settle: {
    keyframes: [{ transform: "translateY(10px)", easing: EASE_OUT }, { transform: "translateY(0)" }],
    duration: D_MOVE_MS,
  },
  reveal: {
    keyframes: [{ transform: "translateY(16px)", easing: EASE_OUT }, { transform: "translateY(0)" }],
    duration: 360,
  },
};

/** The preset still running on an element, so a second call replaces it instead of stacking on it. */
const running = new WeakMap<Element, Animation>();

/** True when the visitor asked for less motion (or outside the browser). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays a preset once on an element. Does nothing under reduced motion, on a missing
 * element, or where the Web Animations API is absent. The animation fills backwards at
 * most (only to hold the first frame during a delay), so no transform is left behind,
 * and it is added to whatever transform the element already has, so an icon that is
 * rotated or centred with a transform keeps its place.
 */
export function animateOnce(el: Element | null | undefined, preset: MotionPreset, options: AnimateOnceOptions = {}): void {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return;
  const { keyframes, duration } = PRESETS[preset];
  const delay = Math.max(0, options.delay ?? 0);
  running.get(el)?.cancel();
  const animation = el.animate(keyframes, {
    duration,
    delay,
    fill: delay > 0 ? "backwards" : "none",
    composite: "add",
  });
  running.set(el, animation);
}

function centre(rect: MotionRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Sends the small paper plane from the centre of one rectangle to the centre of another
 * (compare add: the button to the new tray chip; remove: the mirror). Both rectangles are
 * in viewport coordinates. The plane is drawn by DMotionLayer, above the page and below
 * sheets; it takes no taps and nothing waits for it. Does nothing under reduced motion.
 */
export function flyTo(from: MotionRect, to: MotionRect): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const a = centre(from);
  const b = centre(to);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
  window.dispatchEvent(new CustomEvent<FlyDetail>(D_FLY_EVENT, { detail: { fromX: a.x, fromY: a.y, toX: b.x, toY: b.y } }));
}

/**
 * One soft royal ring leaves the outline of a control and fades (the acknowledgement of
 * "I'd pick this flight"). Call it for the pick and for the withdrawal alike: it takes the
 * element and nothing about the flight, so both get exactly the same ring. Drawn by
 * DMotionLayer, so no table or card clips it. Does nothing under reduced motion.
 */
export function ringFrom(el: Element | null | undefined): void {
  if (!el || typeof window === "undefined" || prefersReducedMotion()) return;
  const box = el.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return;
  const radius = window.getComputedStyle(el).borderRadius || "0px";
  window.dispatchEvent(
    new CustomEvent<RingFromDetail>(D_RING_FROM_EVENT, {
      detail: { left: box.left, top: box.top, width: box.width, height: box.height, radius },
    }),
  );
}
