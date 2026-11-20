/*
 * Version D — the airline's on-time record (docs/REAL_DATA.md, "Status: airline on-time from BTS").
 *
 * The figures are the US DOT Bureau of Transportation Statistics' own flight-by-flight records
 * (Reporting Carrier On-Time Performance), counted the way DOT's Air Travel Consumer Report counts
 * them: a flight is on time when it arrives less than 15 minutes after its scheduled arrival, and a
 * cancelled or diverted flight counts as not on time. backend/scripts/bts-ontime.ts turns twelve
 * monthly files into OnTimeTable (backend/data/bts-ontime.json); GET /flights/day attaches the part
 * of it a route-day needs (RouteOnTime); D's pages read it through airlineOnTime and word it with
 * onTimeCopy. Versions A, B and C never come here: they keep the generator's airlineStats.
 *
 * Pure: no fetch, no clock, no Node APIs.
 */

/** [on-time share in %, one decimal; scheduled flights counted]. */
export type OnTimeCell = readonly [pct: number, flights: number];

/** The precomputed table (backend/data/bts-ontime.json), compact: cells rather than objects. */
export interface OnTimeTable {
  /** Where the figures come from, for the team. */
  source: string;
  /** How on time is counted, for the team. */
  definition: string;
  /** First and last month covered, "YYYY-MM". */
  from: string;
  to: string;
  /** A carrier's network figure is kept only past this many scheduled flights in the period. */
  minCarrierFlights: number;
  /** A carrier's figure on one route (origin → destination, one direction) only past this many. */
  minRouteFlights: number;
  /** Every reporting carrier's flights together: the benchmark. */
  industry: OnTimeCell;
  /** By carrier code (the operating carrier, as BTS and AeroDataBox both give it). */
  carriers: Record<string, OnTimeCell>;
  /** "JFK-LAX" → carrier → figure. */
  routes: Record<string, Record<string, OnTimeCell>>;
}

export interface OnTimeFigure {
  /** On-time share in %, one decimal. */
  pct: number;
  /** Scheduled flights counted. */
  flights: number;
}

/**
 * What GET /flights/day attaches to a route-day (`onTime` beside `schedule`): the period, the
 * industry figure, every carrier's network figure (a couple of dozen at most, so a carrier the day
 * lists but the table's routes don't still gets one) and the figures for the day's routes.
 */
export interface RouteOnTime {
  source: "bts";
  from: string;
  to: string;
  industry: OnTimeFigure;
  carriers: Record<string, OnTimeFigure>;
  /** "JFK-LAX" → carrier → figure; only the routes asked for, and only carriers past the sample floor. */
  routes: Record<string, Record<string, OnTimeFigure>>;
}

/** One airline's record as D shows it: whole percents, null where there is no figure. */
export interface AirlineOnTime {
  /** Across the carrier's flights within the US; null when BTS has no figure for the carrier. */
  network: number | null;
  /** On this route, this direction; null when there is no figure (another country, too few flights). */
  route: number | null;
  /** Every reporting carrier together over the same months. */
  industry: number;
  /** "Oct 2025–Sep 2026". */
  period: string;
}

/** "JFK" + "LAX" → "JFK-LAX". */
export function onTimeRouteKey(origin: string, destination: string): string {
  return `${origin.trim().toUpperCase()}-${destination.trim().toUpperCase()}`;
}

const figure = ([pct, flights]: OnTimeCell): OnTimeFigure => ({ pct, flights });

/**
 * The part of the table a route-day needs: the period, the industry and network figures, and the
 * routes given (each "ORIGIN-DEST" once; a route the table has nothing for is left out).
 */
export function routeOnTime(table: OnTimeTable, routes: ReadonlyArray<readonly [origin: string, destination: string]>): RouteOnTime {
  const carriers: Record<string, OnTimeFigure> = {};
  for (const [code, cell] of Object.entries(table.carriers)) carriers[code] = figure(cell);
  const picked: Record<string, Record<string, OnTimeFigure>> = {};
  for (const [origin, destination] of routes) {
    const key = onTimeRouteKey(origin, destination);
    const row = table.routes[key];
    if (!row || picked[key]) continue;
    const byCarrier: Record<string, OnTimeFigure> = {};
    for (const [code, cell] of Object.entries(row)) byCarrier[code] = figure(cell);
    picked[key] = byCarrier;
  }
  return { source: "bts", from: table.from, to: table.to, industry: figure(table.industry), carriers, routes: picked };
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2025-10" → "Oct 2025"; anything else as it is. */
export function monthLabel(month: string): string {
  const m = MONTH.exec(month);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : month;
}

/** "Oct 2025–Sep 2026" (one month: "Sep 2026"). */
export function onTimePeriod(from: string, to: string): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)}–${monthLabel(to)}`;
}

function isFigure(value: unknown): value is OnTimeFigure {
  if (!value || typeof value !== "object") return false;
  const { pct, flights } = value as { pct?: unknown; flights?: unknown };
  return typeof pct === "number" && pct >= 0 && pct <= 100 && typeof flights === "number" && flights > 0;
}

function isFigureMap(value: unknown): value is Record<string, OnTimeFigure> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(isFigure);
}

/** A RouteOnTime as the browser receives it, checked field by field (an older API sends none). */
export function isRouteOnTime(value: unknown): value is RouteOnTime {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.source === "bts" &&
    typeof v.from === "string" &&
    MONTH.test(v.from) &&
    typeof v.to === "string" &&
    MONTH.test(v.to) &&
    isFigure(v.industry) &&
    isFigureMap(v.carriers) &&
    !!v.routes &&
    typeof v.routes === "object" &&
    Object.values(v.routes as object).every(isFigureMap)
  );
}

/**
 * The airline's record on a route from what the day carries, or null when the day carries none (the
 * browser's own illustrative day, or an API from before this step). A carrier BTS has no figure
 * for gets network and route null; one with a network figure gets its route figure where the
 * route has one.
 */
export function airlineOnTime(block: RouteOnTime | null | undefined, airline: string, origin: string, destination: string): AirlineOnTime | null {
  if (!block) return null;
  const code = airline.trim().toUpperCase();
  const net = block.carriers[code];
  const route = net ? block.routes[onTimeRouteKey(origin, destination)]?.[code] : undefined;
  return {
    network: net ? Math.round(net.pct) : null,
    route: route ? Math.round(route.pct) : null,
    industry: Math.round(block.industry.pct),
    period: onTimePeriod(block.from, block.to),
  };
}

/** The credit wherever a figure shows: "On-time: US DOT, BTS · Oct 2025–Sep 2026". */
export function onTimeSource(period: string): string {
  return `On-time: US DOT, BTS · ${period}`;
}

/** What D says in place of a figure: calm, plain, and true for every reason there is none. */
export const ON_TIME_NOT_AVAILABLE = {
  main: "On-time record not available",
  short: "Not available",
  sub: "The US DOT publishes on-time figures for the larger US airlines, for flights within the US",
  /** For a narrow cell (the compare table). */
  brief: "The US DOT has no figure for this airline",
} as const;

/** What D says when the day came without figures (the browser's own illustrative day): nothing is wrong with the airline. */
export const ON_TIME_NOT_LOADED = {
  main: "On-time record not available",
  short: "Not available",
  sub: "The US DOT figures did not load this time",
  brief: "The US DOT figures did not load",
} as const;

/** The definition as D words it (DOT's Air Travel Consumer Report). */
export const ON_TIME_DEFINITION =
  "On time means arriving less than 15 minutes after the scheduled time; a cancelled or diverted flight counts as not on time.";

/** The not-available copy that fits: no figure for the airline, or no figures at all for the day. */
export function onTimeMissing(record: AirlineOnTime | null): typeof ON_TIME_NOT_AVAILABLE | typeof ON_TIME_NOT_LOADED {
  return record ? ON_TIME_NOT_AVAILABLE : ON_TIME_NOT_LOADED;
}

/** The airline section's collapsed line: "81% on time, Oct 2025–Sep 2026", or the not-available line. */
export function onTimeTeaser(record: AirlineOnTime | null): string {
  return record && record.network !== null ? `${record.network}% on time, ${record.period}` : ON_TIME_NOT_AVAILABLE.main;
}

/** The line under the network figure: "Across the airline’s US flights · 79% on this route" (the route part only with a route figure). */
export function onTimeDetail(record: AirlineOnTime): string {
  const across = "Across the airline’s US flights";
  return record.route === null ? across : `${across} · ${record.route}% on this route`;
}
