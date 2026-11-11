#!/usr/bin/env node
/*
 * The drawings and the travel table of version D's page transition (docs/ui-d-cinematic.md, section 6).
 *
 *   node frontend/scripts/d-transition-art.mjs           rewrite the two generated blocks of app/d/d-transition.css
 *   node frontend/scripts/d-transition-art.mjs --check   change nothing; exit 1 if the stylesheet is out of date
 *
 * Either way it exits 2, and writes nothing, when a drawing or a size breaks one of the rules it checks.
 *
 * The stylesheet holds the rules; this script owns the two things in it that are worked out, not written:
 *
 *   1. The artwork: the ribbon of cloud, the loose puffs behind it and the paper plane, as three inline SVG data
 *      URIs. To redraw one, edit its table below (RIBBON, PUFFS, PLANE) and run the script.
 *   2. The travel: where the seam starts and ends on each screen width (--d-vt-from, --d-vt-to), with the sizes it
 *      follows from (--d-vt-ribbon, --d-vt-plane, --d-vt-lead). The seam has to start with the plane's nose just
 *      left of the screen and end with the last puff just right of it, or the visitor waits on an empty screen at
 *      one end or the other. The art is sized in px and the travel in vw, so one pair of numbers only fits a band
 *      of widths: the script cuts as many bands as it takes to keep that wait under LIMIT_MS. To change a size,
 *      edit SIZES and run the script.
 *
 * Both runs print the travel table. No dependencies.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cssPath = fileURLToPath(new URL("../app/d/d-transition.css", import.meta.url));

// ── Sizes ────────────────────────────────────────────────────────────────────────────────────

/**
 * From `min` px of screen width up: the ribbon's width, the plane's length (nose to tail, without the contrail)
 * and how far the middle of the plane flies ahead of the seam. Lengths are "…px" or "…vw". The plane has to stay
 * clear of the ribbon: lead > ribbon / 2 + plane / 2.
 */
const SIZES = [
  { min: 0, ribbon: "30vw", plane: "52px", lead: "30vw" },
  { min: 400, ribbon: "120px", plane: "52px", lead: "120px" },
  { min: 1024, ribbon: "176px", plane: "72px", lead: "171px" },
];
/** The narrowest and the widest screen the table is worked out for. Wider screens keep the last band. */
const NARROWEST = 320;
const WIDEST = 2560;
/** The longest the screen may stand empty at either end of the crossing; a new band starts where it would be passed. */
const LIMIT_MS = 45;
/** How far off screen the art is at both ends, at the narrowest width of a band (px). */
const CLEAR = 2;

// ── The ribbon: one tile, 176 units wide (so a unit is a px from 1024 px up), repeated downwards ─────────────

const RIBBON = {
  width: 176,
  /** Three times the width, so the repeat is hard to spot. */
  height: 528,
  /** The flat white middle. The stylesheet lays a plain white band of this width (0.34 of the ribbon) under it. */
  core: [58, 118],
  /** Lobes down the leading (right) edge: [y, how far the lobe reaches from the centre line, radius]. */
  lead: [
    [18, 70, 38],
    [84, 80, 48],
    [150, 60, 28],
    [200, 74, 40],
    [268, 66, 34],
    [330, 80, 48],
    [402, 62, 30],
    [456, 76, 42],
    [508, 62, 28],
  ],
  /** Lobes down the trailing (left) edge, the lee side. */
  lee: [
    [40, 76, 44],
    [108, 60, 30],
    [162, 72, 40],
    [232, 78, 48],
    [302, 58, 28],
    [352, 70, 38],
    [420, 76, 46],
    [494, 62, 34],
  ],
  white: "#fff",
  /** The lee side's underside: each trailing lobe again in cream, further out and lower by these shares of its radius, so big lobes get a wide warm crescent. */
  cream: { fill: "#FFEFC8", out: 0.2, down: 0.17 },
  /** The same on the leading edge in a pale sky tint, so the cloud keeps an edge over paper cards. */
  rim: { fill: "#E3F1FC", out: 0.14, down: 0.18 },
};

// ── The puffs: loose cloudlets behind the ribbon, on a taller tile so they do not repeat in step with it ─────

const PUFFS = {
  /** The same units as the ribbon; the tile's right edge lies on the seam. */
  width: 176,
  height: 704,
  /** [how far behind the seam, y, radius]. Each is two lobes with the same cream underside. */
  list: [
    [96.8, 70, 11],
    [122.8, 250, 7],
    [102.8, 540, 9.5],
  ],
};

// ── The plane: D's paper plane (components/d/brand/FlightPath.tsx), nose up, with a short gold contrail ──────

const PLANE = {
  /** Outline, nose first. The plane's length is nose to tail: 20 units. */
  body: [[11, 0], [-9, -7], [-5, 0], [-9, 7]],
  fold: [[-5, 0], [3.5, 0]],
  contrail: [[[-12.5, 0], [-21, 0]], [[-25, 0], [-28.5, 0]]],
  /** Degrees nose-up. */
  pitch: 5,
  fill: "#fff",
  ink: "#14213D",
  gold: "#FFC53D",
  stroke: { body: 1.3, fold: 1.1, contrail: 2.2 },
};

// ── Drawing ──────────────────────────────────────────────────────────────────────────────────

const f = (n) => String(Math.round(n * 10) / 10);
const circle = (cx, cy, r) => `<circle cx='${f(cx)}' cy='${f(cy)}' r='${f(r)}'/>`;
/** A circle plus the copies that keep a tile seamless where the circle crosses its top or bottom. */
const wrapped = (cx, cy, r, height) => circle(cx, cy, r) + (cy - r < 0 ? circle(cx, cy + height, r) : "") + (cy + r > height ? circle(cx, cy - height, r) : "");

function ribbonSvg() {
  const { width: W, height: H, core, lead, lee, white, cream, rim } = RIBBON;
  const C = W / 2;
  const leadWhite = lead.map(([y, reach, r]) => wrapped(C + reach - r, y, r, H)).join("");
  const leeWhite = lee.map(([y, reach, r]) => wrapped(C - reach + r, y, r, H)).join("");
  const leeCream = lee.map(([y, reach, r]) => wrapped(C - reach + r - r * cream.out, y + r * cream.down, r, H)).join("");
  const leadRim = lead.map(([y, reach, r]) => wrapped(C + reach - r + r * rim.out, y + r * rim.down, r, H)).join("");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><g fill='${rim.fill}'>${leadRim}</g><g fill='${cream.fill}'>${leeCream}</g><g fill='${white}'><rect x='${core[0]}' y='-1' width='${core[1] - core[0]}' height='${H + 2}'/>${leadWhite}${leeWhite}</g></svg>`;
}

/** The second, smaller lobe of a puff and the cream copies: offsets in radii. */
const PUFF_LOBE = { dx: -1.05, dy: 0.3, r: 0.66 };
const PUFF_CREAM = [{ dx: -0.22, dy: 0.2 }, { dx: -0.16, dy: 0.16 }];

function puffsSvg() {
  const { width: W, height: H, list } = PUFFS;
  const white = list.map(([behind, y, r]) => circle(W - behind, y, r) + circle(W - behind + r * PUFF_LOBE.dx, y + r * PUFF_LOBE.dy, r * PUFF_LOBE.r)).join("");
  const cream = list
    .map(([behind, y, r]) => circle(W - behind + r * PUFF_CREAM[0].dx, y + r * PUFF_CREAM[0].dy, r) + circle(W - behind + r * (PUFF_LOBE.dx + PUFF_CREAM[1].dx), y + r * (PUFF_LOBE.dy + PUFF_CREAM[1].dy), r * PUFF_LOBE.r))
    .join("");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><g fill='${RIBBON.cream.fill}'>${cream}</g><g fill='${RIBBON.white}'>${white}</g></svg>`;
}

/** The plane's length in its own units, and the middle of its body. */
const planeLength = Math.max(...PLANE.body.map(([x]) => x)) - Math.min(...PLANE.body.map(([x]) => x));
const planeMiddle = (Math.max(...PLANE.body.map(([x]) => x)) + Math.min(...PLANE.body.map(([x]) => x))) / 2;
/**
 * The drawing's box, in plane lengths, around the middle of the body. The stylesheet sizes and places the drawing
 * by these three numbers (2.5 wide; the middle 1.75 from the left edge and 0.5 from the top): change both together.
 */
const PLANE_BOX = { width: 2.5, left: 1.75, height: 1, top: 0.5 };

const path = (points, close) => "M" + points.map(([x, y], i) => `${i ? "L" : ""}${f(x)} ${f(y)}`).join("") + (close ? "Z" : "");

function planeSvg() {
  const { body, fold, contrail, pitch, fill, ink, gold, stroke } = PLANE;
  const box = [planeMiddle - PLANE_BOX.left * planeLength, -PLANE_BOX.top * planeLength, PLANE_BOX.width * planeLength, PLANE_BOX.height * planeLength];
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${box.map(f).join(" ")}'><g transform='rotate(${-pitch} ${f(planeMiddle)} 0)'>` +
    `<path d='${contrail.map((line) => path(line)).join("")}' fill='none' stroke='${gold}' stroke-width='${stroke.contrail}' stroke-linecap='round'/>` +
    `<path d='${path(body, true)}' fill='${fill}' stroke='${ink}' stroke-width='${stroke.body}' stroke-linejoin='round'/>` +
    `<path d='${path(fold)}' fill='none' stroke='${ink}' stroke-width='${stroke.fold}' stroke-linecap='round'/></g></svg>`
  );
}

const uri = (svg) => `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;

// ── What the drawings reach, for the travel ──────────────────────────────────────────────────

/** A point of the plane after its pitch, relative to the middle of the body. */
function pitched([x, y]) {
  const a = (-PLANE.pitch * Math.PI) / 180;
  const dx = x - planeMiddle;
  return [dx * Math.cos(a) - y * Math.sin(a), dx * Math.sin(a) + y * Math.cos(a)];
}
/** Every painted extreme of the plane, as [x, y, half the line's width]. */
const planeInk = [...PLANE.body.map((p) => [...pitched(p), PLANE.stroke.body / 2]), ...PLANE.contrail.flat().map((p) => [...pitched(p), PLANE.stroke.contrail / 2])];
/** How far the nose is ahead of the middle of the body, in plane lengths. */
const noseAhead = Math.max(...planeInk.map(([x, , w]) => x + w)) / planeLength;
/** How far a puff's paint reaches behind the seam: its smaller lobe's cream copy is the last of it. */
const puffReach = ([behind, , r]) => behind - r * (PUFF_LOBE.dx + PUFF_CREAM[1].dx - PUFF_LOBE.r);
/** How far the last puff trails the seam, in ribbon widths. */
const puffBehind = Math.max(...PUFFS.list.map(puffReach)) / RIBBON.width;

// ── Checks on the drawings ───────────────────────────────────────────────────────────────────

const problems = [];

/** Where two neighbouring lobes meet, measured from the centre line: the valley between them. */
function valleys(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = i + 1 < list.length ? list[i + 1] : [list[0][0] + RIBBON.height, list[0][1], list[0][2]];
    const ax = a[1] - a[2];
    const bx = b[1] - b[2];
    const d = Math.hypot(b[0] - a[0], bx - ax);
    const along = (a[2] ** 2 - b[2] ** 2 + d ** 2) / (2 * d);
    const h2 = a[2] ** 2 - along ** 2;
    if (h2 <= 0) {
      out.push(null);
      continue;
    }
    out.push(ax + ((bx - ax) * along) / d + (Math.sqrt(h2) * (b[0] - a[0])) / d);
  }
  return out;
}
{
  const half = (RIBBON.core[1] - RIBBON.core[0]) / 2;
  for (const [side, list, shade] of [["leading", RIBBON.lead, RIBBON.rim], ["trailing", RIBBON.lee, RIBBON.cream]]) {
    valleys(list).forEach((depth, i) => {
      if (depth === null) problems.push(`ribbon, ${side} edge: lobes ${i} and ${i + 1} do not meet, so the edge has a gap`);
      else if (depth < half) problems.push(`ribbon, ${side} edge: the valley after lobe ${i} is ${f(depth)} from the centre line, inside the flat core (${half})`);
    });
    for (const [y, reach, r] of list) if (reach + r * shade.out > RIBBON.width / 2) problems.push(`ribbon, ${side} edge: the lobe at y ${y} reaches past the tile`);
  }
  const box = { left: -PLANE_BOX.left, right: PLANE_BOX.width - PLANE_BOX.left, top: -PLANE_BOX.top, bottom: PLANE_BOX.height - PLANE_BOX.top };
  for (const [x, y, w] of planeInk) {
    if ((x - w) / planeLength < box.left || (x + w) / planeLength > box.right || (y - w) / planeLength < box.top || (y + w) / planeLength > box.bottom) problems.push(`plane: a point at ${f(x)}, ${f(y)} is outside the drawing's box (PLANE_BOX)`);
  }
  for (const puff of PUFFS.list) if (puffReach(puff) > PUFFS.width) problems.push(`puffs: the puff ${puff[0]} behind the seam reaches past its tile`);
}

// ── The travel table ─────────────────────────────────────────────────────────────────────────

const css = readFileSync(cssPath, "utf8");
const clock = Number((css.match(/--d-vt:\s*([\d.]+)ms/) ?? [])[1]);
if (!Number.isFinite(clock)) problems.push("the stylesheet has no --d-vt: …ms");

/** A "…px" or "…vw" length in px on a screen `width` px wide. */
function px(length, width) {
  const value = Number.parseFloat(length);
  if (length.endsWith("vw")) return (value / 100) * width;
  if (length.endsWith("px")) return value;
  throw new Error(`"${length}" is not a px or vw length`);
}
const sizesAt = (width) => SIZES.findLast((s) => width >= s.min);
/** How far the plane's nose is ahead of the seam, and the last puff behind it, on a screen `width` px wide. */
const ahead = (width) => px(sizesAt(width).lead, width) + noseAhead * px(sizesAt(width).plane, width);
const behind = (width) => puffBehind * px(sizesAt(width).ribbon, width);

/** The travel that just fits a screen `width` px wide, in tenths of a vw. */
function travelFor(width) {
  return {
    from: -Math.ceil(((ahead(width) + CLEAR) / width) * 1000 - 1e-9) / 10,
    to: 100 + Math.ceil(((behind(width) + CLEAR) / width) * 1000 - 1e-9) / 10,
  };
}
/** The time the screen stands empty before the nose arrives and after the last puff has left (ms). */
function empty({ from, to }, width) {
  const speed = (((to - from) / 100) * width) / clock;
  return { start: ((-from / 100) * width - ahead(width)) / speed, end: (((to - 100) / 100) * width - behind(width)) / speed };
}

/** The bands, narrowest first: { min, max, sizes, from, to }. Each row of SIZES is cut into as many as the limit asks for. */
const bands = [];
SIZES.forEach((sizes, i) => {
  const end = i + 1 < SIZES.length ? SIZES[i + 1].min - 1 : WIDEST;
  for (let start = Math.max(sizes.min, NARROWEST); start <= end; ) {
    const travel = travelFor(start);
    // The first width at which this travel would leave the screen empty for too long, rounded down to a ten.
    let next = start + 1;
    while (next <= end && Math.max(...Object.values(empty(travel, next))) <= LIMIT_MS) next++;
    if (next <= end) next = Math.max(start + 10, Math.floor(next / 10) * 10);
    bands.push({ min: bands.length ? start : 0, max: next - 1, sizes, ...travel });
    start = next;
  }
});

// Every width, both ends: the art is off screen when the clock starts and when it stops, and nobody waits long.
let worst = { start: 0, end: 0 };
for (let width = NARROWEST; width <= WIDEST; width++) {
  const band = bands.findLast((b) => width >= b.min);
  const wait = empty(band, width);
  if (wait.start < 0) problems.push(`at ${width} px the plane's nose is on screen when the clock starts`);
  if (wait.end < 0) problems.push(`at ${width} px a puff is still on screen when the clock stops`);
  if (wait.start > worst.start) worst = { ...worst, start: wait.start, startAt: width };
  if (wait.end > worst.end) worst = { ...worst, end: wait.end, endAt: width };
  const s = band.sizes;
  if (px(s.lead, width) <= px(s.ribbon, width) / 2 + px(s.plane, width) / 2) problems.push(`at ${width} px the plane touches the ribbon (lead ${s.lead}, ribbon ${s.ribbon}, plane ${s.plane})`);
}
if (Math.max(worst.start, worst.end) > 60) problems.push(`the screen stands empty for ${Math.round(Math.max(worst.start, worst.end))} ms at one end (the contract allows about 60)`);

// The stylesheet sizes and places the drawings with a few numbers of its own; they have to be these.
for (const [what, text] of [
  ["the plane's drawing", `calc(var(--d-vt-plane) * ${PLANE_BOX.width})`],
  ["the plane's middle, across its drawing,", `var(--d-vt-plane) * ${PLANE_BOX.left})`],
  ["the plane's middle, down its drawing,", `var(--d-vt-plane) * ${PLANE_BOX.top})`],
  ["the white band under the ribbon's core", `calc(var(--d-vt-ribbon) * ${Math.floor(((RIBBON.core[1] - RIBBON.core[0]) / RIBBON.width) * 100) / 100})`],
]) {
  if (!css.includes(text)) problems.push(`the stylesheet no longer sets ${what} with "${text}"`);
}

// ── The two generated blocks ─────────────────────────────────────────────────────────────────

const vw = (n) => `${Math.round(n * 10) / 10}vw`;
function travelCss() {
  const lines = [];
  for (const band of bands) {
    const { ribbon, plane, lead } = band.sizes;
    const first = band === bands.find((b) => b.sizes === band.sizes);
    const declarations = [...(first ? [`--d-vt-ribbon: ${ribbon};`, `--d-vt-plane: ${plane};`, `--d-vt-lead: ${lead};`] : []), `--d-vt-from: ${vw(band.from)};`, `--d-vt-to: ${vw(band.to)};`];
    if (band.min === 0) lines.push("html[data-d-on] {", ...declarations.map((d) => `  ${d}`), "}");
    else lines.push(`@media (min-width: ${band.min}px) {`, "  html[data-d-on] {", ...declarations.map((d) => `    ${d}`), "  }", "}");
  }
  return lines.join("\n");
}
function artCss() {
  return [`  --d-vt-art-ribbon: ${uri(ribbonSvg())};`, `  --d-vt-art-puffs: ${uri(puffsSvg())};`, `  --d-vt-art-plane: ${uri(planeSvg())};`].join("\n");
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
const next = fill(fill(css, "travel", travelCss()), "art", artCss());

// ── Report ───────────────────────────────────────────────────────────────────────────────────

const ms = (n) => `${Math.round(n)} ms`.padStart(6);
console.log(`The travel (clock ${clock} ms; the screen may stand empty for ${LIMIT_MS} ms at most before a new band starts):\n`);
console.log("  screen width      seam from      to     ribbon   plane   lead    empty at the start / at the end, narrowest … widest");
for (const band of bands) {
  const low = empty(band, Math.max(band.min, NARROWEST));
  const high = empty(band, band.max);
  const s = band.sizes;
  console.log(`  ${`${band.min || NARROWEST}–${band.max} px`.padEnd(16)}  ${vw(band.from).padStart(8)}  ${vw(band.to).padStart(8)}   ${s.ribbon.padStart(6)}  ${s.plane.padStart(6)}  ${s.lead.padStart(6)}   ${ms(low.start)} / ${ms(low.end)}  …  ${ms(high.start)} / ${ms(high.end)}`);
}
console.log(`\n  longest wait: ${Math.round(worst.start)} ms before the nose (at ${worst.startAt} px), ${Math.round(worst.end)} ms after the last puff (at ${worst.endAt} px)`);
console.log(`  the nose is ${f(noseAhead * 100)} % of a plane length ahead of the plane's middle; the last puff trails the seam by ${f(puffBehind * 100)} % of the ribbon's width\n`);

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
