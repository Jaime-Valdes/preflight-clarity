#!/usr/bin/env node
/*
 * Contrast check for version D's look (docs/ui-d-cinematic.md, section 2, "Colour").
 *
 *   node frontend/scripts/d-contrast.mjs
 *
 * Prints every text / background pair the look relies on with its WCAG 2.x contrast ratio and exits 1 when one is
 * under its threshold: 4.5 : 1 for text, 3 : 1 for large text (24 px and up, or 19 px and up in bold) and for
 * non-text marks (rings, outlines, icons). Exits 2 when a token it needs is missing.
 *
 * Colours are read from app/globals.css (the D palette in `@theme static` and the re-pointing block under
 * [data-theme="d"]), so a token changed there is checked here without a second edit. The four sky gradients are
 * not tokens: they are copied below from the contract's table, and any top-to-bottom gradient written out in
 * app/d/d-sky.css is checked as well, so the sky that ships cannot drift from the one that was measured.
 * No dependencies.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TEXT = 4.5;
const LARGE = 3;
const MARK = 3;

const cssPath = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const skyCssPath = fileURLToPath(new URL("../app/d/d-sky.css", import.meta.url));

/** One sky per scene, top to bottom: [position in %, colour]. Mirrors the table in docs/ui-d-cinematic.md. */
const SKY = {
  "home (First light)": [[0, "#7EC3F4"], [34, "#AEDAF9"], [60, "#E3F1FC"], [74, "#FBF7EC"], [87, "#FFF1CC"], [100, "#FFE3A0"]],
  "results (The climb)": [[0, "#8CCBF5"], [45, "#C3E4FA"], [80, "#EDF6FD"], [100, "#FFF9EA"]],
  "flight (Above the clouds)": [[0, "#86C8F6"], [40, "#B7DEF9"], [75, "#E7F3FD"], [100, "#FCFDFE"]],
  "compare (Golden afternoon)": [[0, "#93CDF5"], [36, "#CBE7F9"], [60, "#FBF7EC"], [80, "#FFEFC4"], [100, "#FFDF96"]],
};

// ── Colour maths (sRGB, WCAG 2.x relative luminance) ────────────────────────────

function rgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function hex(channels) {
  return "#" + channels.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function luminance(colour) {
  const [r, g, b] = rgb(colour).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A translucent colour over an opaque one, as the browser composites it. */
function over(top, alpha, under) {
  const t = rgb(top);
  const u = rgb(under);
  return hex(t.map((v, i) => v * alpha + u[i] * (1 - alpha)));
}

/** A point on a gradient. CSS interpolates colour stops in sRGB. */
function sample(stops, at) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (at >= p0 && at <= p1) {
      const t = p1 === p0 ? 0 : (at - p0) / (p1 - p0);
      const a = rgb(c0);
      const b = rgb(c1);
      return hex(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return at < stops[0][0] ? stops[0][1] : stops[stops.length - 1][1];
}

/** The darkest point of a gradient, sampled every 0.5 %: where dark text has the least contrast. */
function darkest(stops) {
  let worst = { at: 0, colour: stops[0][1], lum: Infinity };
  for (let step = 0; step <= 200; step++) {
    const at = step / 2;
    const colour = sample(stops, at);
    const lum = luminance(colour);
    if (lum < worst.lum) worst = { at, colour, lum };
  }
  return worst;
}

// ── Tokens, from globals.css ────────────────────────────────────────────────────

function fail(message) {
  console.error(`d-contrast: ${message}`);
  process.exit(2);
}

/** The text between the brace at `open` and its partner. */
function block(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return fail("unbalanced braces in globals.css");
}

function declarations(text) {
  const found = {};
  for (const m of text.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)) found[m[1]] = m[2].trim();
  return found;
}

// Comments go first: one may hold a brace or something that reads like a declaration.
const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const themeAt = css.indexOf("@theme static");
if (themeAt < 0) fail("no `@theme static` block in app/globals.css");
const palette = declarations(block(css, css.indexOf("{", themeAt)));

// The re-pointing block is the rule after the palette that sets --color-canvas.
const canvasAt = css.indexOf("--color-canvas:", themeAt);
if (canvasAt < 0) fail("no re-pointing block (a rule setting --color-canvas) after the D palette in app/globals.css");
const repointed = declarations(block(css, css.lastIndexOf("{", canvasAt)));

/** A token's colour as a hex string: D's own names first (ink, royal…), then the re-pointed shared scales (ink-900, calm-500…). */
function token(name, seen = []) {
  const raw = palette[name] ?? repointed[name];
  if (raw === undefined) fail(`token --color-${name} is not defined in the version D part of app/globals.css`);
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return hex(rgb(raw));
  const ref = /^var\(--color-([a-z0-9-]+)\)$/.exec(raw);
  if (!ref || seen.includes(name)) fail(`cannot resolve --color-${name}: ${raw}`);
  return token(ref[1], [...seen, name]);
}

const t = new Proxy({}, { get: (_, name) => token(String(name)) });
const WHITE = "#FFFFFF";

// ── The pairs ───────────────────────────────────────────────────────────────────

const rows = [];
let section = "";
/** kind: "text" (4.5), "large" (3) or "mark" (3). */
function pair(fgLabel, fg, bgLabel, bg, where, kind = "text") {
  rows.push({ section, fgLabel, fg, bgLabel, bg, where, kind });
}

const skies = Object.entries(SKY).map(([scene, stops]) => ({ scene, ...darkest(stops) }));
const deepest = skies.reduce((a, b) => (b.lum < a.lum ? b : a));

section = "On the sky: the darkest point of each scene's gradient";
for (const sky of skies) {
  const on = `${sky.scene}: ${sky.colour} at ${sky.at}%`;
  pair("ink", t.ink, on, sky.colour, "headlines, header links, the brand");
  pair("ink-soft", t["ink-soft"], on, sky.colour, "hero copy, sub-lines");
  pair("ink-mute", t["ink-mute"], on, sky.colour, "counts, captions, the footer");
}

// Gradients written out in d-sky.css, if any (they should be the four above).
if (existsSync(skyCssPath)) {
  const skyCss = readFileSync(skyCssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  let n = 0;
  for (const m of skyCss.matchAll(/linear-gradient\(\s*(?:(?:180deg|to bottom)\s*,)?\s*([^()]*)\)/gi)) {
    const stops = m[1].split(",").map((s) => /^\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\s+([\d.]+)%\s*$/i.exec(s));
    if (stops.length < 2 || stops.some((s) => !s)) continue;
    n++;
    if (n === 1) section = "On the sky: gradients found in app/d/d-sky.css";
    const worst = darkest(stops.map((s) => [Number(s[2]), s[1]]));
    const on = `d-sky.css gradient ${n}: ${worst.colour} at ${worst.at}%`;
    pair("ink", t.ink, on, worst.colour, "as above");
    pair("ink-soft", t["ink-soft"], on, worst.colour, "as above");
    pair("ink-mute", t["ink-mute"], on, worst.colour, "as above");
  }
}

section = "On the sky: other things text passes over";
pair("ink-mute", t["ink-mute"], "sun disc edge (gold)", t.gold, "small text scrolling over the sun on phones");
pair("ink-mute", t["ink-mute"], "sun core #FFE9A8", "#FFE9A8", "the same, at the sun's centre");
const horizon = SKY["compare (Golden afternoon)"].at(-1)[1];
pair("ink-mute", t["ink-mute"], `the golden horizon ${horizon}`, horizon, "the footer at the foot of the compare page");
const navPill = over(t.surface, 0.86, deepest.colour);
pair("ink", t.ink, `nav pill (paper 86% over ${deepest.colour})`, navPill, "the current header link");
const dateTile = over(t.surface, 0.6, deepest.colour);
pair("ink-soft", t["ink-700"], `date tile (paper 60% over ${deepest.colour})`, dateTile, "an unchosen day: date and fare");
pair("ink-mute", t["ink-500"], `date tile (paper 60% over ${deepest.colour})`, dateTile, "an unchosen day: weekday and flight count");

section = "On paper (cards, the tray, sheets)";
pair("ink", t["ink-900"], "surface", t.surface, "card headings, fares");
pair("ink-soft", t["ink-700"], "surface", t.surface, "card body");
pair("ink-mute", t["ink-500"], "surface", t.surface, "secondary text, the tray's note");
pair("ink-mute (ink-400)", t["ink-400"], "surface", t.surface, "placeholders, chevrons");
pair("royal", t.royal, "surface", t.surface, "royal words or icons on a card");
const skyTile = over(t.canvas, 0.7, t.surface);
pair("ink", t.ink, "sky tile (sky 70% on paper)", skyTile, "priority tiles, route chips");
pair("ink-mute", t["ink-mute"], "sky tile (sky 70% on paper)", skyTile, "their sub-labels");
const sheetRow = over(t.canvas, 0.6, t.surface);
pair("ink-mute", t["ink-mute"], "sheet row (sky 60% on paper)", sheetRow, "the numbers list in the rating sheet");
pair("ink-soft", t["ink-700"], "sky (canvas)", t.canvas, "tray chips, hover fills");
pair("ink-mute", t["ink-500"], "sky (canvas)", t.canvas, "compare table group rows, chip sub-lines");
pair("sky-ink", t["sky-ink"], "sky", t.sky, "neutral factor marker, filter chips");
const trayOff = over(t.line, 0.7, t.surface);
pair("ink-mute (ink-400)", t["ink-400"], "line 70% on paper", trayOff, "shared disabled pills (exempt as disabled; kept readable)");

section = "Controls: royal is for doing";
pair("white", WHITE, "royal", t.royal, "primary buttons, the chosen day and sort, a ranked tile, the compare count");
pair("white", WHITE, "royal-hover", t["royal-hover"], "a primary under the pointer");
pair("white", WHITE, "royal-press", t["royal-press"], "a primary while pressed");
pair("white 75%", over(WHITE, 0.75, t.royal), "royal", t.royal, "a ranked tile's second line");
pair("white 70%", over(WHITE, 0.7, t.royal), "royal", t.royal, "the chosen day: weekday and flight count");
pair("royal", t.royal, "royal-100", t["royal-100"], "a selected outline control: Compare on, Your pick");
pair("ink", t.ink, "royal-100", t["royal-100"], "ink beside it");
pair("ink-mute", t["ink-mute"], "sky-deep", t["sky-deep"], "a disabled primary's label");
pair("white", WHITE, "night-900 (re-pointed)", t["night-900"], "every shared primary and selected state");
pair("white", WHITE, "night-800 (re-pointed)", t["night-800"], "their hover");
pair("white", WHITE, "night-950 (re-pointed)", t["night-950"], "their press");
pair("white", WHITE, "ink", t.ink, "the brand tile, an airline tile kept on ink, D's ink pills");
pair("ink", t.ink, "gold", t.gold, "the rank number on its coin");
pair("ink", t.ink, "butter", t.butter, "selected text, the link highlighter");

section = "Ratings: three tiers of one weight";
for (const tier of ["leaf", "sun", "amber"]) {
  pair(`${tier}-ink`, t[`${tier}-ink`], `${tier}-100`, t[`${tier}-100`], "tier word and pill on its tint");
  pair(`${tier}-ink`, t[`${tier}-ink`], "surface", t.surface, "tier word in a rating row, benchmark lines");
  pair("ink-soft", t["ink-soft"], `${tier}-100`, t[`${tier}-100`], "the meaning line on the tier block");
  pair("ink-mute", t["ink-mute"], `${tier}-100`, t[`${tier}-100`], "eyebrow and Why? on the tier block");
}

section = "Shared scales, re-pointed (calm = leaf, breeze = sky, dusk = cream, sand = amber)";
pair("white", WHITE, "calm-500", t["calm-500"], "airline tile");
pair("white", WHITE, "breeze-500", t["breeze-500"], "airline tile");
pair("calm-700", t["calm-700"], "calm-50", t["calm-50"], "benchmark tags, good notes");
pair("calm-700", t["calm-700"], "calm-100", t["calm-100"], "airline tile");
pair("calm-800", t["calm-800"], "calm-50", t["calm-50"], "the seat note");
pair("breeze-700", t["breeze-700"], "breeze-50", t["breeze-50"], "info notes, icon tiles");
pair("breeze-700", t["breeze-700"], "breeze-100", t["breeze-100"], "filter chips, airline tile");
pair("breeze-600", t["breeze-600"], "surface", t.surface, "the forecast marker's label");
pair("dusk-600", t["dusk-600"], "dusk-100 (cream)", t["dusk-100"], "airline tile");
pair("dusk-700", t["dusk-700"], "dusk-50", t["dusk-50"], "the sign-up card's icon tile, people notes");
pair("dusk-700", t["dusk-700"], "surface", t.surface, "the pilot card's button");
pair("sand-700", t["sand-700"], "sand-50", t["sand-50"], "benchmark tags");
pair("sand-700", t["sand-700"], "sand-100", t["sand-100"], "airline tile");
pair("sand-700", t["sand-700"], "surface", t.surface, "form hints");

section = "Non-text marks";
pair("focus ring: ink", t.ink, `the deepest sky ${deepest.colour}`, deepest.colour, "keyboard focus on the sky", "mark");
pair("focus ring: ink", t.ink, "surface", t.surface, "keyboard focus on a card", "mark");
pair("field focus ring: breeze-500", t["breeze-500"], "surface", t.surface, "a focused field", "mark");
pair("field outline: line-strong", t["line-strong"], "surface", t.surface, "fields, shared pills", "mark");
pair("selected ring: royal", t.royal, "royal-100", t["royal-100"], "the ring of a selected outline control", "mark");
pair("mascot outline: ink", t.ink, "gold", t.gold, "the cloud in front of the sun", "mark");
pair("gold mark", t.gold, "royal", t.royal, "the coin on a ranked tile, the bar under the chosen day", "mark");
pair("icon: calm-500", t["calm-500"], "surface", t.surface, "check marks in the detail sections", "mark");
pair("icon: calm-600", t["calm-600"], "surface", t.surface, "icons in the detail sections", "mark");
pair("icon: breeze-500", t["breeze-500"], "surface", t.surface, "info icons", "mark");

// ── Report ──────────────────────────────────────────────────────────────────────

const NEEDS = { text: TEXT, large: LARGE, mark: MARK };
/** Two decimals; four when a ratio under its threshold would round up to it, so a failure never reads as a pass. */
function show(ratio, needs) {
  const two = ratio.toFixed(2);
  return ratio < needs && Number(two) >= needs ? ratio.toFixed(4) : two;
}
const pad = (s, n) => String(s).padEnd(n);

let failed = 0;
let lowest = null;
const out = [];
for (const row of rows) {
  const ratio = contrast(row.fg, row.bg);
  const needs = NEEDS[row.kind];
  const ok = ratio >= needs;
  if (!ok) failed++;
  if (row.kind === "text" && (!lowest || ratio < lowest.ratio)) lowest = { ...row, ratio };
  out.push({ ...row, ratio, needs, ok });
}

const cells = out.map((r) => [
  `${r.fgLabel} ${r.fg}`,
  `${r.bgLabel}${r.bgLabel.includes(r.bg) ? "" : ` ${r.bg}`}`,
  `${show(r.ratio, r.needs)} : 1`,
  String(r.needs),
  r.ok ? "pass" : "FAIL",
  r.where,
]);
const head = ["Text or mark", "On", "Ratio", "Needs", "", "Where"];
const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
let current = "";
out.forEach((r, i) => {
  if (r.section !== current) {
    current = r.section;
    console.log(`\n${current}`);
    console.log(head.map((h, k) => pad(h, widths[k])).join("  ").trimEnd());
    console.log(widths.map((w) => "-".repeat(w)).join("  "));
  }
  console.log(cells[i].map((c, k) => pad(c, widths[k])).join("  ").trimEnd());
});

// ── Hues: nothing red, rose, coral, pink or orange ──────────────────────────────
// The look's hard rule, checked on every token so a colour nudged for contrast cannot drift warm of yellow.
// Version D's warm colours sit between 38° and 49° (HSL); the brief's floor is 32°.

const HUE_MIN = 32;
const HUE_MAX = 290;

/** HSL hue in degrees, or null for a grey. */
function hue(colour) {
  const [r, g, b] = rgb(colour).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const offHue = [];
for (const name of [...Object.keys(palette), ...Object.keys(repointed)]) {
  const colour = token(name);
  const h = hue(colour);
  if (h !== null && (h < HUE_MIN || h > HUE_MAX)) offHue.push(`--color-${name} ${colour} (hue ${h.toFixed(1)}°)`);
}

console.log(
  `\n${rows.length} pairs. Lowest text pair: ${lowest.fgLabel} on ${lowest.bgLabel} at ${show(lowest.ratio, TEXT)} : 1 (needs ${TEXT}).`,
);
if (offHue.length) {
  console.log(`Hues outside ${HUE_MIN}° to ${HUE_MAX}° (red, pink or orange):`);
  for (const line of offHue) console.log(`  ${line}`);
} else {
  console.log(`Hues: all ${Object.keys(palette).length + Object.keys(repointed).length} tokens sit between ${HUE_MIN}° and ${HUE_MAX}°; none is red, pink or orange.`);
}
if (failed) console.log(`${failed} ${failed === 1 ? "pair is" : "pairs are"} under the threshold.`);
if (failed || offHue.length) process.exit(1);
console.log("All pass.");
