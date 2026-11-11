#!/usr/bin/env node
/**
 * Does a build of version D carry the stylesheets that are on disk?
 *
 *   node frontend/scripts/d-css-check.mjs                 checks the local build (frontend/.next)
 *   node frontend/scripts/d-css-check.mjs <deployment URL> checks what a deployment serves
 *
 * Why: Turbopack's build cache once kept serving an old globals.css after the file had changed
 * (version D's tokens were missing, so its buttons rendered as white labels on nothing), and a
 * rebuild did not clear it. next.config.ts now turns that cache off; this script is the check
 * that catches a stale or partial stylesheet before anyone sees it.
 *
 * The expectations come from the source files, so nothing here needs updating by hand:
 *   - every `--color-*: #rrggbb` token in globals.css's `@theme static` block(s) (version D's
 *     palette; static, so Tailwind always emits them), value included,
 *   - every `@keyframes d-…` defined in frontend/app/d/d-*.css,
 *   - every selector of every style rule in globals.css and frontend/app/d/d-*.css, at any depth
 *     of @media, @supports, @container and @layer. An old copy of a file almost always lacks at
 *     least one selector of the new one, so a stale or partial stylesheet fails even when its
 *     class names and tokens are all still there.
 * Selectors are compared after the same normalisation on both sides (no whitespace, no quotes,
 * lower case, `::` as `:`), because the minifier rewrites spacing and attribute quotes.
 * At-rule conditions and declarations are not compared: the minifier rewrites those too freely.
 *
 * A deployment behind Vercel's deployment protection needs its bypass secret in the environment
 * variable VERCEL_AUTOMATION_BYPASS_SECRET. Only the page HTML and its stylesheets are fetched
 * (no scripts run, so no analytics fire). D_CSS_SOURCES=<frontend dir> reads the source files
 * from another checkout (for example a `git archive` of the commit a build was made from).
 *
 * Exit 0 when everything is there, 1 when something is missing, 2 when the build, the pages or
 * the sources could not be read.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = process.env.D_CSS_SOURCES || FRONTEND;
const PAGES = ["/d", "/d/search?from=JFK&to=LAX&date=2026-11-26"];

/** At-rules whose blocks hold style rules. Every other block (keyframes, @theme, @utility, @property, …) is skipped. */
const NESTING = new Set(["media", "supports", "container", "layer", "scope", "starting-style", "document"]);

/**
 * The minifier quotes nothing it can escape (`[aria-label="Seat map"]` becomes `[aria-label=Seat\ map]`), writes
 * `::before` as `:before`, drops a `*` in front of a pseudo-class, class, attribute or id, and respaces everything.
 * Both sides go through the same steps, so only real differences remain.
 */
const norm = (s) =>
  s
    .replace(/\\(.)/g, "$1")
    .replace(/\s+/g, "")
    .replace(/["']/g, "")
    .replace(/::/g, ":")
    .replace(/\*(?=[:.[#])/g, "")
    .toLowerCase();

/** Splits on commas that are not inside (), [] or a string. */
function splitTop(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Index of the brace that closes the block opened at `open`. */
function closeOf(css, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

/** Every selector of every style rule, walking into the at-rules that hold rules. */
function selectorsOf(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    // A statement at-rule (@import …; @layer a, b; @plugin "…";) before the next block.
    if (semi !== -1 && (open === -1 || semi < open) && css.slice(i, semi).trim().startsWith("@")) {
      i = semi + 1;
      continue;
    }
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const close = closeOf(css, open);
    if (prelude.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? "";
      if (NESTING.has(name)) out.push(...selectorsOf(css.slice(open + 1, close)));
    } else if (prelude) {
      out.push(...splitTop(prelude));
    }
    i = close + 1;
  }
  return out;
}

function expectations() {
  const want = [];
  const read = (rel) => readFileSync(join(SOURCES, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const globals = read("app/globals.css");
  for (const block of globals.matchAll(/@theme static\s*{([\s\S]*?)\n}/g)) {
    for (const [, name, hex] of block[1].matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      want.push({ from: "globals.css @theme static", text: `${name}:${hex.toLowerCase()}`, alt: shortHex(name, hex) });
    }
  }
  if (!want.length) throw new Error("found no `@theme static` colour tokens in app/globals.css");

  const files = [["globals.css", globals]];
  for (const file of readdirSync(join(SOURCES, "app/d")).filter((f) => /^d-.*\.css$/.test(f)).sort()) {
    files.push([file, read(`app/d/${file}`)]);
  }
  for (const [file, css] of files) {
    const seen = new Set();
    for (const [, name] of css.matchAll(/@keyframes\s+(d-[\w-]+)/g)) seen.add(`@keyframes ${name}`);
    for (const sel of selectorsOf(css)) seen.add(sel);
    for (const text of seen) want.push({ from: file, text });
  }
  return want;
}

/** Minifiers may write #aabbcc as #abc. */
function shortHex(name, hex) {
  const h = hex.toLowerCase();
  return h[1] === h[2] && h[3] === h[4] && h[5] === h[6] ? `${name}:#${h[1]}${h[3]}${h[5]}` : null;
}

async function servedCss(base) {
  const headers = {};
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const urls = new Set();
  for (const page of PAGES) {
    const res = await fetch(new URL(page, base), { headers, redirect: "follow" });
    if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
    const html = await res.text();
    for (const [href] of html.matchAll(/\/_next\/static\/[^"'\s]+?\.css/g)) urls.add(href);
  }
  if (!urls.size) throw new Error("the pages link no stylesheets");
  let all = "";
  for (const href of urls) {
    const res = await fetch(new URL(href, base), { headers });
    if (!res.ok) throw new Error(`${href}: HTTP ${res.status}`);
    all += `${await res.text()}\n`;
  }
  return { css: all, label: `${urls.size} stylesheets served by ${base}` };
}

function builtCss() {
  const chunks = join(FRONTEND, ".next/static/chunks");
  if (!existsSync(chunks)) throw new Error("no build in frontend/.next (run next build first)");
  const files = readdirSync(chunks).filter((f) => f.endsWith(".css"));
  if (!files.length) throw new Error("the build has no CSS chunks");
  return { css: files.map((f) => readFileSync(join(chunks, f), "utf8")).join("\n"), label: `${files.length} CSS chunks in frontend/.next` };
}

let source;
let want;
try {
  want = expectations();
  source = process.argv[2] ? await servedCss(process.argv[2]) : builtCss();
} catch (err) {
  console.error(`d-css-check: ${err.message}`);
  process.exit(2);
}

const css = norm(source.css.replace(/\/\*[\s\S]*?\*\//g, ""));
const missing = want.filter((w) => !css.includes(norm(w.text)) && !(w.alt && css.includes(norm(w.alt))));

if (missing.length) {
  console.error(`d-css-check: ${missing.length} of ${want.length} expected pieces are missing from ${source.label}:`);
  for (const m of missing.slice(0, 40)) console.error(`  ${m.text}   (from ${m.from})`);
  if (missing.length > 40) console.error(`  … and ${missing.length - 40} more`);
  console.error("The build is stale or partial (or older than the files on disk). Rebuild from a clean .next and run this again.");
  process.exit(1);
}
console.log(`d-css-check: all ${want.length} expected pieces found in ${source.label}.`);
