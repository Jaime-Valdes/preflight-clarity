#!/usr/bin/env node
/**
 * Screenshot a page in a phone-sized headless Chrome (uses the installed
 * Google Chrome via playwright-core — no browser download needed).
 *
 *   node scripts/shot.mjs <url> <out.png> [options]
 *
 * Options:
 *   --full                 full-page screenshot (default: viewport only)
 *   --desktop              1280×900 desktop viewport instead of a 390×844 phone
 *   --click=<selector>     click before the screenshot; repeatable, runs in order.
 *                          Any Playwright selector: "text=Your pilots", "button:has-text('Next')", "#id"
 *   --wait=<ms>            extra wait before the screenshot (default 600)
 *   --storage=<file.json>  seed localStorage before load: {"key": <value or JSON>}
 *
 * Prints browser console errors and page errors so you can spot runtime bugs.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [--full] [--desktop] [--click=sel]… [--wait=ms] [--storage=file.json]");
  process.exit(1);
}
const opts = { full: false, desktop: false, clicks: [], wait: 600, storage: null };
for (const arg of rest) {
  if (arg === "--full") opts.full = true;
  else if (arg === "--desktop") opts.desktop = true;
  else if (arg.startsWith("--click=")) opts.clicks.push(arg.slice(8));
  else if (arg.startsWith("--wait=")) opts.wait = Number(arg.slice(7));
  else if (arg.startsWith("--storage=")) opts.storage = JSON.parse(fs.readFileSync(arg.slice(10), "utf8"));
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext(
  opts.desktop
    ? { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }
    : {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
);
if (opts.storage) {
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) {
      localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, opts.storage);
}
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[console.${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  for (const sel of opts.clicks) {
    await page.locator(sel).first().click({ timeout: 10_000 });
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(opts.wait);
  await page.screenshot({ path: out, fullPage: opts.full });
  console.log(`saved ${out}`);
} catch (err) {
  console.log(`[shot error] ${err.message}`);
  await page.screenshot({ path: out, fullPage: opts.full }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
