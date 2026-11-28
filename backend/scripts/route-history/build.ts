/*
 * Builds version D's bundled route-history table (docs/REAL_DATA.md, "Status: route history from
 * MADIS") from the month files madis-month.ts writes. Run from the repo root:
 *
 *   npx tsx backend/scripts/route-history/build.ts [--months backend/route-history/months] [--out <table.json>] [--summary <pr-body.md>]
 *
 * Every month file is checked (its shape, and that its counts add up) before anything is written.
 * The table sums the months by calendar month — every January in the files together, and so on —
 * so a pair's January is all the Januaries there are; the API words the figure for the month a
 * flight is in. With --summary it also writes the pull request's description: the months in the
 * table, and the coverage per calendar month against the routes US carriers fly.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CELLS, C } from "./analyze";
import { flownPairs, routeAirports } from "./madis-month";

const MONTHS_DIR = "backend/route-history/months";
const TABLE = "backend/src/lib/routeHistory/route-history.json";
const BTS_TABLE = "backend/src/lib/onTime/bts-ontime.json";
/** A pair's month is shown from this many flights (the API's own rule, repeated here for the summary). */
const SHOWN_FROM = 30;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthFile {
  version: 1;
  month: string;
  hours: { expected: number; read: number };
  national: [number, number, number];
  pairs: Record<string, number[]>;
}

export interface RouteHistoryTableFile {
  version: 1;
  source: string;
  definition: string;
  /** The months in the table, "YYYY-MM", oldest first. */
  months: string[];
  /** By calendar month (0 = January): [flights, smooth, calm] for flights matched to a US route pair. */
  national: Array<[number, number, number]>;
  /** "ATL-CHS" → by calendar month, the pair's CELLS counts (analyze.ts), or null. */
  pairs: Record<string, Array<number[] | null>>;
}

function parseArgs(argv: string[]) {
  const args = { months: MONTHS_DIR, out: TABLE, summary: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--months") args.months = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? "";
    else if (a === "--summary") args.summary = argv[++i] ?? "";
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

/** Throws unless the month file's counts are whole, non-negative and add up. */
export function checkMonth(m: MonthFile, file: string): void {
  const fail = (why: string) => {
    throw new Error(`${file}: ${why}`);
  };
  if (m.version !== 1) fail(`version ${String(m.version)}`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) || !file.endsWith(`${m.month}.json`)) fail("month does not match the file name");
  if (!Array.isArray(m.national) || m.national.length !== 3 || !m.national.every(isCount)) fail("national counts");
  if (!m.pairs || typeof m.pairs !== "object") fail("no pairs");
  for (const [pk, c] of Object.entries(m.pairs)) {
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(pk) || pk.slice(0, 3) >= pk.slice(4)) fail(`pair key ${pk}`);
    if (!Array.isArray(c) || c.length !== CELLS || !c.every(isCount)) fail(`${pk}: not ${CELLS} counts`);
    const n = c[C.n];
    if (c[C.smooth] > c[C.calm] || c[C.calm] > n || c[C.own] > n) fail(`${pk}: smooth ≤ calm ≤ flights does not hold`);
    if (c[C.where] + c[C.where + 1] + c[C.where + 2] !== n - c[C.smooth]) fail(`${pk}: where-counts do not add up`);
    let windows = 0;
    for (let w = 0; w < 8; w++) {
      const [wn, ws] = [c[C.ab + 2 * w], c[C.ab + 2 * w + 1]];
      if (ws > wn) fail(`${pk}: a window has more smooth flights than flights`);
      windows += wn;
    }
    if (windows !== n) fail(`${pk}: window counts do not add up`);
  }
}

export function buildTable(months: MonthFile[]): RouteHistoryTableFile {
  const national: Array<[number, number, number]> = Array.from({ length: 12 }, () => [0, 0, 0]);
  const pairs: Record<string, Array<number[] | null>> = {};
  for (const m of months) {
    const mi = Number(m.month.slice(5)) - 1;
    for (let k = 0; k < 3; k++) national[mi][k] += m.national[k];
    for (const [pk, c] of Object.entries(m.pairs)) {
      const row = (pairs[pk] ??= Array.from({ length: 12 }, () => null));
      const cell = (row[mi] ??= new Array<number>(CELLS).fill(0));
      for (let k = 0; k < CELLS; k++) cell[k] += c[k];
    }
  }
  return {
    version: 1,
    source: "NOAA MADIS ACARS, public archive: the eddy dissipation rate (EDR) many US airliners report automatically at cruise",
    definition:
      "Flights counted for a route: its own trips, plus other flights that cruised along at least half of its great circle within 50 nm. " +
      "Smooth: no reading above EDR 0.10 at cruise (ICAO's 'nil' for a medium jet). Calm: none at 0.20 or above (below ICAO's 'moderate').",
    months: months.map((m) => m.month).sort(),
    national,
    pairs: Object.fromEntries(Object.keys(pairs).sort().map((k) => [k, pairs[k]])),
  };
}

/** One pair per line, so the table's diff reads route by route. */
export function tableText(t: RouteHistoryTableFile): string {
  const { pairs, ...head } = t;
  const lines = Object.keys(pairs).map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(pairs[k])}`);
  const text = `${JSON.stringify(head, null, 2).replace(/\n}$/, "")},\n  "pairs": {\n${lines.join(",\n")}\n  }\n}\n`;
  JSON.parse(text);
  return text;
}

async function summary(t: RouteHistoryTableFile, months: MonthFile[]): Promise<string> {
  const pairs = await flownPairs(routeAirports());
  const bts = JSON.parse(await readFile(BTS_TABLE, "utf8")) as { routes: Record<string, Record<string, [number, number]>> };
  const yearly = (k: string) => Object.values(bts.routes[k] ?? {}).reduce((s, v) => s + v[1], 0);
  const weight = new Map(pairs.map((pk) => { const [a, b] = pk.split("-"); return [pk, yearly(`${a}-${b}`) + yearly(`${b}-${a}`)]; }));
  const total = [...weight.values()].reduce((s, v) => s + v, 0);
  const rows: string[] = [];
  for (let mi = 0; mi < 12; mi++) {
    const [n, s] = t.national[mi];
    if (n === 0) continue;
    const shown = pairs.filter((pk) => (t.pairs[pk]?.[mi]?.[C.n] ?? 0) >= SHOWN_FROM);
    const share = shown.reduce((acc, pk) => acc + (weight.get(pk) ?? 0), 0) / Math.max(1, total);
    const years = t.months.filter((m) => Number(m.slice(5)) - 1 === mi).join(", ");
    rows.push(`| ${MONTH_NAMES[mi]} (${years}) | ${n.toLocaleString("en-US")} | ${((100 * s) / n).toFixed(1)}% | ${shown.length} of ${pairs.length} | ${(100 * share).toFixed(1)}% |`);
  }
  const hours = months.map((m) => `${m.month} ${m.hours.read}/${m.hours.expected}`).join(", ");
  return [
    `Route history table: NOAA MADIS ACARS, ${t.months[0]} to ${t.months[t.months.length - 1]} (${t.months.length} months).`,
    "",
    "Built by `.github/workflows/route-history.yml` (backend/scripts/route-history). Version D's cruise ratings read it; merging deploys it.",
    "",
    `| Calendar month | Flights on US routes | Smooth cruise | Pairs with ≥${SHOWN_FROM} flights | Share of scheduled US flights covered |`,
    "|---|---|---|---|---|",
    ...rows,
    "",
    `Hours read per month: ${hours}.`,
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const files = (await readdir(args.months)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no month files in ${args.months}`);
  const months: MonthFile[] = [];
  for (const f of files) {
    const m = JSON.parse(await readFile(join(args.months, f), "utf8")) as MonthFile;
    checkMonth(m, f);
    months.push(m);
  }
  const table = buildTable(months);
  await writeFile(args.out, tableText(table));
  console.log(`${args.out}: ${table.months.length} months (${table.months.join(", ")}), ${Object.keys(table.pairs).length} pairs`);
  if (args.summary) await writeFile(args.summary, `${await summary(table, months)}\n`);
}

if (process.argv[1] && /build\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
