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
 *     palette; static, so Tailwind always emits them),
 *   - every `.d-…` class and every `@keyframes d-…` defined in frontend/app/d/d-*.css,
 *   - the two scoping hooks, `[data-theme=d]` and `html[data-d-on]`.
 *
 * A deployment behind Vercel's deployment protection needs its bypass secret in the environment
 * variable VERCEL_AUTOMATION_BYPASS_SECRET. Nothing is sent anywhere else, and only the page
 * HTML and its stylesheets are fetched (no scripts run, so no analytics fire).
 *
 * Exit 0 when everything is there, 1 when something is missing, 2 when the build or the pages
 * could not be read.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["/d", "/d/search?from=JFK&to=LAX&date=2026-11-26"];

function expectations() {
  const want = [];
  const globals = readFileSync(join(FRONTEND, "app/globals.css"), "utf8");
  for (const block of globals.matchAll(/@theme static\s*{([\s\S]*?)\n}/g)) {
    for (const [, name, hex] of block[1].matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      want.push({ from: "globals.css @theme static", text: `${name}:${hex.toLowerCase()}`, alt: shortHex(name, hex) });
    }
  }
  if (!want.length) throw new Error("found no `@theme static` colour tokens in app/globals.css");
  want.push({ from: "globals.css", text: "[data-theme=d]" }, { from: "globals.css", text: "html[data-d-on]" });

  const dir = join(FRONTEND, "app/d");
  for (const file of readdirSync(dir).filter((f) => /^d-.*\.css$/.test(f)).sort()) {
    const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const seen = new Set();
    for (const [, cls] of css.matchAll(/\.(d-[\w-]+)/g)) seen.add(`.${cls}`);
    for (const [, name] of css.matchAll(/@keyframes\s+(d-[\w-]+)/g)) seen.add(`@keyframes ${name}`);
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
    all += await res.text();
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

// Built CSS is minified: compare without whitespace and with lower-case hex.
const css = source.css.replace(/\s+/g, "").toLowerCase();
const missing = want.filter((w) => {
  const text = w.text.replace(/\s+/g, "").toLowerCase();
  return !css.includes(text) && !(w.alt && css.includes(w.alt));
});

if (missing.length) {
  console.error(`d-css-check: ${missing.length} of ${want.length} expected pieces are missing from ${source.label}:`);
  for (const m of missing.slice(0, 40)) console.error(`  ${m.text}   (from ${m.from})`);
  if (missing.length > 40) console.error(`  … and ${missing.length - 40} more`);
  console.error("The build is stale or partial. Rebuild from a clean .next (rm -rf frontend/.next/cache) and run this again.");
  process.exit(1);
}
console.log(`d-css-check: all ${want.length} expected pieces found in ${source.label}.`);
