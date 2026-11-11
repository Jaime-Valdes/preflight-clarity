/*
 * What the visitor is attending to, from one set of passive listeners for the whole /d layout
 * (docs/ui-d-cinematic.md, "Gaze"): where the mouse or the thumb is, what is under it, what was
 * tapped, where the keyboard put focus. The gaze and the companion both read it from here, so
 * however many clouds are on screen there is one listener of each kind, and none of them can
 * cancel, delay or see the result of a tap. Coordinates and elements only: nothing here knows
 * what a card shows.
 */

/**
 * The shortest stretch between two `move` calls while the point is moving, and so between two
 * writes of a cloud's look (or of the companion's place under a sliding mouse): about 11 a second,
 * inside the contract's 12 for one small node, with the timers' few milliseconds of jitter.
 */
export const MOVE_MS = 90;

export interface Pointer {
  /** Viewport coordinates of the mouse, or of the thumb while it is down. */
  x: number;
  y: number;
  /** False until the first mouse or touch event. */
  known: boolean;
  kind: "mouse" | "touch";
  /** A finger is on the glass. */
  down: boolean;
  /** The element under the mouse, or the one the finger went down on. Never a decorative layer: they take no pointer events. */
  target: Element | null;
}

export interface Watcher {
  /** The point moved; called at most once every MOVE_MS. `real` is false when the page moved under a resting mouse. */
  move?(pointer: Pointer, real: boolean): void;
  /** The element under the mouse changed. Not throttled, so do very little here. */
  over?(target: Element | null): void;
  /** A finger went down (true), or the last one lifted (false). */
  touch?(down: boolean, pointer: Pointer): void;
  /** A click or a tap landed on `target`. */
  tap?(target: Element | null, pointer: Pointer): void;
  /** Focus moved; `keys` is true when the keyboard moved it. */
  focus?(target: Element | null, keys: boolean): void;
  /** The visitor turned a wheel or pressed a key: they are doing something, though no point moved. */
  stir?(): void;
  /** The mouse left the window. */
  leave?(): void;
  /** The window changed size (after it settles). */
  resize?(): void;
}

const watchers = new Set<Watcher>();
const pointer: Pointer = { x: 0, y: 0, known: false, kind: "mouse", down: false, target: null };

/** Where the mouse last was on the screen: a "move" at the same place is the page scrolling under it. */
let screenX = Number.NaN;
let screenY = Number.NaN;
/** The last input was a key press, so a focus change is the keyboard's. */
let keys = false;
let moveTimer: number | null = null;
let moveReal = false;
let lastMove = 0;
let resizeTimer: number | null = null;
/** A finger that went down and has not strayed since: lifted soon enough, it was a tap. */
let press: { x: number; y: number; at: number; target: Element | null } | null = null;
/** A finger may wander this far (px) and rest this long (ms) and still be tapping. */
const TAP_SLOP = 10;
const TAP_MS = 700;

function each(call: (watcher: Watcher) => void) {
  for (const watcher of watchers) call(watcher);
}

function flushMove() {
  moveTimer = null;
  lastMove = performance.now();
  const real = moveReal;
  moveReal = false;
  each((w) => w.move?.(pointer, real));
}

function queueMove(real: boolean) {
  moveReal = moveReal || real;
  if (moveTimer !== null) return;
  moveTimer = window.setTimeout(flushMove, Math.max(0, MOVE_MS - (performance.now() - lastMove)));
}

function setTarget(target: EventTarget | null) {
  const el = target instanceof Element ? target : null;
  if (el === pointer.target) return;
  pointer.target = el;
  each((w) => w.over?.(el));
}

// Touch pointers are left to the touch events below: once the browser takes a drag over as a
// scroll it cancels the pointer, but touchmove keeps coming, and the eyes follow a scrolling thumb.
function onPointerMove(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  const real = e.screenX !== screenX || e.screenY !== screenY;
  screenX = e.screenX;
  screenY = e.screenY;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.known = true;
  if (real) {
    pointer.kind = "mouse";
    pointer.down = false;
    keys = false;
  }
  setTarget(e.target);
  queueMove(real);
}

// After a wheel scroll the browser reports what is now under the resting mouse with an "over"
// event and no "move".
function onPointerOver(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  setTarget(e.target);
  queueMove(false);
}

// A press moves focus before its click arrives: by then the keyboard must no longer count as the last input.
function onPointerDown() {
  keys = false;
}

// Leaving one element for another names the other; leaving the window names nothing.
function onPointerOut(e: PointerEvent) {
  if (e.pointerType === "touch" || e.relatedTarget !== null) return;
  // A move still waiting to be reported is about a pointer that is no longer there.
  if (moveTimer !== null) window.clearTimeout(moveTimer);
  moveTimer = null;
  moveReal = false;
  setTarget(null);
  each((w) => w.leave?.());
}

function onTouch(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) {
    if (!pointer.down) return;
    pointer.down = false;
    each((w) => w.touch?.(false, pointer));
    // Taps are read from the touch itself: Safari on a phone sends no click for a tap on plain text.
    const tapped = e.type === "touchend" && press !== null && e.timeStamp - press.at < TAP_MS ? press : null;
    press = null;
    if (tapped) each((w) => w.tap?.(tapped.target, pointer));
    return;
  }
  const started = !pointer.down || pointer.kind !== "touch";
  pointer.x = touch.clientX;
  pointer.y = touch.clientY;
  pointer.known = true;
  pointer.kind = "touch";
  pointer.down = true;
  keys = false;
  if (started) {
    pointer.target = e.target instanceof Element ? e.target : null;
    press = { x: touch.clientX, y: touch.clientY, at: e.timeStamp, target: pointer.target };
    each((w) => w.touch?.(true, pointer));
  } else if (press && (e.touches.length > 1 || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > TAP_SLOP)) {
    // A drag or a pinch, not a tap.
    press = null;
  }
  queueMove(true);
}

function onClick(e: MouseEvent) {
  // A click made by the keyboard (Enter on a button) reports no pointer position.
  if (e.detail === 0) return;
  keys = false;
  // A finger's tap has been reported from its touch already.
  const type = (e as PointerEvent).pointerType;
  if (type === "touch" || (!type && pointer.kind === "touch")) return;
  const target = e.target instanceof Element ? e.target : null;
  each((w) => w.tap?.(target, pointer));
}

function onKeyDown() {
  keys = true;
  each((w) => w.stir?.());
}

function onWheel() {
  each((w) => w.stir?.());
}

function onFocusIn(e: FocusEvent) {
  const target = e.target instanceof Element ? e.target : null;
  each((w) => w.focus?.(target, keys));
}

function onResize() {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    each((w) => w.resize?.());
  }, 150);
}

// Passive: none of these can cancel or delay what the visitor does. In the capture phase: a
// handler further down that stops an event cannot hide it from the cloud.
const WATCHING: AddEventListenerOptions = { passive: true, capture: true };

type Wiring = readonly [target: EventTarget, type: string, handler: EventListener];

function wiring(): Wiring[] {
  const doc = document;
  return [
    [doc, "pointermove", onPointerMove as EventListener],
    [doc, "pointerover", onPointerOver as EventListener],
    [doc, "pointerdown", onPointerDown],
    [doc, "pointerout", onPointerOut as EventListener],
    [doc, "touchstart", onTouch as EventListener],
    [doc, "touchmove", onTouch as EventListener],
    [doc, "touchend", onTouch as EventListener],
    [doc, "touchcancel", onTouch as EventListener],
    [doc, "click", onClick as EventListener],
    [doc, "keydown", onKeyDown],
    [doc, "wheel", onWheel],
    [doc, "focusin", onFocusIn as EventListener],
    [window, "resize", onResize],
  ];
}

function listen(on: boolean) {
  for (const [target, type, handler] of wiring()) {
    if (on) target.addEventListener(type, handler, WATCHING);
    else target.removeEventListener(type, handler, WATCHING);
  }
  if (on) return;
  if (moveTimer !== null) window.clearTimeout(moveTimer);
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  moveTimer = null;
  resizeTimer = null;
  moveReal = false;
  press = null;
  pointer.known = false;
  pointer.down = false;
  pointer.target = null;
}

/**
 * Asks for one more `move` call with the pointer where it is: something on the page moved (the
 * companion took a new seat), so what a resting mouse points at is somewhere else for the eyes.
 */
export function nudgeAttention(): void {
  if (watchers.size > 0) queueMove(false);
}

/** Starts watching (the listeners exist while at least one watcher does). Returns the way to stop. */
export function watchAttention(watcher: Watcher): () => void {
  watchers.add(watcher);
  if (watchers.size === 1) listen(true);
  return () => {
    if (!watchers.delete(watcher)) return;
    if (watchers.size === 0) listen(false);
  };
}
