/*
 * Version D — the route's turbulence history (docs/REAL_DATA.md, "Status: route history from MADIS").
 *
 * The figures are measured, not modelled: many US airliners report the eddy dissipation rate (EDR)
 * automatically several times a minute at cruise, and NOAA's MADIS archive keeps the reports.
 * backend/scripts/route-history counts, per US route pair and month, the flights along the route —
 * its own trips plus other flights that cruised along at least half of its path within 50 nm — and
 * how many had a smooth cruise (no reading above EDR 0.10, ICAO's "nil" for a medium jet) or a calm
 * one (none at 0.20 or above, below ICAO's "moderate"). The bundled table (RouteHistoryTable) sums
 * the months by calendar month; GET /flights/day attaches the part of it a route-day needs
 * (RouteHistoryDay), worded for the day's direction and month; D's cruise rating reads it
 * (shared/src/ratings.ts). Versions A, B and C never come here: they keep the generator's history.
 *
 * Pure: no fetch, no clock, no Node APIs.
 */

/** Local-time windows by the hour a flight sets off: [22, 5), [5, 12), [12, 17), [17, 22). */
export const WINDOWS = ["overnight", "morning", "afternoon", "evening"] as const;
export type TimeWindow = (typeof WINDOWS)[number];

export function windowOf(hour: number): number {
  return hour >= 22 || hour < 5 ? 0 : hour < 12 ? 1 : hour < 17 ? 2 : 3;
}

/**
 * One pair's counts for a month, a flat array (the month files and the table keep this shape):
 *  [0] flights counted, [1] smooth, [2] calm, [3] of them the pair's own trips,
 *  [4..6] not-smooth flights by where the strongest reading was (A → B, codes in alphabetical
 *  order: first, middle, last third), [7..14] A → B by window: flights, smooth (overnight,
 *  morning, afternoon, evening), [15..22] B → A, the same.
 */
export const CELLS = 23;
export const C = { n: 0, smooth: 1, calm: 2, own: 3, where: 4, ab: 7, ba: 15 } as const;

/** The bundled table (backend/src/lib/routeHistory/route-history.json, built by backend/scripts/route-history/build.ts). */
export interface RouteHistoryTable {
  version: 1;
  source: string;
  definition: string;
  /** The months in the table, "YYYY-MM", oldest first. */
  months: string[];
  /** By calendar month (0 = January): [flights, smooth, calm] for flights matched to a US route pair. */
  national: Array<readonly [number, number, number]>;
  /** "ATL-CHS" (alphabetical) → by calendar month, the pair's CELLS counts, or null. */
  pairs: Record<string, ReadonlyArray<readonly number[] | null>>;
}

/** A route's month is shown from this many flights; below it the neighbouring months are added, and below it again there is none. */
export const MIN_FLIGHTS = 30;
/** A time-of-day window needs this many flights to be compared or to shift a rating. */
export const MIN_WINDOW_FLIGHTS = 30;
/** "Where bumps come" needs this many flights that were not smooth. */
const MIN_BUMPY_FLIGHTS = 15;
/** …and one third of the route holding at least this share of them; otherwise they are spread along it. */
const WHERE_SHARE = 0.45;
/** One-sided 95%: the calmest window must beat the rest of the day by more than chance would. */
const CALMEST_Z = 1.645;

export type BumpWhere = "early" | "middle" | "late" | "spread";

export interface WindowFigure {
  window: TimeWindow;
  flights: number;
  /** One decimal. */
  smoothPct: number;
}

/** A route's measured history for one direction and the day's month (or its neighbours). */
export interface RouteHistoryFigures {
  /** Calendar months counted, 1–12 (the day's, or it and both neighbours). */
  months: number[];
  /** "January", or "December–February". */
  monthWords: string;
  /** The months in the data: "January 2026", "December 2025–February 2026". */
  period: string;
  flights: number;
  /** Of them, trips on this very route (the others cruised along its path). */
  ownTrips: number;
  /** One decimal. */
  smoothPct: number;
  calmPct: number;
  /** This direction's flights by the local time they set off, in WINDOWS order. */
  windows: WindowFigure[];
  /** The window clearly smoother than the rest of the day, or null (no clear difference, or too few flights). */
  calmest: TimeWindow | null;
  /** Where along the route (in the direction of travel) the flights that were not smooth met their strongest bumps; null: too few. */
  where: BumpWhere | null;
}

/** What GET /flights/day attaches: the table's period, the month across US routes, and each of the day's routes. */
export interface RouteHistoryDay {
  /** First and last month in the table, "YYYY-MM". */
  from: string;
  to: string;
  /** The day's calendar month, 1–12. */
  month: number;
  /** Flights on US routes in the day's calendar month, or null when the table has none. */
  national: { flights: number; smoothPct: number; calmPct: number } | null;
  /** "JFK-LAX" (origin-destination) → the route's figures, or null when too few flights were measured along it. */
  routes: Record<string, RouteHistoryFigures | null>;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);

/** The pair key: the two codes in alphabetical order. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** "January 2026", or "December 2025–February 2026" over the table months that fall in `calendar`. */
function periodOf(table: RouteHistoryTable, calendar: readonly number[]): string {
  const months = table.months.filter((m) => calendar.includes(Number(m.slice(5)))).sort();
  if (months.length === 0) return "";
  const words = (m: string) => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
  return months.length === 1 ? words(months[0]) : `${words(months[0])}–${words(months[months.length - 1])}`;
}

/** The route's figures for a direction and calendar month (1–12), or null when too few flights were measured along it. */
export function routeFigures(table: RouteHistoryTable, origin: string, destination: string, month: number): RouteHistoryFigures | null {
  if (origin === destination) return null;
  const row = table.pairs[pairKey(origin, destination)];
  if (!row) return null;
  const at = (m: number) => row[((m - 1 + 12) % 12)] ?? null;
  const flightsIn = (ms: readonly number[]) => ms.reduce((s, m) => s + (at(m)?.[C.n] ?? 0), 0);
  let months = [month];
  if (flightsIn(months) < MIN_FLIGHTS) months = [((month + 10) % 12) + 1, month, (month % 12) + 1];
  if (flightsIn(months) < MIN_FLIGHTS) return null;
  const sum = new Array<number>(CELLS).fill(0);
  for (const m of months) {
    const c = at(m);
    if (c) for (let k = 0; k < CELLS; k++) sum[k] += c[k] ?? 0;
  }
  const forward = origin < destination;
  const base = forward ? C.ab : C.ba;
  const windows: WindowFigure[] = WINDOWS.map((window, w) => ({ window, flights: sum[base + 2 * w], smoothPct: pct(sum[base + 2 * w + 1], sum[base + 2 * w]) }));

  // The calmest window: the smoothest of those with enough flights, if it beats the rest of the day by more than chance.
  let calmest: TimeWindow | null = null;
  const eligible = WINDOWS.map((_, w) => w).filter((w) => sum[base + 2 * w] >= MIN_WINDOW_FLIGHTS);
  if (eligible.length >= 2) {
    const best = eligible.reduce((a, b) => (sum[base + 2 * b + 1] / sum[base + 2 * b] > sum[base + 2 * a + 1] / sum[base + 2 * a] ? b : a));
    let n2 = 0;
    let s2 = 0;
    for (let w = 0; w < WINDOWS.length; w++) {
      if (w === best) continue;
      n2 += sum[base + 2 * w];
      s2 += sum[base + 2 * w + 1];
    }
    const n1 = sum[base + 2 * best];
    const s1 = sum[base + 2 * best + 1];
    const p = (s1 + s2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    if (n2 >= MIN_WINDOW_FLIGHTS && se > 0 && (s1 / n1 - s2 / n2) / se >= CALMEST_Z) calmest = WINDOWS[best];
  }

  // Where: the thirds run A → B; flip them for B → A.
  const thirds = [sum[C.where], sum[C.where + 1], sum[C.where + 2]];
  if (!forward) thirds.reverse();
  const bumpy = thirds[0] + thirds[1] + thirds[2];
  let where: BumpWhere | null = null;
  if (bumpy >= MIN_BUMPY_FLIGHTS) {
    const top = thirds.indexOf(Math.max(...thirds));
    where = thirds[top] >= WHERE_SHARE * bumpy ? (["early", "middle", "late"] as const)[top] : "spread";
  }

  return {
    months,
    monthWords: months.length === 1 ? MONTH_NAMES[month - 1] : `${MONTH_NAMES[months[0] - 1]}–${MONTH_NAMES[months[2] - 1]}`,
    period: periodOf(table, months),
    flights: sum[C.n],
    ownTrips: sum[C.own],
    smoothPct: pct(sum[C.smooth], sum[C.n]),
    calmPct: pct(sum[C.calm], sum[C.n]),
    windows,
    calmest,
    where,
  };
}

/** The part of the table a route-day needs: every route its rows fly, for the day's month. */
export function routeHistoryDay(table: RouteHistoryTable, routes: ReadonlyArray<readonly [origin: string, destination: string]>, date: string): RouteHistoryDay {
  const month = Number(date.slice(5, 7));
  if (!(month >= 1 && month <= 12)) throw new Error(`route history: ${date} is not a date`);
  const nat = table.national[month - 1];
  const out: RouteHistoryDay = {
    from: table.months[0] ?? "",
    to: table.months[table.months.length - 1] ?? "",
    month,
    national: nat && nat[0] > 0 ? { flights: nat[0], smoothPct: pct(nat[1], nat[0]), calmPct: pct(nat[2], nat[0]) } : null,
    routes: {},
  };
  for (const [o, d] of routes) {
    const key = `${o}-${d}`;
    if (!(key in out.routes)) out.routes[key] = routeFigures(table, o, d, month);
  }
  return out;
}

/** The flight's route: its figures, null when too few flights were measured along it, undefined when the day came without history. */
export function routeHistoryFor(day: RouteHistoryDay | null | undefined, origin: string, destination: string): RouteHistoryFigures | null | undefined {
  if (!day) return undefined;
  const hit = day.routes[`${origin}-${destination}`];
  return hit === undefined ? null : hit;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isPct = (x: unknown) => isNum(x) && x >= 0 && x <= 100;

function isFigures(v: unknown): v is RouteHistoryFigures {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    Array.isArray(f.months) &&
    f.months.every((m) => isNum(m) && m >= 1 && m <= 12) &&
    typeof f.monthWords === "string" &&
    typeof f.period === "string" &&
    isNum(f.flights) &&
    isNum(f.ownTrips) &&
    isPct(f.smoothPct) &&
    isPct(f.calmPct) &&
    Array.isArray(f.windows) &&
    f.windows.length === WINDOWS.length &&
    f.windows.every((w, i) => !!w && typeof w === "object" && (w as WindowFigure).window === WINDOWS[i] && isNum((w as WindowFigure).flights) && isPct((w as WindowFigure).smoothPct)) &&
    (f.calmest === null || (WINDOWS as readonly unknown[]).includes(f.calmest)) &&
    (f.where === null || ["early", "middle", "late", "spread"].includes(f.where as string))
  );
}

/** What the browser accepts from the API (anything else is treated as no history). */
export function isRouteHistoryDay(value: unknown): value is RouteHistoryDay {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (typeof d.from !== "string" || typeof d.to !== "string" || !isNum(d.month) || d.month < 1 || d.month > 12) return false;
  if (d.national !== null) {
    const n = d.national as Record<string, unknown> | undefined;
    if (!n || !isNum(n.flights) || !isPct(n.smoothPct) || !isPct(n.calmPct)) return false;
  }
  if (!d.routes || typeof d.routes !== "object") return false;
  return Object.values(d.routes as Record<string, unknown>).every((r) => r === null || isFigures(r));
}

// ── Copy ────────────────────────────────────────────────────────────────────

/**
 * A share for the page: whole percent, and "Nearly all" from 99.5% (the app never shows "100%";
 * ratings.ts NEARLY_ALL_PCT does the same for the forecast). `mid`: inside a sentence ("nearly all").
 */
export function shareText(pctValue: number, mid = false): string {
  if (pctValue >= 99.5) return mid ? "nearly all" : "Nearly all";
  return `${Math.round(pctValue)}%`;
}

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  overnight: "Overnight (10 PM–5 AM)",
  morning: "Morning (5 AM–noon)",
  afternoon: "Afternoon (noon–5 PM)",
  evening: "Evening (5–10 PM)",
};

/** After "flights setting off …": "in the morning", "overnight". */
export const WINDOW_WORDS: Record<TimeWindow, string> = {
  overnight: "overnight",
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
};

/** After "flights along this route …", by the window's own hours (D's time-of-day words split the day differently). */
export const WINDOW_HOURS: Record<TimeWindow, string> = {
  overnight: "between 10 PM and 5 AM",
  morning: "between 5 AM and noon",
  afternoon: "between noon and 5 PM",
  evening: "between 5 and 10 PM",
};

export const WHERE_LABELS: Record<BumpWhere, string> = {
  early: "In the first part of the route",
  middle: "Midway along the route",
  late: "In the last part of the route",
  spread: "Spread along the route",
};

/** "Turbulence readings airliners send automatically · NOAA MADIS · Nov 2025–Oct 2026". */
export function routeHistorySource(day: Pick<RouteHistoryDay, "from" | "to">): string {
  const short = (m: string) => `${MONTH_NAMES[Number(m.slice(5)) - 1]?.slice(0, 3) ?? ""} ${m.slice(0, 4)}`;
  const span = day.from && day.to ? (day.from === day.to ? short(day.from) : `${short(day.from)}–${short(day.to)}`) : "";
  return `Turbulence readings airliners send automatically · NOAA MADIS${span ? ` · ${span}` : ""}`;
}

/** What "smooth" means, for the detail sheet. */
export const SMOOTH_DEFINITION =
  "A smooth cruise: the plane’s own turbulence readings stayed at the level ICAO, the international aviation body, counts as no turbulence. " +
  "Flights along this route: its own trips, plus other flights that cruised along at least half of its path.";
