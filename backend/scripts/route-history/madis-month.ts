/*
 * One month of version D's route history (docs/REAL_DATA.md, "Status: route history from MADIS"):
 * downloads the month's hourly ACARS files from NOAA MADIS's public archive, keeps the readings
 * that carry turbulence (EDR), and writes the month's counts per US route pair (analyze.ts) to
 * backend/route-history/months/YYYY-MM.json. Run from the repo root:
 *
 *   npx tsx backend/scripts/route-history/madis-month.ts --month YYYY-MM --dir <folder of its own> [--keep] [--out <file>]
 *
 * The hourly files go into <dir>/DD/YYYYMMDD_HH00.gz; a file already there is used as it is (so a
 * local run can reuse a download), and each is deleted once read unless --keep. They are untrusted
 * data: give the script a folder of its own and never commit them. About 1.1 GB a month, three
 * downloads at a time with retries; an hour the archive does not have is counted, and the run fails
 * when more than 5% of the month's hours are missing. The archive is NOAA's (madis-data.ncep.noaa.gov,
 * "archived data is available without restriction"); only these monthly counts leave the run.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync } from "node:zlib";
import { AIRPORTS } from "@preflight/shared/airports";
import { analyzeMonth, pairKey, ReadingsBuilder, type RouteAirport } from "./analyze";
import { openNetcdf, readNumbers, readStrings } from "./netcdf";

const ARCHIVE = "https://madis-data.ncep.noaa.gov/madisPublic1/data/archive";
const HEADERS = { "user-agent": "route-history-refresh" };
const PARALLEL = 3;
const ATTEMPTS = 4;
const TIMEOUT_MS = 5 * 60_000;
/** An hourly file is 1–3 MB; anything far larger is not one. */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_MISSING_SHARE = 0.05;
/** The US airports whose ICAO code is not K + the IATA code. */
const ICAO: Record<string, string> = { HNL: "PHNL", OGG: "PHOG", KOA: "PHKO", LIH: "PHLI", ITO: "PHTO", ANC: "PANC", FAI: "PAFA", JNU: "PAJN", SJU: "TJSJ", STT: "TIST", GUM: "PGUM" };
const BTS_TABLE = "backend/src/lib/onTime/bts-ontime.json";

interface Args {
  month: string;
  dir: string;
  out: string;
  keep: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { month: "", dir: "", out: "", keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--month") args.month = argv[++i] ?? "";
    else if (a === "--dir") args.dir = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? "";
    else if (a === "--keep") args.keep = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month) || !args.dir) {
    throw new Error("usage: madis-month.ts --month YYYY-MM --dir <folder of its own> [--keep] [--out <file>]");
  }
  if (!args.out) args.out = `backend/route-history/months/${args.month}.json`;
  return args;
}

/** The catalogue's US airports (and Puerto Rico's), with the ICAO code the archive's truncated codes start with. */
export function routeAirports(): RouteAirport[] {
  return AIRPORTS.filter((a) => a.country === "US" || a.country === "PR").map((a) => ({ code: a.code, lat: a.lat, lon: a.lon, tz: a.tz, icao: ICAO[a.code] ?? `K${a.code}` }));
}

/** The pairs US carriers fly between catalogue airports (the on-time table's routes, either direction). */
export async function flownPairs(airports: readonly RouteAirport[], btsTable = BTS_TABLE): Promise<string[]> {
  const codes = new Set(airports.map((a) => a.code));
  const table = JSON.parse(await readFile(btsTable, "utf8")) as { routes: Record<string, unknown> };
  const pairs = new Set<string>();
  for (const k of Object.keys(table.routes)) {
    const [o, d] = k.split("-");
    if (o && d && o !== d && codes.has(o) && codes.has(d)) pairs.add(pairKey(o, d));
  }
  return [...pairs].sort();
}

function hoursOf(month: string): Array<{ day: string; file: string; url: string }> {
  const [y, m] = month.split("-");
  const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const out: Array<{ day: string; file: string; url: string }> = [];
  for (let d = 1; d <= days; d++) {
    const dd = String(d).padStart(2, "0");
    for (let h = 0; h < 24; h++) {
      const file = `${y}${m}${dd}_${String(h).padStart(2, "0")}00.gz`;
      out.push({ day: dd, file, url: `${ARCHIVE}/${y}/${m}/${dd}/point/acars/netcdf/${file}` });
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The file at `path` (downloaded unless it is already there), or null when the archive has no such hour. */
async function fetchHour(url: string, path: string): Promise<string | null> {
  try {
    if ((await stat(path)).size > 0) return path;
  } catch {
    // not there yet
  }
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (res.status === 404) {
        void res.body?.cancel().catch(() => {});
        return null;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) throw new Error(`${length} bytes is too large for an hourly file`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(`${path}.part`));
      if ((await stat(`${path}.part`)).size > MAX_BYTES) throw new Error("too large for an hourly file");
      await rename(`${path}.part`, path);
      return path;
    } catch (err) {
      await rm(`${path}.part`, { force: true });
      if (attempt === ATTEMPTS) throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(5_000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** The readings in one hourly file that carry EDR, added to `into`; returns how many. */
export function extractHour(gz: Buffer, into: ReadingsBuilder): number {
  const nc = openNetcdf(gunzipSync(gz, { maxOutputLength: 512 * 1024 * 1024 }));
  const edrAll = readNumbers(nc, "maxEDR");
  const rows: number[] = [];
  for (let i = 0; i < edrAll.length; i++) if (edrAll[i] >= 0 && edrAll[i] < 10) rows.push(i);
  if (rows.length === 0) return 0;
  const tail = readStrings(nc, "en_tailNumber", rows);
  const o3 = readStrings(nc, "origAirport", rows);
  const d3 = readStrings(nc, "destAirport", rows);
  const t = readNumbers(nc, "timeObs", rows);
  const alt = readNumbers(nc, "altitude", rows);
  const lat = readNumbers(nc, "latitude", rows);
  const lon = readNumbers(nc, "longitude", rows);
  const before = into.length;
  for (let k = 0; k < rows.length; k++) into.add(tail[k], o3[k], d3[k], t[k], alt[k], lat[k], lon[k], edrAll[rows[k]]);
  return into.length - before;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const airports = routeAirports();
  const pairs = await flownPairs(airports);
  const hours = hoursOf(args.month);
  const builder = new ReadingsBuilder();
  let read = 0;
  let missing = 0;
  let unreadable = 0;
  let next = 0;
  const worker = async () => {
    while (next < hours.length) {
      const h = hours[next++]!;
      const path = await fetchHour(h.url, join(args.dir, h.day, h.file));
      if (!path) {
        missing++;
        continue;
      }
      try {
        extractHour(await readFile(path), builder);
        read++;
      } catch (err) {
        unreadable++;
        console.warn(`${h.file}: unreadable (${err instanceof Error ? err.message : String(err)}), counted as missing`);
      }
      if (!args.keep) await rm(path, { force: true });
      if ((read + missing + unreadable) % 72 === 0) console.log(`${args.month}: ${read + missing + unreadable}/${hours.length} hours, ${builder.length} readings, ${Math.round((Date.now() - started) / 1000)} s`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const gone = missing + unreadable;
  if (gone > MAX_MISSING_SHARE * hours.length) throw new Error(`${args.month}: ${gone} of ${hours.length} hours missing or unreadable, more than ${MAX_MISSING_SHARE * 100}%`);

  const counts = analyzeMonth(builder.build(), airports, pairs);
  const body = {
    version: 1,
    month: args.month,
    source: "NOAA MADIS ACARS, public archive (madis-data.ncep.noaa.gov): airliners' eddy dissipation rate (EDR) reports",
    method: "backend/scripts/route-history/analyze.ts",
    hours: { expected: hours.length, read, missing, unreadable },
    readings: builder.length,
    flights: counts.flights,
    identified: counts.identified,
    national: counts.national,
    pairs: counts.pairs,
  };
  // One pair per line, so a month's diff reads route by route.
  const lines = Object.keys(body.pairs)
    .sort()
    .map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(body.pairs[k])}`);
  const { pairs: _pairs, ...head } = body;
  const text = `${JSON.stringify(head, null, 2).replace(/\n}$/, "")},\n  "pairs": {\n${lines.join(",\n")}\n  }\n}\n`;
  JSON.parse(text);
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, text);
  const covered = Object.values(counts.pairs).filter((c) => c[0] >= 30).length;
  console.log(
    `${args.month}: ${read}/${hours.length} hours read (${missing} missing, ${unreadable} unreadable), ${builder.length} readings, ${counts.flights} flights with a cruise, ` +
      `${counts.identified} matched to a route; ${Object.keys(counts.pairs).length} of ${pairs.length} pairs with flights, ${covered} with 30 or more; ` +
      `${(100 * counts.national[1] / Math.max(1, counts.national[0])).toFixed(1)}% smooth overall → ${args.out} (${Math.round((Date.now() - started) / 1000)} s)`,
  );
}

if (process.argv[1] && /madis-month\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
