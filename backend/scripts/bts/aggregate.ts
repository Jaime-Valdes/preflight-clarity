/*
 * The BTS on-time aggregation (docs/REAL_DATA.md, "Status: airline on-time from BTS"): one pass
 * over the monthly Reporting Carrier On-Time Performance CSVs, counting each scheduled flight once
 * for the industry, its carrier and its carrier on its route (origin → destination, one
 * direction). DOT's definition, as its Air Travel Consumer Report applies it: on time is arriving
 * less than 15 minutes after the scheduled arrival (ArrDel15 = 0); a cancelled or diverted flight
 * is counted and is not on time. The result is shared/src/onTime.ts's OnTimeTable.
 */
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { OnTimeCell, OnTimeTable } from "@preflight/shared/onTime";

/** The columns the count needs, by their BTS names. */
export const BTS_COLUMNS = ["Year", "Month", "IATA_CODE_Reporting_Airline", "Origin", "Dest", "ArrDel15", "Cancelled", "Diverted"] as const;

/** One flight as the count reads it. */
export interface BtsFlight {
  year: number;
  month: number;
  carrier: string;
  origin: string;
  dest: string;
  /** "1.00", "0.00", or "" (no arrival: cancelled or diverted). */
  arrDel15: string;
  cancelled: string;
  diverted: string;
}

/** A network figure needs this many scheduled flights over the period (every reporting carrier has far more). */
export const MIN_CARRIER_FLIGHTS = 1000;
/**
 * A route figure needs this many scheduled flights over the period: about four a week for a year.
 * At an on-time share near 80% the figure's standard error is then under 3 points
 * (sqrt(0.8 × 0.2 / 200) ≈ 0.028), and no single day's flights move it by more than a point or two.
 */
export const MIN_ROUTE_FLIGHTS = 200;

/**
 * Splits one CSV line (RFC 4180 quoting; BTS quotes text such as "New York, NY"; no line breaks
 * inside fields). `maxFields` stops after that many fields (a BTS line has 110; the count reads 50).
 */
export function parseCsvLine(line: string, maxFields = Infinity): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i <= n && out.length < maxFields) {
    if (line[i] === '"') {
      let value = "";
      i += 1;
      while (i < n) {
        const ch = line[i]!;
        if (ch === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      out.push(value);
      // Past the closing quote: up to the next comma.
      while (i < n && line[i] !== ",") i += 1;
      i += 1;
    } else {
      const comma = line.indexOf(",", i);
      const end = comma === -1 ? n : comma;
      out.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

const truthy = (value: string) => Number(value) === 1;

/** The flight is on time by DOT's definition: flown to its destination and arrived less than 15 minutes late. */
export function isOnTime(f: Pick<BtsFlight, "arrDel15" | "cancelled" | "diverted">): boolean {
  return !truthy(f.cancelled) && !truthy(f.diverted) && f.arrDel15.trim() !== "" && Number(f.arrDel15) === 0;
}

interface Count {
  flights: number;
  onTime: number;
}

const add = (map: Map<string, Count>, key: string, onTime: boolean) => {
  const c = map.get(key) ?? { flights: 0, onTime: 0 };
  c.flights += 1;
  if (onTime) c.onTime += 1;
  map.set(key, c);
};

const pct1 = (c: Count) => Math.round((c.onTime / c.flights) * 1000) / 10;
const cell = (c: Count): OnTimeCell => [pct1(c), c.flights];
const pad2 = (n: number) => String(n).padStart(2, "0");

export class OnTimeAggregator {
  private industry: Count = { flights: 0, onTime: 0 };
  private carriers = new Map<string, Count>();
  /** The months each carrier reported flights in. */
  private carrierMonths = new Map<string, Set<string>>();
  /** "JFK-LAX|AA". */
  private routes = new Map<string, Count>();
  private months = new Set<string>();
  /** Flown, not diverted, yet no arrival indicator: counted, as not on time. */
  unknownArrivals = 0;
  /** Lines without a carrier or airports: skipped. */
  skipped = 0;

  add(f: BtsFlight): void {
    const carrier = f.carrier.trim().toUpperCase();
    const origin = f.origin.trim().toUpperCase();
    const dest = f.dest.trim().toUpperCase();
    if (!carrier || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(dest) || !(f.month >= 1 && f.month <= 12) || !(f.year > 1986)) {
      this.skipped += 1;
      return;
    }
    const onTime = isOnTime(f);
    if (!onTime && !truthy(f.cancelled) && !truthy(f.diverted) && f.arrDel15.trim() === "") this.unknownArrivals += 1;
    const month = `${f.year}-${pad2(f.month)}`;
    this.months.add(month);
    if (!this.carrierMonths.has(carrier)) this.carrierMonths.set(carrier, new Set());
    this.carrierMonths.get(carrier)!.add(month);
    this.industry.flights += 1;
    if (onTime) this.industry.onTime += 1;
    add(this.carriers, carrier, onTime);
    add(this.routes, `${origin}-${dest}|${carrier}`, onTime);
  }

  /** "YYYY-MM" months seen, in order. */
  monthsSeen(): string[] {
    return [...this.months].sort();
  }

  /** Flights counted so far. */
  get flights(): number {
    return this.industry.flights;
  }

  /**
   * Carriers that reported in some months of the period but not all (a merger, a carrier that stopped flying):
   * left out, since their figure would not cover the period the page names.
   */
  partialCarriers(): string[] {
    const all = this.months.size;
    return [...this.carrierMonths.entries()].filter(([, m]) => m.size < all).map(([code]) => code).sort();
  }

  table(options: { source: string; minCarrierFlights?: number; minRouteFlights?: number }): OnTimeTable {
    const months = this.monthsSeen();
    if (months.length === 0) throw new Error("no flights counted");
    const minCarrierFlights = options.minCarrierFlights ?? MIN_CARRIER_FLIGHTS;
    const minRouteFlights = options.minRouteFlights ?? MIN_ROUTE_FLIGHTS;
    const partial = new Set(this.partialCarriers());
    const carriers: Record<string, OnTimeCell> = {};
    for (const code of [...this.carriers.keys()].sort()) {
      const c = this.carriers.get(code)!;
      if (c.flights >= minCarrierFlights && !partial.has(code)) carriers[code] = cell(c);
    }
    const routes: Record<string, Record<string, OnTimeCell>> = {};
    for (const key of [...this.routes.keys()].sort()) {
      const c = this.routes.get(key)!;
      const [route, code] = key.split("|") as [string, string];
      if (c.flights < minRouteFlights || !carriers[code]) continue;
      (routes[route] ??= {})[code] = cell(c);
    }
    return {
      source: options.source,
      definition:
        "On time: arrived less than 15 minutes after the scheduled arrival (ArrDel15 = 0). Every scheduled flight is counted; cancelled and diverted flights count as not on time (DOT Air Travel Consumer Report). The industry figure counts every reporting carrier's flights; a carrier figure needs flights in every month of the period.",
      from: months[0]!,
      to: months[months.length - 1]!,
      minCarrierFlights,
      minRouteFlights,
      industry: cell(this.industry),
      carriers,
      routes,
    };
  }
}

/** Feeds every data line of one BTS CSV to the aggregator; resolves to the number of lines read. */
export async function aggregateCsv(input: Readable, into: OnTimeAggregator): Promise<number> {
  const lines = createInterface({ input, crlfDelay: Infinity });
  let index: number[] | null = null;
  let width = Infinity;
  let read = 0;
  for await (const raw of lines) {
    const line = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    if (line.trim() === "") continue;
    const fields = parseCsvLine(line, width);
    if (!index) {
      const header = fields;
      index = BTS_COLUMNS.map((name) => {
        const at = header.indexOf(name);
        if (at < 0) throw new Error(`the CSV has no ${name} column`);
        return at;
      });
      width = Math.max(...index) + 1;
      continue;
    }
    const [year, month, carrier, origin, dest, arrDel15, cancelled, diverted] = index.map((at) => fields[at] ?? "");
    into.add({
      year: Number(year),
      month: Number(month),
      carrier: carrier!,
      origin: origin!,
      dest: dest!,
      arrDel15: arrDel15!,
      cancelled: cancelled!,
      diverted: diverted!,
    });
    read += 1;
  }
  if (!index) throw new Error("the CSV is empty");
  return read;
}
