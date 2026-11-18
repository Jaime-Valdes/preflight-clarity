#!/usr/bin/env node
/*
 * The drawings and the sizes of version D's page transition, the cloud pass (docs/ui-d-cinematic.md, section 6).
 *
 *   node frontend/scripts/d-transition-art.mjs           rewrite the four generated blocks of app/d/d-transition.css
 *   node frontend/scripts/d-transition-art.mjs --check   change nothing; exit 1 if the stylesheet is out of date
 *
 * Either way it exits 2, and writes nothing, when a drawing, a size or the stylesheet breaks one of the rules it
 * checks. Both runs print the report: per band of screen widths, the margin the cut has inside the full-cover window,
 * that window, when the first cloud comes on screen and the last one leaves, and how fast the bank's edges travel.
 *
 * The stylesheet holds the rules; this script owns the four things in it that are worked out, not written:
 *
 *   1. bands  the bank's sizes per band of screen widths (--d-vt-k, --d-vt-m, --d-vt-gain, --d-vt-near-out,
 *             --d-vt-reach, --d-vt-far-line), from BANDS and the chains below;
 *   2. art    the paints, by day and by night: the haze (the colour of the bank's solid core and its wall) and one
 *             radial gradient per kind of disc (a near billow's body, underside and edge; a far billow's body and
 *             underside), from THEMES;
 *   3. far    the far clouds' background layers (the stage's group), from FAR and SHAPES;
 *   4. near   the near clouds' and the wall's background layers (the stage's new image), from NEAR, WALL and SHAPES.
 *
 * Every billow is drawn with discs: one background layer per circle of its shape and per copy (the edge behind, then
 * the underside, then the body on top), each a radial gradient in a tile as wide as the disc and as tall as the
 * chain's period, repeated down the box. No image: Safari paints the bank's backgrounds again in every frame of the
 * pass, and an SVG image costs it a whole frame or more each time (measured: about 600 ms of a 1.4 s pass lost with
 * the eight SVG billows, nothing measurable with these gradients).
 *
 * The model (section 6 of the contract): the far clouds ride the group, which travels from just off the left edge to
 * just off the right one; the near bank (the image-pair, a flat core, and the new image's billows and wall over it)
 * adds a little travel of its own (the parallax). The old page is cut by an opacity step at half the clock, and that
 * step must fall inside the window in which the near bank's solid part covers the whole screen. The clock (--d-vt)
 * and the easing (--d-vt-ease) are read from the stylesheet. No dependencies.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const cssPath = fileURLToPath(new URL("../app/d/d-transition.css", import.meta.url));

// ── The drawings: billows as unions of circles [cx, cy, r] in a box [width, height] ──────────────

/** `under`: the circles that make the billow's underside (the bottom of its silhouette), drawn again lower down. */
const SHAPES = {
  a: { box: [240, 160], circles: [[98, 66, 50], [148, 60, 46], [52, 100, 40], [192, 94, 38], [122, 108, 40]], under: [2, 3, 4] },
  b: { box: [200, 176], circles: [[100, 70, 50], [60, 112, 42], [144, 100, 42], [100, 128, 36]], under: [1, 2, 3] },
};

/**
 * The colours (every one between HSL 32° and 290°, or grey). A billow's circles are drawn as up to three copies: the
 * edge (each circle edgeGrow larger and EDGE_DY higher: a soft outline by day, moonlit tops by night; near clouds
 * only), the underside (the `under` circles UNDER_DY lower) and the body (each disc shaded from the top colour, held
 * to 45 % of its radius, to the bottom colour at its rim). haze: the core and the wall.
 */
const THEMES = {
  day: {
    haze: "#E9F4FD",
    near: { edge: "#CFE5F8", under: "#FCE7B4", top: "#FFFFFF", bottom: "#F4F9FE" },
    far: { under: "#D8E8F6", top: "#EDF6FD", bottom: "#E4F0FB" },
  },
  night: {
    haze: "#303D63",
    near: { edge: "#A9BCE2", under: "#2B3657", top: "#53649A", bottom: "#41507E" },
    far: { under: "#273152", top: "#37446C", bottom: "#323E66" },
  },
};
/** The copies' offsets in the shape's units (the same by day and by night: the layers are shared). */
const EDGE_GROW = 2.5;
const EDGE_DY = -2.5;
const UNDER_DY = 8;

// ── Where the billows go, in phone px (each band scales them by its k) ─────────────────────────────

/**
 * A chain is one billow every `period` px down the box (one background layer, repeat-y): shape, width w, its centre
 * `out` px outside the core's edge line (negative: over the core), the first centre `phase` px below the box top.
 * `at` instead of `out`: a share of the near box's width (the billows down the middle). `tail` is added to the phase
 * on the left (trailing) column, so the two edges are not mirror images.
 */
const NEAR = [
  { shape: "a", w: 206, period: 318, out: 20, phase: 20, tail: 140 },
  { shape: "b", w: 164, period: 270, out: 40, phase: 170, tail: 60 },
  { shape: "a", w: 184, period: 356, out: -8, phase: 260, tail: 200 },
  { shape: "a", w: 236, period: 452, at: 0.5, phase: 300 },
];
const FAR = [
  { shape: "b", w: 156, period: 282, out: -6, phase: 230, tail: 120 },
  { shape: "a", w: 178, period: 330, out: 8, phase: 60, tail: 200 },
];
/** The wall: two interleaved chains of discs in the haze colour on the core's edge, which hide its straight edge. */
const WALL = [
  { r: 56, period: 140, out: -10, phase: 0 },
  { r: 56, period: 140, out: -10, phase: 70 },
];

/**
 * From `min` px of screen width up: k scales every drawing and chain; m = mPx + mVw (in vw) is how far the core
 * overhangs each side of the screen at the cut; o is how far the far clouds' line sits outside the near edge line and
 * gain how much further the near bank travels than the far clouds (both in phone px, scaled by k).
 */
const BANDS = [
  { min: 0, k: 1, o: 34, mPx: 8, mVw: 9, gain: 64 },
  { min: 640, k: 1.25, o: 34, mPx: 8, mVw: 10, gain: 64 },
  { min: 1024, k: 1.6, o: 34, mPx: 8, mVw: 11, gain: 64 },
  { min: 1640, k: 2.1, o: 34, mPx: 8, mVw: 12, gain: 64 },
];

/** The widths every check walks, in 1 px steps. Wider screens keep the last band. */
const NARROWEST = 240;
const WIDEST = 2560;
/** How far off screen (px) every cloud is when the clock starts and when it stops. */
const CLEAR = 2;
/** The cut must fall at least this long after full cover begins and before it ends, on every width. */
const MARGIN_MS = 60;
/** The first cloud is on screen within this long of the start, and the last leaves within this long of the end. */
const EDGE_MS = 20;
/** The near layer must be solid at least this far (×k) past the core's edge line at every height. */
const WALL_MIN = 24;
/** The night look never gets brighter than this (relative luminance), and its haze, which fills the screen, darker still. */
const NIGHT_MAX = 0.5;
const NIGHT_HAZE_MAX = 0.06;
/**
 * What ships, minified the simple way: at most this many bytes, and gzipped this many. The pass's design budget was
 * 13 KB with eight SVG billows; drawn as about a hundred gradient discs instead (Safari repaints the bank in every
 * frame, see the top), it is longer as text but compresses as well, so the gzip budget is the one that holds.
 */
const WEIGHT_MAX = 19 * 1024;
const GZIP_MAX = 2.5 * 1024;

const problems = [];

// ── Geometry ────────────────────────────────────────────────────────────────────────────────

const bounds = (shape) => {
  const { circles } = SHAPES[shape];
  return {
    x0: Math.min(...circles.map(([x, , r]) => x - r)),
    x1: Math.max(...circles.map(([x, , r]) => x + r)),
    y0: Math.min(...circles.map(([, y, r]) => y - r)),
    y1: Math.max(...circles.map(([, y, r]) => y + r)),
  };
};
const scaleOf = (chain) => chain.w / SHAPES[chain.shape].box[0];
/** The edge stroke and the edge and underside shifts stay within this many units of the circles. */
const PAD = 4;
const reachOut = (chain) => (chain.at !== undefined ? -Infinity : chain.out + (SHAPES[chain.shape].box[0] / 2) * scaleOf(chain));
/** How far the near clouds (and the wall) reach past the core's edge line, and the far clouds past theirs (phone px). */
const NEAR_OUT = Math.ceil(Math.max(...NEAR.map(reachOut), ...WALL.map((d) => d.out + d.r)));
const FAR_OUT = Math.ceil(Math.max(...FAR.map(reachOut)));

/** The least depth (px past the edge line) at which the wall's discs are solid, over every height. */
function solidDepth(discs, height = 6000) {
  let least = Infinity;
  for (let y = 0; y < height; y += 0.5) {
    const spans = [];
    for (const d of discs) {
      const n = Math.floor((y - d.phase) / d.period);
      for (const j of [n - 1, n, n + 1]) {
        const dy = y - (d.phase + j * d.period);
        if (Math.abs(dy) < d.r) {
          const w = Math.sqrt(d.r * d.r - dy * dy);
          spans.push([d.out - w, d.out + w]);
        }
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let reach = null;
    for (const [a, b] of spans) {
      if (reach === null) {
        if (a <= 0 && b >= 0) reach = b;
      } else if (a <= reach) reach = Math.max(reach, b);
    }
    if (reach === null) return { depth: -Infinity, at: y };
    least = Math.min(least, reach);
  }
  return { depth: least };
}
const SOLID = solidDepth(WALL);

function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 44; i++) {
      const mid = (lo + hi) / 2;
      if (X(mid) < t) lo = mid;
      else hi = mid;
    }
    return Y((lo + hi) / 2);
  };
}

// ── The clock, from the stylesheet, and the motion: in, a held moment, out ───────────────────────

const css = readFileSync(cssPath, "utf8");
const clockMatch = css.match(/--d-vt:\s*([\d.]+)(ms|s)\s*;/);
const CLOCK = clockMatch ? Number(clockMatch[1]) * (clockMatch[2] === "s" ? 1000 : 1) : NaN;
if (!Number.isFinite(CLOCK) || CLOCK <= 0) problems.push("the stylesheet has no --d-vt: …ms (or …s)");

/**
 * The bank comes in over the first part of the clock (IN), stands still at full cover for HOLD_MS (the bank's middle
 * on the screen's middle), and goes out over the rest (OUT, IN's mirror image). IN starts at 0.43x its half's mean
 * speed (never from rest, so a cloud is on screen at once) and comes to rest at full cover; OUT leaves from rest and
 * ends at 0.43x. The cut (50 % of the clock) is the middle of the hold.
 */
const HOLD_MS = 200;
const IN = [0.3, 0.13, 0.6, 1];
const OUT = [1 - IN[2], 1 - IN[3], 1 - IN[0], 1 - IN[1]];
/** The sky comes back this long into the hold: its one costly frame falls while nothing moves (d-vt-sky). */
const SKY_BACK_INTO_HOLD = 0;
/**
 * At least this much of the hold is left after the sky comes back, for that frame: WebKit took 80 to 95 ms to draw
 * the flight scene's sky and 134 to 168 ms for the results scene's (measured), which a 150 ms hold could not hold.
 */
const SKY_FRAME_MS = 180;
const inMs = (CLOCK - HOLD_MS) / 2;
const HOLD_FROM = inMs / CLOCK;
const HOLD_TO = (inMs + HOLD_MS) / CLOCK;
const SKY_BACK = (inMs + SKY_BACK_INTO_HOLD) / CLOCK;
const easeIn = bezier(IN);
const easeOut = bezier(OUT);
/** The bank's progress (0 to 1 of its travel) at clock fraction x. */
const progress = (x) => (x < HOLD_FROM ? 0.5 * easeIn(x / HOLD_FROM) : x <= HOLD_TO ? 0.5 : 0.5 + 0.5 * easeOut((x - HOLD_TO) / (1 - HOLD_TO)));
const invert = (f, y) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
/** The clock fraction at which the bank reaches progress p (the hold's start for p = 0.5 on the way in). */
const inverse = (p) => (p <= 0.5 ? HOLD_FROM * invert(easeIn, Math.max(0, 2 * p)) : HOLD_TO + (1 - HOLD_TO) * invert(easeOut, Math.min(1, 2 * p - 1)));

/** Everything about the pass on a screen W px wide (times in ms from the clock's start). */
function geometry(W) {
  const b = BANDS.findLast((x) => W >= x.min);
  const k = b.k;
  const m = b.mPx + (b.mVw / 100) * W;
  const C = W + 2 * m;
  const near = NEAR_OUT * k;
  const reach = Math.max(near, (b.o + FAR_OUT) * k);
  const G = C + 2 * reach;
  const gain = b.gain * k;
  const from = -G - CLEAR;
  const to = W + CLEAR;
  const span = to - from + gain;
  /** The near core's left edge at progress 0. */
  const start = from + reach - gain / 2;
  const solid = SOLID.depth * k;
  const t = (p) => inverse(Math.min(1, Math.max(0, p))) * CLOCK;
  const speed = (x) => {
    const h = 1e-4;
    const a = Math.max(0, x - h);
    const z = Math.min(1, x + h);
    return (((progress(z) - progress(a)) / (z - a)) * span) / (CLOCK / 1000);
  };
  let vPeak = 0;
  for (let x = 0; x <= 1; x += 0.002) vPeak = Math.max(vPeak, speed(x));
  const coverDone = t((W - solid - C - start) / span);
  const revealStarts = t((solid - start) / span);
  return {
    W,
    band: b,
    k,
    coverDone,
    revealStarts,
    margin: Math.min(CLOCK / 2 - coverDone, revealStarts - CLOCK / 2),
    firstMs: t((1 + CLEAR) / (to - from)),
    lastMs: CLOCK - t(1 - (1 + CLEAR) / (to - from)),
    vMean: span / ((CLOCK - HOLD_MS) / 1000),
    vStart: speed(0.0005),
    vPeak,
  };
}

// ── Checks on the drawings, the chains and the colours ─────────────────────────────────────────

// 1. Tiles: a billow never touches its tile's top or bottom, so a seam at a fractional device-pixel size can only
//    fall on a transparent row.
for (const chain of [...NEAR, ...FAR]) {
  const bb = bounds(chain.shape);
  const tall = (bb.y1 - bb.y0 + 2 * PAD + 12) * scaleOf(chain);
  if (chain.period < tall) problems.push(`chain ${chain.shape} w${chain.w}: its billows would reach their tile's edge (period ${chain.period} < ${Math.ceil(tall)})`);
}
for (const d of WALL) if (d.period < 2 * d.r + 4) problems.push(`wall r${d.r}: its discs would touch their tile's edge`);
// 2. The wall: solid past the core's edge line at every height.
if (!(SOLID.depth >= WALL_MIN)) problems.push(`wall: solid only ${SOLID.depth === -Infinity ? "nowhere" : `${SOLID.depth.toFixed(1)} px`} past the core's edge (at least ${WALL_MIN})${SOLID.at !== undefined ? `, uncovered at ${SOLID.at} px` : ""}`);

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function hue(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const colours = (look) => [look.haze, ...["edge", "under", "top", "bottom"].flatMap((key) => [look.near[key], look.far[key]])].filter(Boolean);
// 4. Hues: the house rule (d-contrast.mjs's test).
for (const [theme, look] of Object.entries(THEMES)) {
  for (const c of colours(look)) {
    const h = hue(c);
    if (h !== null && (h < 32 || h > 290)) problems.push(`${theme} ${c}: hue ${h.toFixed(1)}° is red, pink or orange`);
  }
}
// 5. Night: no bright frame.
for (const c of colours(THEMES.night)) if (luminance(c) > NIGHT_MAX) problems.push(`night ${c}: luminance ${luminance(c).toFixed(3)} is above ${NIGHT_MAX}`);
if (luminance(THEMES.night.haze) > NIGHT_HAZE_MAX) problems.push(`night haze ${THEMES.night.haze}: luminance ${luminance(THEMES.night.haze).toFixed(3)} is above ${NIGHT_HAZE_MAX}`);

// 3. Every width: the cut inside full cover with room either side, and no dead time at either end.
const perBand = new Map();
if (Number.isFinite(CLOCK) && CLOCK > 0) {
  for (let W = NARROWEST; W <= WIDEST; W++) {
    const g = geometry(W);
    if (g.margin < MARGIN_MS) problems.push(`at ${W} px the cut has only ${g.margin.toFixed(1)} ms of full cover on one side (at least ${MARGIN_MS})`);
    if (g.firstMs > EDGE_MS) problems.push(`at ${W} px the first cloud comes on screen ${g.firstMs.toFixed(1)} ms after the start (at most ${EDGE_MS})`);
    if (g.lastMs > EDGE_MS) problems.push(`at ${W} px the last cloud leaves ${g.lastMs.toFixed(1)} ms before the end (at most ${EDGE_MS})`);
    const list = perBand.get(g.band) ?? [];
    list.push(g);
    perBand.set(g.band, list);
  }
}

// ── The four generated blocks ───────────────────────────────────────────────────────────────

const f = (n) => String(Math.round(n * 10) / 10);
const r2 = (n) => String(Math.round(n * 100) / 100);
/** n phone px, scaled by the band (--d-vt-u is k px). */
const u = (n) => (Math.abs(n) < 0.05 ? "0" : `calc(${f(n)}*var(--d-vt-u))`);

function bandsCss() {
  const lines = [];
  for (const b of BANDS) {
    const reach = Math.max(NEAR_OUT, b.o + FAR_OUT);
    const d = [
      `--d-vt-k: ${b.k};`,
      `--d-vt-u: ${b.k}px;`,
      `--d-vt-m: calc(${b.mPx}px + ${b.mVw}vw);`,
      `--d-vt-gain: ${r2(b.gain * b.k)}px;`,
      `--d-vt-near-out: ${r2(NEAR_OUT * b.k)}px;`,
      `--d-vt-reach: ${r2(reach * b.k)}px;`,
      `--d-vt-far-line: ${r2((reach - b.o) * b.k)}px;`,
    ];
    if (b.min === 0) lines.push("html[data-d-on] {", ...d.map((x) => `  ${x}`), "}");
    else lines.push(`@media (min-width: ${b.min}px) {`, "  html[data-d-on] {", ...d.map((x) => `    ${x}`), "  }", "}");
  }
  return lines.join("\n");
}

/** A disc filling its tile's width: a flat colour, or shaded from `top` (held to 45 %) to `bottom` at the rim. */
const disc = (top, bottom = top) => `radial-gradient(circle closest-side, ${top === bottom ? top : `${top} 45%, ${bottom}`} calc(100% - 1px), #0000)`;
/** The paints: the wall (w), and a near (n) or far (f) billow's body (b), underside (u) and edge (e). */
function paints(theme) {
  const { haze, near, far } = THEMES[theme];
  return [
    `--d-vt-haze: ${haze};`,
    `--d-vt-w: ${disc(haze)};`,
    `--d-vt-nb: ${disc(near.top, near.bottom)};`,
    `--d-vt-nu: ${disc(near.under)};`,
    `--d-vt-ne: ${disc(near.edge)};`,
    `--d-vt-fb: ${disc(far.top, far.bottom)};`,
    `--d-vt-fu: ${disc(far.under)};`,
  ];
}
function artCss() {
  return [
    "html[data-d-on]::view-transition-group(.d-cloud-pass) {",
    ...paints("day").map((x) => `  ${x}`),
    "}",
    'html[data-d-on][data-d-time="night"]::view-transition-group(.d-cloud-pass) {',
    ...paints("night").map((x) => `  ${x}`),
    "}",
  ].join("\n");
}

/**
 * One disc chain as a background layer: a disc of radius r (phone px) whose centre is `x` px in from the box's
 * `side` (or `x` px right of the middle, for side "middle") and `y` px below the top, once every `period` px.
 */
function discLayer(paint, side, x, y, r, period) {
  const pos = side === "middle" ? `left calc(50% + ${f(x)}*var(--d-vt-u))` : `${side} ${u(x - r)}`;
  return `var(--d-vt-${paint}) ${pos} top ${u(y - period / 2)}/${u(2 * r)} ${u(period)}`;
}
/**
 * A billow chain as disc layers, front to back: the bodies, the undersides, the edges (near only; the chain down
 * the middle of the near bank is bodies only, over the haze). `line`: how far in
 * from the box's side the edge line is (phone px); the billow's centre is `out` outside it.
 */
function chainLayers(chain, side, line, depth) {
  const shape = SHAPES[chain.shape];
  const s = scaleOf(chain);
  const phase = chain.phase + (side === "left" ? (chain.tail ?? 0) : 0);
  const [bw, bh] = shape.box;
  // The disc's centre, in from the box's side (the right column is drawn as the left one's mirror image, so the
  // two edges do not look the same).
  const place = (cx, cy) => {
    const dx = (cx - bw / 2) * s;
    const x = side === "middle" ? dx : line - chain.out + (side === "left" ? dx : -dx);
    return [x, phase + (cy - bh / 2) * s];
  };
  const out = [];
  const d = depth[0];
  for (const [cx, cy, r] of shape.circles) out.push(discLayer(`${d}b`, side, ...place(cx, cy), r * s, chain.period));
  if (side === "middle") return out;
  for (const i of shape.under) {
    const [cx, cy, r] = shape.circles[i];
    out.push(discLayer(`${d}u`, side, ...place(cx, cy + UNDER_DY), r * s, chain.period));
  }
  if (depth === "near") {
    for (const [cx, cy, r] of shape.circles) out.push(discLayer("ne", side, ...place(cx, cy + EDGE_DY), (r + EDGE_GROW) * s, chain.period));
  }
  return out;
}
/** Every layer repeats down the box only: one background-repeat value serves the whole list. */
const background = (layers) => ["  background:", ...layers.map((l, i) => `    ${l}${i === layers.length - 1 ? ";" : ","}`), "  background-repeat: repeat-y;"].join("\n");
/** The far clouds' line, in from the group's ends (phone px; the same in every band). */
const FAR_LINE = Math.max(NEAR_OUT, BANDS[0].o + FAR_OUT) - BANDS[0].o;
function farCss() {
  return background([...FAR.flatMap((c) => chainLayers(c, "right", FAR_LINE, "far")), ...FAR.flatMap((c) => chainLayers(c, "left", FAR_LINE, "far"))]);
}
function nearCss() {
  const edge = NEAR.filter((c) => c.at === undefined);
  const wall = (side) => WALL.map((d) => discLayer("w", side, NEAR_OUT - d.out, d.phase, d.r, d.period));
  return background([
    ...NEAR.filter((c) => c.at !== undefined).flatMap((c) => chainLayers(c, "middle", 0, "near")),
    ...edge.flatMap((c) => chainLayers(c, "right", NEAR_OUT, "near")),
    ...edge.flatMap((c) => chainLayers(c, "left", NEAR_OUT, "near")),
    ...wall("right"),
    ...wall("left"),
  ]);
}

const pct = (x) => `${Math.round(x * 10000) / 100}%`;
const bez = (c) => `cubic-bezier(${c.join(", ")})`;
/**
 * The keyframes of the bank's two depths and of the sky's lever, from the clock and the hold. The lever keeps the sky
 * drawn at its very start: the old page is captured in that first frame, sky and all (it leaves the render tree from
 * the next frame, before the transition shows anything).
 */
function motionCss() {
  const keyframes = (name, from, middle, to) =>
    [
      `@keyframes ${name} {`,
      "  0% {",
      `    translate: ${from} 0;`,
      `    animation-timing-function: ${bez(IN)};`,
      "  }",
      `  ${pct(HOLD_FROM)} {`,
      `    translate: ${middle} 0;`,
      "  }",
      `  ${pct(HOLD_TO)} {`,
      `    translate: ${middle} 0;`,
      `    animation-timing-function: ${bez(OUT)};`,
      "  }",
      "  100% {",
      `    translate: ${to} 0;`,
      "  }",
      "}",
    ].join("\n");
  return [
    keyframes("d-vt-far", `calc(-1 * var(--d-vt-g) - ${CLEAR}px)`, "calc((100vw - var(--d-vt-g)) / 2)", `calc(100vw + ${CLEAR}px)`),
    keyframes("d-vt-near", "calc(var(--d-vt-gain) / -2)", "0", "calc(var(--d-vt-gain) / 2)"),
    "@keyframes d-vt-sky {",
    "  0% {",
    "    display: block;",
    "  }",
    "  0.01%,",
    `  ${pct(SKY_BACK)} {`,
    "    display: none;",
    "  }",
    `  ${pct(SKY_BACK + 0.0001)},`,
    "  100% {",
    "    display: block;",
    "  }",
    "}",
  ].join("\n");
}

/** Replaces what stands between the two marker comments of a block; the markers stay. */
function fill(source, name, body) {
  const pattern = new RegExp(`(/\\* generated:${name}(?! end)[^\\n]*\\*/)[\\s\\S]*?\\n([ \\t]*/\\* generated:${name} end \\*/)`);
  if (!pattern.test(source)) {
    problems.push(`the stylesheet has no "generated:${name}" block`);
    return source;
  }
  return source.replace(pattern, (_, open, close) => `${open}\n${body}\n${close}`);
}
const next = [
  ["bands", bandsCss()],
  ["art", artCss()],
  ["far", farCss()],
  ["near", nearCss()],
  ["motion", motionCss()],
].reduce((source, [name, body]) => fill(source, name, body), css);

// 7. Weight: what ships (comments dropped, whitespace collapsed).
const minified = next
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{};,])\s*/g, "$1")
  .trim();
const weight = Buffer.byteLength(minified);
const gzipped = gzipSync(minified, { level: 9 }).length;
if (weight > WEIGHT_MAX) problems.push(`the stylesheet ships ${weight} B minified (at most ${WEIGHT_MAX})`);
if (gzipped > GZIP_MAX) problems.push(`the stylesheet ships ${gzipped} B gzipped (at most ${GZIP_MAX})`);

// 8. Anchors: the hand-written rules still say what the model assumes.
for (const text of [
  "top: -10lvh;",
  "height: 120lvh;",
  "width: var(--d-vt-g);",
  "--d-vt-core: calc(100vw + 2 * var(--d-vt-m));",
  "--d-vt-g: calc(var(--d-vt-core) + 2 * var(--d-vt-reach));",
  "inset: 0 auto 0 var(--d-vt-reach);",
  "inset: 0 auto 0 calc(-1 * var(--d-vt-near-out));",
  "animation: d-vt-far var(--d-vt) linear both;",
  "animation: d-vt-near var(--d-vt) linear both;",
  "animation: d-vt-sky var(--d-vt) linear both;",
]) {
  if (!css.includes(text)) problems.push(`the stylesheet no longer says "${text}", which the model assumes`);
}
const cut = css.match(/@keyframes d-vt-cut\s*\{[\s\S]*?\n\}/);
if (!cut || !/0%,\s*50%\s*\{\s*opacity:\s*1;\s*\}\s*50\.01%,\s*100%\s*\{\s*opacity:\s*0;/.test(cut[0])) problems.push('the stylesheet\'s "d-vt-cut" no longer steps at 50.01 % of the clock');
// The sky comes back inside the hold, with time for its frame before the bank moves on, and before anything is
// uncovered on any width (DPageTransition starts the sky's clock with the bank's).
{
  const back = SKY_BACK * CLOCK;
  const firstReveal = Math.min(...[...perBand.values()].flat().map((g) => g.revealStarts));
  if (back < HOLD_FROM * CLOCK || HOLD_TO * CLOCK - back < SKY_FRAME_MS) problems.push(`the sky comes back at ${Math.round(back)} ms, not early enough inside the hold (${Math.round(HOLD_FROM * CLOCK)}–${Math.round(HOLD_TO * CLOCK)} ms)`);
  if (firstReveal - back < MARGIN_MS) problems.push(`the sky comes back only ${Math.round(firstReveal - back)} ms before the bank starts to uncover the page`);
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────

const ms = (n) => String(Math.round(n));
console.log(`The cloud pass: clock ${CLOCK} ms: in over ${Math.round(inMs)} ms (${bez(IN)}), held at full cover ${Math.round(HOLD_FROM * CLOCK)}–${Math.round(HOLD_TO * CLOCK)} ms, out over ${Math.round(inMs)} ms (${bez(OUT)}); the cut at ${CLOCK / 2} ms; the sky back at ${Math.round(SKY_BACK * CLOCK)} ms.`);
console.log(`Near clouds reach ${NEAR_OUT} px past the core's edge, far clouds ${FAR_OUT} px past theirs; the wall is solid ${SOLID.depth.toFixed(1)} px deep (×k).\n`);
console.log("  band (px)     k     cut margin (ms)   full cover (ms)   first cloud / last gone   mean / start / peak edge speed (px/s)");
for (const [band, list] of perBand) {
  const lo = list[0];
  const hi = list[list.length - 1];
  const margins = list.map((g) => g.margin);
  const first = Math.max(...list.map((g) => g.firstMs));
  const last = Math.max(...list.map((g) => g.lastMs));
  // The window every width of the band shares: full cover from the latest start to the earliest end.
  const cover = `${ms(Math.max(...list.map((g) => g.coverDone)))}–${ms(Math.min(...list.map((g) => g.revealStarts)))}`;
  console.log(
    `  ${`${lo.W}–${hi.W}`.padEnd(12)} ${String(band.k).padStart(4)}   ${`${ms(Math.min(...margins))}–${ms(Math.max(...margins))}`.padStart(9)}         ${cover.padStart(9)}         ≤ ${ms(first)} / ≥ ${ms(CLOCK - last)}`.padEnd(88) +
      `${lo.W} px: ${ms(lo.vMean)} / ${ms(lo.vStart)} / ${ms(lo.vPeak)}; ${hi.W} px: ${ms(hi.vMean)} / ${ms(hi.vStart)} / ${ms(hi.vPeak)}`,
  );
}
console.log(`\n  ships ${(weight / 1024).toFixed(1)} KB minified, ${(gzipped / 1024).toFixed(2)} KB gzipped (at most ${WEIGHT_MAX / 1024} and ${GZIP_MAX / 1024})\n`);

// --window <width,…>: the full-cover window of each width (for the browser checks).
const windowArg = process.argv.indexOf("--window");
if (windowArg > 0) {
  for (const w of (process.argv[windowArg + 1] ?? "").split(",").map(Number).filter(Boolean)) {
    const g = geometry(w);
    console.log(`window ${w}: ${g.coverDone.toFixed(1)}–${g.revealStarts.toFixed(1)} ms`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`PROBLEM: ${p}`);
  process.exit(2);
}
if (process.argv.includes("--check")) {
  if (next !== css) {
    console.error("app/d/d-transition.css is out of date: run node frontend/scripts/d-transition-art.mjs");
    process.exit(1);
  }
  console.log("app/d/d-transition.css is up to date.");
} else if (next !== css) {
  writeFileSync(cssPath, next);
  console.log("Rewrote the generated blocks of app/d/d-transition.css.");
} else {
  console.log("app/d/d-transition.css is already up to date.");
}
