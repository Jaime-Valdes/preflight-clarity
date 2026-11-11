/*
 * Version D motion helpers (docs/ui-d-cinematic.md, "Motion kit"). Placeholder with the
 * agreed names; the motion-kit work fills the bodies in.
 */

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_IN_OUT = "cubic-bezier(0.45, 0, 0.25, 1)";
export const D_PRESS_MS = 100;
export const D_QUICK_MS = 160;
export const D_MOVE_MS = 320;

/** A glyph arriving, a badge stamping, content settling: one-shot Web Animations API presets. */
export type MotionPreset = "pop" | "stamp" | "settle";

/** True when the visitor asked for less motion (or outside the browser). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays a preset once on an element; does nothing under reduced motion. */
export function animateOnce(el: Element | null, preset: MotionPreset): void {
  void el;
  void preset;
}

/** Sends the small paper plane from one rectangle to another (compare add: button to tray chip). */
export function flyTo(from: DOMRect, to: DOMRect): void {
  void from;
  void to;
}
