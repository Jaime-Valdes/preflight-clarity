/*
 * Precomputes version D's airline on-time table from the US DOT's monthly files
 * (docs/REAL_DATA.md, "Status: airline on-time from BTS").
 *
 *   npx tsx backend/scripts/bts-ontime.ts --out backend/data/bts-ontime.json <month.zip> … (12 files)
 *
 * Each input is a TranStats "Reporting Carrier On-Time Performance (1987-present)" monthly
 * download (PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_YYYY_M.zip) or the
 * CSV inside one. The months are read from the rows, not the file names, and must be consecutive
 * with none repeated (pass --allow-gaps to skip that check). Writes the compact OnTimeTable JSON
 * and prints the period, the industry figure, the carriers and the size.
 */
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { aggregateCsv, MIN_CARRIER_FLIGHTS, MIN_ROUTE_FLIGHTS, OnTimeAggregator } from "./bts/aggregate";
import { openZipCsv } from "./bts/zip";

const SOURCE = "US DOT Bureau of Transportation Statistics, Reporting Carrier On-Time Performance (1987-present), TranStats PREZIP monthly files";

interface Args {
  out: string;
  inputs: string[];
  allowGaps: boolean;
  minRouteFlights: number;
  minCarrierFlights: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: "", inputs: [], allowGaps: false, minRouteFlights: MIN_ROUTE_FLIGHTS, minCarrierFlights: MIN_CARRIER_FLIGHTS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--out") args.out = argv[++i] ?? "";
    else if (a === "--allow-gaps") args.allowGaps = true;
    else if (a === "--min-route-flights") args.minRouteFlights = Number(argv[++i]);
    else if (a === "--min-carrier-flights") args.minCarrierFlights = Number(argv[++i]);
    else args.inputs.push(a);
  }
  if (!args.out || args.inputs.length === 0) {
    throw new Error("usage: bts-ontime.ts --out <table.json> [--allow-gaps] [--min-route-flights N] <month.zip|month.csv> …");
  }
  return args;
}

/** "2025-10" → the next month. */
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const agg = new OnTimeAggregator();
  for (const input of args.inputs) {
    const before = agg.monthsSeen();
    const isZip = /\.zip$/i.test(input);
    const { name, stream } = isZip ? await openZipCsv(input) : { name: input, stream: createReadStream(input) };
    const started = Date.now();
    const lines = await aggregateCsv(stream, agg);
    const added = agg.monthsSeen().filter((m) => !before.includes(m));
    console.error(`${name}: ${lines.toLocaleString("en-US")} flights, months ${added.join(", ") || "(none new)"} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (added.length === 0 && !args.allowGaps) throw new Error(`${input}: its month was already counted (a file passed twice?)`);
  }
  const months = agg.monthsSeen();
  if (!args.allowGaps) {
    for (let i = 1; i < months.length; i += 1) {
      if (months[i] !== nextMonth(months[i - 1]!)) throw new Error(`months are not consecutive: ${months[i - 1]} then ${months[i]}`);
    }
  }
  const table = agg.table({ source: SOURCE, minCarrierFlights: args.minCarrierFlights, minRouteFlights: args.minRouteFlights });
  await writeFile(args.out, `${JSON.stringify(table)}\n`);
  const bytes = (await stat(args.out)).size;
  const routeFigures = Object.values(table.routes).reduce((n, r) => n + Object.keys(r).length, 0);
  console.log(`period ${table.from} to ${table.to} (${months.length} months), ${table.industry[1].toLocaleString("en-US")} flights`);
  console.log(`industry ${table.industry[0]}% on time; ${agg.unknownArrivals} flown flights without an arrival indicator, ${agg.skipped} lines skipped`);
  console.log(`left out (reported in only some months): ${agg.partialCarriers().join(", ") || "none"}`);
  console.log(`carriers: ${Object.entries(table.carriers).map(([c, [p, n]]) => `${c} ${p}% (${n})`).join(", ")}`);
  console.log(`routes: ${Object.keys(table.routes).length} with ${routeFigures} carrier figures (≥ ${table.minRouteFlights} flights)`);
  console.log(`wrote ${args.out}: ${bytes.toLocaleString("en-US")} bytes`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
