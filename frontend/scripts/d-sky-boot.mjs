#!/usr/bin/env node
/*
 * Runs the sky's boot script exactly as a server prints it, and checks what it decides (docs/ui-d-cinematic.md,
 * section 4, "Day and night"; the script is components/d/sky/time.ts's `bootSky` and `skyTimeAt`, printed with
 * Function.prototype.toString() by DScope as the D root's first child).
 *
 *   node frontend/scripts/d-sky-boot.mjs [baseUrl]      default http://localhost:3000
 *
 * It fetches <baseUrl>/d?test=1, takes the first child of the `data-theme="d"` div (exit 2 if that is not a
 * <script>), and runs it in node:vm, once per case below, with a stub document (the root, a <head> holding one
 * theme-color meta), a Date fixed at the case's moment (and its zone's January and July offsets) and an Intl that
 * reports the case's time zone. For each case it checks the root's `data-d-time`, D's own theme-color meta (inserted
 * before the existing one, with the top of that sky's colour, in a spelling other than the existing meta's: see
 * SKY_EDGE in time.ts) and `<style id="d-time-boot">`. It also calls the
 * printed `skyTimeAt` directly, outside the boot's try/catch, so a compiler helper or any other name the printed
 * functions cannot reach shows up as a ReferenceError instead of a silent "day".
 *
 * The zone table travels packed (time.ts, `packZones`); the printed `unpackZones` call must give back exactly the
 * table in components/d/sky/zones.ts, entry for entry, so no answer changes. The moon (moon.ts, `moonPhaseCss`,
 * printed too) is checked at six dates: `<style id="d-moon-phase">` either takes the moon out (near a new moon) or
 * holds a picture whose lit part is read back from its path (the limb's side, the terminator's x-radius and side).
 * Exit 1 on any mismatch or error. Run it against `next dev` and against `next start`: the two compile the
 * functions differently.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const EDGE = { day: "#7EC3F4", night: "#0E1838" };

/** Zone, moment (UTC), January and July offsets (minutes, as getTimezoneOffset gives them), expected look. */
const CASES = [
  { name: "New York 2026-11-12 23:30", zone: "America/New_York", at: "2026-11-13T04:30:00Z", jan: 300, jul: 240, want: "night" },
  { name: "New York 2026-11-12 12:00", zone: "America/New_York", at: "2026-11-12T17:00:00Z", jan: 300, jul: 240, want: "day" },
  { name: "New York 17:05 (civil dusk 17:11)", zone: "America/New_York", at: "2026-11-12T22:05:00Z", jan: 300, jul: 240, want: "day" },
  { name: "New York 17:20", zone: "America/New_York", at: "2026-11-12T22:20:00Z", jan: 300, jul: 240, want: "night" },
  { name: "Etc/UTC 23:30 (no place: day)", zone: "Etc/UTC", at: "2026-11-12T23:30:00Z", jan: 0, jul: 0, want: "day" },
  { name: "Mars/Base 23:30 local, offsets 300 / 240 (the fallback)", zone: "Mars/Base", at: "2026-11-13T04:30:00Z", jan: 300, jul: 240, want: "night" },
  { name: "Anchorage 2026-06-21 00:00 local", zone: "America/Anchorage", at: "2026-06-21T08:00:00Z", jan: 540, jul: 480, want: "day" },
  { name: "London 2026-12-21 17:00Z", zone: "Europe/London", at: "2026-12-21T17:00:00Z", jan: 0, jul: -60, want: "night" },
];

let html;
try {
  const res = await fetch(`${base}/d?test=1`);
  html = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`d-sky-boot: could not fetch ${base}/d?test=1: ${e.message}`);
  process.exit(2);
}
const found = /<div\b[^>]*\bdata-theme="d"[^>]*>([\s\S]{0,40})/.exec(html);
const first = found && /^<script>([\s\S]*?)<\/script>/.exec(html.slice(found.index + found[0].length - found[1].length));
if (!first) {
  console.error(`d-sky-boot: the first child of the data-theme="d" div in ${base}/d?test=1 is not a <script> (${found ? JSON.stringify(found[1]) : "no D root"})`);
  process.exit(2);
}
const src = first[1];
console.log(`d-sky-boot: ${base}/d?test=1, boot script ${src.length} bytes`);

/** A tiny element: what bootSky touches (attributes, name, content, id, textContent). */
function element(tag) {
  const attrs = new Map();
  return {
    tagName: tag.toUpperCase(),
    id: "",
    name: "",
    content: "",
    textContent: "",
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === "id" || k === "name" || k === "content") this[k] = String(v);
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    hasAttribute(k) {
      return attrs.has(k);
    },
  };
}
const isThemeMeta = (n) => n.tagName === "META" && (n.name || n.getAttribute("name")) === "theme-color";

function sandbox(c) {
  const now = Date.parse(c.at);
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
    getTimezoneOffset() {
      return this.getMonth() < 6 ? c.jan : c.jul;
    }
  }
  const root = element("div");
  root.setAttribute("data-theme", "d");
  const theirs = element("meta");
  theirs.setAttribute("name", "theme-color");
  theirs.setAttribute("content", EDGE.day);
  const children = [element("meta"), theirs, element("link")];
  const head = {
    children,
    querySelector(sel) {
      if (sel === 'meta[name="theme-color"][data-d-time]') return children.find((n) => isThemeMeta(n) && n.hasAttribute("data-d-time")) || null;
      if (sel === 'meta[name="theme-color"]') return children.find(isThemeMeta) || null;
      throw new Error(`stub head: unexpected selector ${sel}`);
    },
    insertBefore(node, ref) {
      const i = ref ? children.indexOf(ref) : -1;
      if (i < 0) children.push(node);
      else children.splice(i, 0, node);
      return node;
    },
    appendChild(node) {
      children.push(node);
      return node;
    },
  };
  const document = {
    currentScript: { parentElement: root },
    head,
    createElement: element,
    getElementById: (id) => children.find((n) => n.id === id) || null,
  };
  const Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: c.zone }) }) };
  return { root, theirs, head, context: vm.createContext({ document, Date: FixedDate, Intl }) };
}

/** The printed call is `(bootSky)(skyTimeAt, (unpackZones)(packed), edge, moonPhaseCss)`: its pieces, for the direct calls. */
let acorn = null;
try {
  acorn = await import("acorn");
} catch {
  acorn = null;
}
let pieces = null;
if (acorn) {
  try {
    const call = acorn.parse(src, { ecmaVersion: "latest" }).body[0].expression;
    pieces = call.arguments.map((a) => src.slice(a.start, a.end));
  } catch (e) {
    console.log(`  (could not split the printed call: ${e.message}; the direct call is skipped)`);
  }
} else console.log("  (acorn is not installed; the direct call of skyTimeAt is skipped)");

let failed = 0;
for (const c of CASES) {
  const problems = [];
  let direct = "";
  if (pieces && pieces.length === 4) {
    const { context } = sandbox(c);
    try {
      const decide = vm.runInContext(`(${pieces[0]})`, context);
      const zones = vm.runInContext(`(${pieces[1]})`, context);
      direct = decide(vm.runInContext("Date.now()", context), zones);
      if (direct !== c.want) problems.push(`skyTimeAt says ${direct}`);
    } catch (e) {
      problems.push(`skyTimeAt threw ${e && e.name}: ${e && e.message}`);
    }
  }
  const { root, theirs, head, context } = sandbox(c);
  try {
    vm.runInContext(src, context);
  } catch (e) {
    problems.push(`the script threw ${e && e.name}: ${e && e.message}`);
  }
  const time = root.getAttribute("data-d-time");
  if (time !== c.want) problems.push(`root data-d-time=${time}`);
  const ours = head.children.find((n) => isThemeMeta(n) && n.hasAttribute("data-d-time"));
  if (!ours) problems.push("no D theme-color meta");
  else {
    if (head.children.indexOf(ours) > head.children.indexOf(theirs)) problems.push("D's meta is after the existing one");
    if (ours.content.toLowerCase() !== EDGE[c.want].toLowerCase()) problems.push(`meta content ${ours.content}`);
    // React reuses an unowned meta with the same name and content string when it mounts its own (time.ts, SKY_EDGE).
    if (ours.content === theirs.content) problems.push(`D's meta has the layout meta's exact content string ${JSON.stringify(theirs.content)}`);
  }
  const style = head.children.find((n) => n.id === "d-time-boot");
  const css = `html,body{background-color:${EDGE[c.want]}}`;
  if (!style) problems.push("no #d-time-boot");
  else if (style.textContent.toLowerCase() !== css.toLowerCase()) problems.push(`#d-time-boot holds ${JSON.stringify(style.textContent)}`);
  if (problems.length) failed++;
  console.log(`  ${problems.length ? "FAIL" : "ok  "} ${c.name}: ${time}${ours ? `, meta ${ours.content}` : ""}${style ? `, ${style.textContent}` : ""}${problems.length ? `  <- ${problems.join("; ")}` : ""}`);
}
if (pieces && pieces.length !== 4) {
  failed++;
  console.log(`  FAIL the printed call has ${pieces.length} arguments, not 4 (skyTimeAt, the zones, the edge colours, moonPhaseCss)`);
}

// ── The zone table: the printed one is zones.ts's, entry for entry ──
let tableOk = !pieces;
if (pieces && pieces.length === 4) {
  const ts = readFileSync(fileURLToPath(new URL("../components/d/sky/zones.ts", import.meta.url)), "utf8");
  const want = new Function(`return ${ts.slice(ts.indexOf("{", ts.indexOf("export const SKY_ZONES")), ts.lastIndexOf("}") + 1)}`)();
  const { context } = sandbox(CASES[0]);
  let got = {};
  try {
    got = vm.runInContext(`(${pieces[1]})`, context);
  } catch (e) {
    console.log(`  FAIL the printed zone table threw ${e && e.name}: ${e && e.message}`);
  }
  const names = Object.keys(want);
  const wrong = names.filter((z) => !Array.isArray(got[z]) || got[z].length !== 2 || got[z][0] !== want[z][0] || got[z][1] !== want[z][1]);
  const extra = Object.keys(got).filter((z) => !(z in want));
  tableOk = wrong.length === 0 && extra.length === 0;
  if (!tableOk) failed++;
  console.log(
    `  ${tableOk ? "ok  " : "FAIL"} the printed zone table equals zones.ts: ${names.length} zones, ${pieces[1].length} characters printed` +
      (tableOk ? "" : `; differ: ${wrong.slice(0, 6).join(", ")}; extra: ${extra.slice(0, 6).join(", ")}`),
  );
}

// ── The moon: tonight's phase at six dates ──
/** Expected: none (no moon), or the lit share's range, its side ("right" waxing, "left" waning), crescent or not. */
const MOONS = [
  { at: "2026-11-09T12:00:00Z", want: "no moon", none: true },
  { at: "2026-11-13T00:00:00Z", want: "waxing crescent, 6-14 % lit, lit on the right", lit: [0.06, 0.14], side: "right", crescent: true },
  { at: "2026-11-17T12:00:00Z", want: "40-60 % lit, waxing", lit: [0.4, 0.6], side: "right" },
  { at: "2026-11-24T12:00:00Z", want: "95 % lit or more", lit: [0.95, 1] },
  { at: "2026-12-01T12:00:00Z", want: "40-60 % lit, lit on the left", lit: [0.4, 0.6], side: "left" },
  { at: "2026-12-05T12:00:00Z", want: "waning crescent", side: "left", crescent: true },
];
/** Reads the lit part back from the picture's path: M0-1 A1 1 0 0 <limb> 0 1 A<k> 1 0 0 <terminator> 0-1Z. */
function readMoon(css) {
  if (/^\.d-moon\{display:none!important\}$/.test(css)) return { none: true };
  const uri = /^\.d-moon\{--d-moon-phase:url\("data:image\/svg\+xml,([^"]*)"\)\}$/.exec(css);
  if (!uri) return { error: `unexpected style ${JSON.stringify(css.slice(0, 80))}` };
  const svg = decodeURIComponent(uri[1]);
  // Well formed: every element opened is closed, in order.
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (m[1]) {
      if (stack.pop() !== m[2]) return { error: `the picture is not well formed at </${m[2]}>` };
    } else if (!m[3]) stack.push(m[2]);
  }
  if (stack.length) return { error: `the picture leaves <${stack.join("><")}> open` };
  const path = /d='M0-1A1 1 0 0 ([01]) 0 1A([0-9.]+) 1 0 0 ([01]) 0-1Z'/.exec(svg);
  if (!path) return { error: "no lit path in the picture" };
  const limb = +path[1];
  const k = +path[2];
  const crescent = +path[3] !== limb;
  return { side: limb ? "right" : "left", k, crescent, lit: crescent ? (1 - k) / 2 : (1 + k) / 2, bytes: svg.length };
}
for (const m of MOONS) {
  const c = { zone: "America/New_York", at: m.at, jan: 300, jul: 240 };
  const problems = [];
  const { head, context } = sandbox(c);
  let direct = "";
  try {
    vm.runInContext(src, context);
  } catch (e) {
    problems.push(`the script threw ${e && e.name}: ${e && e.message}`);
  }
  if (pieces && pieces.length === 4) {
    try {
      direct = vm.runInContext(`(${pieces[3]})`, sandbox(c).context)(Date.parse(m.at));
    } catch (e) {
      problems.push(`moonPhaseCss threw ${e && e.name}: ${e && e.message}`);
    }
  }
  const style = head.children.find((n) => n.id === "d-moon-phase");
  const css = style ? style.textContent : "";
  if (!style) problems.push("no #d-moon-phase");
  else if (pieces && pieces.length === 4 && direct !== css) problems.push("the boot's style differs from moonPhaseCss's");
  const got = readMoon(css);
  if (got.error) problems.push(got.error);
  else if (m.none) {
    if (!got.none) problems.push("a moon is drawn");
  } else if (got.none) problems.push("no moon");
  else {
    if (m.lit && (got.lit < m.lit[0] || got.lit > m.lit[1])) problems.push(`${(got.lit * 100).toFixed(1)} % lit`);
    if (m.side && got.side !== m.side) problems.push(`lit on the ${got.side}`);
    if (m.crescent !== undefined && got.crescent !== m.crescent) problems.push(got.crescent ? "a crescent" : "not a crescent");
  }
  if (problems.length) failed++;
  const said = got.none ? "no moon" : got.error ? "?" : `${(got.lit * 100).toFixed(1)} % lit, lit on the ${got.side}, ${got.crescent ? "crescent" : "quarter to gibbous"} (k ${got.k}; picture ${got.bytes} characters)`;
  console.log(`  ${problems.length ? "FAIL" : "ok  "} moon ${m.at.slice(0, 16)}Z, want ${m.want}: ${said}${problems.length ? `  <- ${problems.join("; ")}` : ""}`);
}

const total = CASES.length + MOONS.length + (pieces ? 1 : 0);
console.log(failed ? `d-sky-boot: ${failed} of ${total} checks failed` : `d-sky-boot: all ${total} checks pass (${CASES.length} looks, the zone table, ${MOONS.length} moons)`);
process.exit(failed ? 1 : 0);
