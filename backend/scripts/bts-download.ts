/*
 * Downloads the twelve monthly US DOT files the on-time table is built from (docs/REAL_DATA.md,
 * "Status: airline on-time from BTS", the refresh), for backend/scripts/bts-ontime.ts and the
 * monthly GitHub Action (.github/workflows/bts-refresh.yml). Run from the repo root:
 *
 *   npx tsx backend/scripts/bts-download.ts --dir <new, empty folder> [--end YYYY-MM] [--table <table.json>]
 *
 * Without --end it finds the latest published month by probing the TranStats PREZIP files backwards
 * from the current month, and stops with "no new month" (exit 0, nothing downloaded) when that is
 * the committed table's `to`. With --end it builds the twelve months ending there whatever the table
 * says (to rebuild a period, or to test). The files go into the folder one at a time as
 * bts-YYYY-MM.zip, each with retries and a timeout, and each is checked to be a ZIP holding one CSV.
 * The downloads are untrusted data: give the script a folder of their own and never commit them.
 *
 * Inside GitHub Actions it also writes `status` (new | none), `from`, `end` and `files` to
 * $GITHUB_OUTPUT. Exits non-zero when a month cannot be found or fetched.
 */
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { listZip } from "./bts/zip";

const BASE = "https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_";
const MONTHS = 12;
/** How far back from the current month to look for the latest published file (BTS runs ~2 months behind). */
const PROBE_BACK = 8;
const ATTEMPTS = 4;
const PROBE_TIMEOUT_MS = 30_000;
/** TranStats can be slow (a month has taken three minutes at ~180 kB/s), so a generous cap per attempt… */
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000;
/** …and a shorter one for a transfer that has stopped moving. */
const STALL_TIMEOUT_MS = 90_000;
/** A month is about 30 MB; anything far larger is not a BTS month. */
const MAX_BYTES = 200 * 1024 * 1024;
const PAUSE_MS = 2_000;
const HEADERS = { "user-agent": "bts-ontime-refresh" };

interface Args {
  dir: string;
  end: string | null;
  table: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: "", end: null, table: "backend/src/lib/onTime/bts-ontime.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--dir") args.dir = argv[++i] ?? "";
    else if (a === "--end") args.end = (argv[++i] ?? "").trim() || null;
    else if (a === "--table") args.table = argv[++i] ?? "";
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.dir) throw new Error("usage: bts-download.ts --dir <new, empty folder> [--end YYYY-MM] [--table <table.json>]");
  if (args.end !== null && !isMonth(args.end)) throw new Error(`--end ${args.end}: expected YYYY-MM`);
  return args;
}

function isMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** "2026-09" plus n months (n may be negative). */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** "2026-09" → the PREZIP URL, whose month is not zero-padded ("2026_9"). */
function urlFor(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${BASE}${y}_${m}.zip`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn` up to ATTEMPTS times, waiting 5 s, 15 s, 45 s between tries. */
async function withRetries<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < ATTEMPTS) {
        const wait = 5_000 * 3 ** (attempt - 1);
        console.error(`${what}: ${message}; retrying in ${wait / 1000} s (attempt ${attempt + 1} of ${ATTEMPTS})`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`${what}: gave up after ${ATTEMPTS} attempts: ${last instanceof Error ? last.message : String(last)}`);
}

/**
 * Whether the month's file is published: a ranged GET of its first bytes. A 404 means not yet; a
 * file that starts like a ZIP means yes; anything else (a refusal, a server error, an HTML page
 * with 200) throws, so a run never mistakes an outage for "no new month".
 */
async function isPublished(month: string): Promise<boolean> {
  return withRetries(`probe ${month}`, async () => {
    const res = await fetch(urlFor(month), {
      headers: { ...HEADERS, range: "bytes=0-3" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.status === 404) {
      await res.body?.cancel();
      return false;
    }
    if (res.status !== 200 && res.status !== 206) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    const head = Buffer.from(value ?? new Uint8Array());
    if (head.length < 4 || head.readUInt32LE(0) !== 0x04034b50) {
      throw new Error(`HTTP ${res.status} but not a ZIP (content-type ${res.headers.get("content-type") ?? "none"})`);
    }
    return true;
  });
}

async function latestPublished(now: Date): Promise<string> {
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (let back = 0; back <= PROBE_BACK; back += 1) {
    const month = addMonths(current, -back);
    const published = await isPublished(month);
    console.error(`${month}: ${published ? "published" : "not published yet"}`);
    if (published) return month;
  }
  throw new Error(`no published month found between ${addMonths(current, -PROBE_BACK)} and ${current}`);
}

/** Streams one month into `dest`, with a size cap and a timeout, then checks it is a ZIP with one CSV. */
async function download(month: string, dest: string): Promise<number> {
  return withRetries(`download ${month}`, async () => {
    const part = `${dest}.part`;
    const stall = new AbortController();
    let stallTimer = setTimeout(() => stall.abort(new Error(`no data for ${STALL_TIMEOUT_MS / 1000} s`)), STALL_TIMEOUT_MS);
    const moved = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => stall.abort(new Error(`no data for ${STALL_TIMEOUT_MS / 1000} s`)), STALL_TIMEOUT_MS);
    };
    try {
      const signal = AbortSignal.any([stall.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]);
      const res = await fetch(urlFor(month), { headers: HEADERS, signal });
      if (res.status !== 200 || !res.body) {
        await res.body?.cancel();
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const expected = Number(res.headers.get("content-length") ?? NaN);
      if (expected > MAX_BYTES) {
        await res.body.cancel();
        throw new Error(`${expected} bytes is more than a BTS month`);
      }
      let bytes = 0;
      const count = new Transform({
        transform(chunk: Buffer, _enc, done) {
          bytes += chunk.length;
          moved();
          done(bytes > MAX_BYTES ? new Error(`more than ${MAX_BYTES} bytes`) : null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), count, createWriteStream(part));
      if (Number.isFinite(expected) && bytes !== expected) throw new Error(`got ${bytes} of ${expected} bytes`);
      const csv = (await listZip(part)).filter((m) => /\.csv$/i.test(m.name));
      if (csv.length !== 1) throw new Error(`expected one CSV in the ZIP, found ${csv.length}`);
      await rename(part, dest);
      return bytes;
    } catch (err) {
      await rm(part, { force: true });
      throw err;
    } finally {
      clearTimeout(stallTimer);
    }
  });
}

async function setOutputs(values: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
}

async function notice(message: string): Promise<void> {
  console.log(process.env.GITHUB_ACTIONS === "true" ? `::notice title=BTS on-time refresh::${message}` : message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const table = JSON.parse(await readFile(args.table, "utf8")) as { from?: unknown; to?: unknown };
  if (typeof table.to !== "string" || !isMonth(table.to)) throw new Error(`${args.table}: no "to" month`);
  const committed = table.to;

  let end: string;
  if (args.end) {
    if (!(await isPublished(args.end))) throw new Error(`${args.end} is not published on TranStats`);
    end = args.end;
    console.error(`--end ${end}: building the ${MONTHS} months ending there (the table ends ${committed})`);
  } else {
    end = await latestPublished(new Date());
    if (end === committed) {
      await notice(`No new month: the latest published BTS month is ${end}, and the table already ends there.`);
      await setOutputs({ status: "none", end });
      return;
    }
    if (end < committed) {
      throw new Error(`the latest month found (${end}) is older than the table's (${committed}): is TranStats serving every file?`);
    }
  }

  const from = addMonths(end, -(MONTHS - 1));
  const dir = resolve(args.dir);
  await mkdir(dir, { recursive: true });
  if ((await readdir(dir)).length > 0) throw new Error(`${dir} is not empty: give the downloads a new, empty folder`);

  const files: string[] = [];
  const started = Date.now();
  for (let i = 0; i < MONTHS; i += 1) {
    const month = addMonths(from, i);
    const dest = join(dir, `bts-${month}.zip`);
    const t = Date.now();
    const bytes = await download(month, dest);
    console.error(`${month}: ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(1)} s`);
    files.push(dest);
    if (i < MONTHS - 1) await sleep(PAUSE_MS);
  }
  console.log(`downloaded ${from} to ${end} (${MONTHS} files) into ${dir} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  await setOutputs({ status: "new", from, end, files: files.join(" ") });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
