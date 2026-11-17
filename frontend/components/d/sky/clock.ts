import { transitionRunning, whenTransitionEnds } from "@/components/d/motion/motion";
import { moonPhaseCss } from "./moon";
import { SKY_EDGE, skyTimeNow, type SkyTime } from "./time";

/*
 * The sky's clock (docs/ui-d-cinematic.md, section 4, "Day and night"). DScope starts it in its layout effect, so on
 * a client-side arrival it has marked the page before the browser paints. It keeps three things in step with the
 * real sky:
 *
 *   - `data-d-time` ("day" | "night") on the D root, which every night rule inside the page reads;
 *   - the same value on <html> (`html[data-d-time]`), for <html> and <body> themselves and the page transition's
 *     pseudo-elements. Always read together with `html[data-d-on]`, never alone;
 *   - D's own `<meta name="theme-color" data-d-time>`, first in <head>, so the browser's bar takes the top of the sky;
 *   - tonight's moon, `<style id="d-moon-phase">` in <head> (./moon.ts): written when D arrives without the boot
 *     script (a client-side arrival, a kept-alive return) and again only when the local date changes.
 *
 * On a hard load the boot script (time.ts, `bootSky`) has already marked the root, written D's meta and coloured
 * <html> and <body> with `<style id="d-time-boot">`. The clock copies the root's value instead of reading the clock
 * again (parse and hydration can straddle dusk; the next check then fades), and removes the boot style: the
 * `html[data-d-on]` rules take over from it.
 *
 * It looks again every 60 s, when the tab becomes visible and when a page comes back from the back-forward cache. A
 * change found while the tab is hidden or under reduced motion is applied at once; otherwise it is a live flip, at
 * most once in 15 minutes: `data-d-time-fade` on the root at once (the sky's 4 s cross-fade), `data-d-time` at
 * 2 s, and the fade mark off at 4.2 s. A page transition is never disturbed: no check (so no flip) starts while one
 * runs (it looks again when it ends), and <html> and the meta change only once it has ended; the root may change
 * under the cover. Every write happens only when the value differs. No React state, nothing per frame.
 */

/** How often the clock looks again. Cheap: a few lines of arithmetic, and a write only when night or day begins. */
const CHECK_EVERY_MS = 60_000;
/** The live cross-fade (the sky's night styles): the sky over 4 s, the words on it swap at the middle. */
const FADE_MS = 4_000;
const SWAP_AT_MS = 2_000;
/** After a live change, the next one waits at least this long: a sky that only grazes -6° does not blink. */
const HOLD_MS = 15 * 60_000;

const asTime = (value: string | null): SkyTime | null => (value === "day" || value === "night" ? value : null);

/** Starts the clock on the D root. Returns the cleanup DScope runs when the layout unmounts or is hidden. */
export function startSkyClock(root: HTMLElement): () => void {
  const html = document.documentElement;
  const head = document.head;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const timers: number[] = [];
  let lastLive = -Infinity;
  let meta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-d-time]');
  /** The <html> and meta write waiting for a page transition to end, and the check waiting likewise. */
  let edgesWait: (() => void) | undefined;
  let checkWait: (() => void) | undefined;
  /** The local date the moon was drawn for. */
  let moonDay = "";

  /** Tonight's moon: kept as the boot script drew it on a hard load (unless `redraw`), drawn now otherwise. */
  const drawMoon = (redraw: boolean) => {
    moonDay = new Date().toDateString();
    let phase = document.getElementById("d-moon-phase");
    if (phase && !redraw) return;
    if (!phase) {
      phase = document.createElement("style");
      phase.id = "d-moon-phase";
      head.appendChild(phase);
    }
    const css = moonPhaseCss(Date.now());
    if (phase.textContent !== css) phase.textContent = css;
  };

  /** <html>'s mirror and the browser's bar. Called only when no page transition runs. */
  const paintEdges = (time: SkyTime) => {
    if (html.getAttribute("data-d-time") !== time) html.setAttribute("data-d-time", time);
    if (!meta || !meta.isConnected) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.setAttribute("data-d-time", "");
      // Browsers use the first theme-color in tree order: D's goes before the layout's own.
      head.insertBefore(meta, head.querySelector('meta[name="theme-color"]'));
    }
    if (meta.content !== SKY_EDGE[time]) meta.content = SKY_EDGE[time];
  };
  /** The root at once; <html> and the meta once no page transition runs. */
  const settle = (time: SkyTime) => {
    if (root.getAttribute("data-d-time") !== time) root.setAttribute("data-d-time", time);
    edgesWait?.();
    edgesWait = whenTransitionEnds(() => {
      edgesWait = undefined;
      paintEdges(time);
    });
  };

  // Arriving. A hard load: the boot script's style is still in <head>, and the root carries its decision. A
  // client-side arrival or a return to a kept-alive layout: no boot style, so decide now. Either way no fade.
  const boot = document.getElementById("d-time-boot");
  const booted = boot ? asTime(root.getAttribute("data-d-time")) : null;
  settle(booted ?? skyTimeNow());
  boot?.remove();
  drawMoon(false);

  const check = () => {
    if (checkWait) return;
    if (transitionRunning()) {
      checkWait = whenTransitionEnds(() => {
        checkWait = undefined;
        check();
      });
      return;
    }
    if (new Date().toDateString() !== moonDay) drawMoon(true);
    const next = skyTimeNow();
    const shown = root.getAttribute("data-d-time") === "night" ? "night" : "day";
    if (next === shown || root.hasAttribute("data-d-time-fade")) return;
    const live = document.visibilityState === "visible" && !reduce.matches;
    if (!live) return settle(next);
    if (performance.now() - lastLive < HOLD_MS) return;
    lastLive = performance.now();
    root.setAttribute("data-d-time-fade", next);
    timers.push(window.setTimeout(() => settle(next), SWAP_AT_MS));
    timers.push(window.setTimeout(() => root.removeAttribute("data-d-time-fade"), FADE_MS + 200));
  };

  const interval = window.setInterval(check, CHECK_EVERY_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", check);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", check);
    timers.forEach((t) => window.clearTimeout(t));
    edgesWait?.();
    checkWait?.();
    // A fade cut short ends where it was going. The root keeps its value (it is hidden or gone).
    const going = asTime(root.getAttribute("data-d-time-fade"));
    if (going && root.getAttribute("data-d-time") !== going) root.setAttribute("data-d-time", going);
    if (root.hasAttribute("data-d-time-fade")) root.removeAttribute("data-d-time-fade");
    if (html.hasAttribute("data-d-time")) html.removeAttribute("data-d-time");
    meta?.remove();
    meta = null;
    document.getElementById("d-moon-phase")?.remove();
  };
}
