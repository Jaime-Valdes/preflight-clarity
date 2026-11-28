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

/**
 * One airport's takeoff and landing counts for a month, a flat array: the first and last few minutes
 * of flights, the readings within END_RADIUS_NM of the airport and below END_TOP_M. [0..11]
 * departures by window (overnight, morning, afternoon, evening): flights, smooth, calm; [12..23]
 * arrivals, the same. A departure's window is its first reading's local hour, an arrival's its last.
 */
export const AIRPORT_CELLS = 24;
export const A = { dep: 0, arr: 12 } as const;
/** The stretch counted as takeoff or landing: within this distance of the airport… */
export const END_RADIUS_NM = 30;
/** …and below this altitude (about 15,000 ft above sea level), so cruise over the airport never counts. */
export const END_TOP_M = 4500;

/**
 * One airport's hourly weather reports for a month (the routine METAR, one an hour), by window:
 * [4w] hours reported, [4w + 1] with a gust reported, [4w + 2] with wind of 15 knots or more,
 * [4w + 3] with a thunderstorm at or near the airport.
 */
export const WEATHER_CELLS = 16;
export const WX = { hours: 0, gust: 1, windy: 2, storm: 3 } as const;

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
  /** "JFK" → by calendar month, the airport's AIRPORT_CELLS takeoff and landing counts, or null. Absent in older tables. */
  airports?: Record<string, ReadonlyArray<readonly number[] | null>>;
  /** By calendar month: every airport's AIRPORT_CELLS counts added up (the fallback for an airport with too few). */
  airportsNational?: ReadonlyArray<readonly number[] | null>;
  /** "JFK" → by calendar month, the airport's WEATHER_CELLS counts, or null. */
  weather?: Record<string, ReadonlyArray<readonly number[] | null>>;
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

/** An airport's departures or arrivals for a month: the first or last few minutes of flights. */
export interface EndFigures {
  flights: number;
  /** One decimal: no reading above EDR 0.10 within END_RADIUS_NM of the airport. */
  smoothPct: number;
  /** One decimal: none at 0.20 or above. */
  calmPct: number;
  /** By the local time of the takeoff (departures) or the landing (arrivals), in WINDOWS order. */
  windows: WindowFigure[];
  /** The window clearly smoother than the rest of the day, or null. */
  calmest: TimeWindow | null;
}

/** An airport's hourly weather reports in a window: how many, and the share with gusts, 15 knots or more, a thunderstorm. */
export interface WeatherWindow {
  window: TimeWindow;
  hours: number;
  /** Whole percent. */
  gustPct: number;
  windyPct: number;
  stormPct: number;
}

/** An airport's takeoff and landing history for the day's month (or its neighbours). */
export interface AirportHistoryFigures {
  /** Calendar months counted, 1–12. */
  months: number[];
  monthWords: string;
  period: string;
  /** null: too few departures measured. */
  departures: EndFigures | null;
  arrivals: EndFigures | null;
  /** The hourly weather reports by window, or null when there were none. */
  weather: WeatherWindow[] | null;
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
  /** "JFK" → the airport's takeoff and landing history, or null when nothing was measured there. Absent from older tables. */
  airports?: Record<string, AirportHistoryFigures | null>;
  /** Every US airport in the table together, the day's calendar month: the fallback for an airport with too few flights. */
  airportsNational?: { departures: EndFigures | null; arrivals: EndFigures | null } | null;
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

/**
 * The calmest window: the smoothest of those with at least MIN_WINDOW_FLIGHTS flights (two of them at
 * least), if it beats the rest of the day by more than chance would (one-sided z ≥ CALMEST_Z).
 * `byWindow`: [flights, smooth] in WINDOWS order.
 */
function calmestOf(byWindow: ReadonlyArray<readonly [number, number]>): TimeWindow | null {
  const eligible = byWindow.map((_, w) => w).filter((w) => byWindow[w][0] >= MIN_WINDOW_FLIGHTS);
  if (eligible.length < 2) return null;
  const best = eligible.reduce((a, b) => (byWindow[b][1] / byWindow[b][0] > byWindow[a][1] / byWindow[a][0] ? b : a));
  let n2 = 0;
  let s2 = 0;
  for (let w = 0; w < byWindow.length; w++) {
    if (w === best) continue;
    n2 += byWindow[w][0];
    s2 += byWindow[w][1];
  }
  const [n1, s1] = byWindow[best];
  const p = (s1 + s2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return n2 >= MIN_WINDOW_FLIGHTS && se > 0 && (s1 / n1 - s2 / n2) / se >= CALMEST_Z ? WINDOWS[best] : null;
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

  const calmest = calmestOf(WINDOWS.map((_, w) => [sum[base + 2 * w], sum[base + 2 * w + 1]] as const));

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

/** Departures (`base` A.dep) or arrivals (A.arr) from AIRPORT_CELLS counts, or null below MIN_FLIGHTS. */
function endFigures(cells: readonly number[], base: number): EndFigures | null {
  const byWindow = WINDOWS.map((_, w) => [cells[base + 3 * w] ?? 0, cells[base + 3 * w + 1] ?? 0, cells[base + 3 * w + 2] ?? 0] as const);
  const flights = byWindow.reduce((s, w) => s + w[0], 0);
  if (flights < MIN_FLIGHTS) return null;
  return {
    flights,
    smoothPct: pct(byWindow.reduce((s, w) => s + w[1], 0), flights),
    calmPct: pct(byWindow.reduce((s, w) => s + w[2], 0), flights),
    windows: WINDOWS.map((window, w) => ({ window, flights: byWindow[w][0], smoothPct: pct(byWindow[w][1], byWindow[w][0]) })),
    calmest: calmestOf(byWindow.map(([n, sm]) => [n, sm] as const)),
  };
}

const wholePct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/**
 * An airport's takeoff and landing history for a calendar month (1–12): its own month when both its
 * departures and arrivals reach MIN_FLIGHTS, otherwise the month and both neighbours; each side is
 * null when it still falls short. Null when the table has no takeoff and landing counts or nothing at all
 * was measured or reported at the airport.
 */
export function airportFigures(table: RouteHistoryTable, code: string, month: number): AirportHistoryFigures | null {
  if (!table.airports) return null;
  const row = table.airports[code];
  const wxRow = table.weather?.[code];
  if (!row && !wxRow) return null;
  const at = (r: ReadonlyArray<readonly number[] | null> | undefined, m: number) => r?.[(m - 1 + 12) % 12] ?? null;
  const sideIn = (ms: readonly number[], base: number) =>
    ms.reduce((s, m) => s + WINDOWS.reduce((t, _, w) => t + (at(row, m)?.[base + 3 * w] ?? 0), 0), 0);
  let months = [month];
  if (row && Math.min(sideIn(months, A.dep), sideIn(months, A.arr)) < MIN_FLIGHTS) months = [((month + 10) % 12) + 1, month, (month % 12) + 1];
  const sum = new Array<number>(AIRPORT_CELLS).fill(0);
  const wx = new Array<number>(WEATHER_CELLS).fill(0);
  for (const m of months) {
    const c = at(row, m);
    if (c) for (let k = 0; k < AIRPORT_CELLS; k++) sum[k] += c[k] ?? 0;
    const x = at(wxRow, m);
    if (x) for (let k = 0; k < WEATHER_CELLS; k++) wx[k] += x[k] ?? 0;
  }
  const departures = endFigures(sum, A.dep);
  const arrivals = endFigures(sum, A.arr);
  const reported = WINDOWS.some((_, w) => wx[4 * w + WX.hours] > 0);
  if (!departures && !arrivals && !reported) return null;
  return {
    months,
    monthWords: months.length === 1 ? MONTH_NAMES[month - 1] : `${MONTH_NAMES[months[0] - 1]}–${MONTH_NAMES[months[2] - 1]}`,
    period: periodOf(table, months),
    departures,
    arrivals,
    weather: reported
      ? WINDOWS.map((window, w) => {
          const hours = wx[4 * w + WX.hours];
          return { window, hours, gustPct: wholePct(wx[4 * w + WX.gust], hours), windyPct: wholePct(wx[4 * w + WX.windy], hours), stormPct: wholePct(wx[4 * w + WX.storm], hours) };
        })
      : null,
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
  if (table.airports) {
    const airports: Record<string, AirportHistoryFigures | null> = {};
    for (const [o, d] of routes) for (const code of [o, d]) if (!(code in airports)) airports[code] = airportFigures(table, code, month);
    out.airports = airports;
    const all = table.airportsNational?.[month - 1];
    out.airportsNational = all ? { departures: endFigures(all, A.dep), arrivals: endFigures(all, A.arr) } : null;
  }
  return out;
}

/** An airport's takeoff and landing history: its figures, null when nothing was measured there, undefined when the day came without any. */
export function airportHistoryFor(day: RouteHistoryDay | null | undefined, code: string): AirportHistoryFigures | null | undefined {
  if (!day?.airports) return undefined;
  const hit = day.airports[code];
  return hit === undefined ? null : hit;
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

function isWindows(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === WINDOWS.length &&
    v.every((w, i) => !!w && typeof w === "object" && (w as WindowFigure).window === WINDOWS[i] && isNum((w as WindowFigure).flights) && isPct((w as WindowFigure).smoothPct))
  );
}

function isEnd(v: unknown): v is EndFigures {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return isNum(e.flights) && isPct(e.smoothPct) && isPct(e.calmPct) && isWindows(e.windows) && (e.calmest === null || (WINDOWS as readonly unknown[]).includes(e.calmest));
}

function isAirport(v: unknown): v is AirportHistoryFigures {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const weatherOk =
    a.weather === null ||
    (Array.isArray(a.weather) &&
      a.weather.length === WINDOWS.length &&
      a.weather.every((w, i) => {
        const x = w as Record<string, unknown> | null;
        return !!x && x.window === WINDOWS[i] && isNum(x.hours) && isPct(x.gustPct) && isPct(x.windyPct) && isPct(x.stormPct);
      }));
  return (
    Array.isArray(a.months) &&
    a.months.every((m) => isNum(m) && m >= 1 && m <= 12) &&
    typeof a.monthWords === "string" &&
    typeof a.period === "string" &&
    isEnd(a.departures) &&
    isEnd(a.arrivals) &&
    weatherOk
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
  if (!Object.values(d.routes as Record<string, unknown>).every((r) => r === null || isFigures(r))) return false;
  if (d.airports !== undefined) {
    if (!d.airports || typeof d.airports !== "object") return false;
    if (!Object.values(d.airports as Record<string, unknown>).every(isAirport)) return false;
  }
  if (d.airportsNational !== undefined && d.airportsNational !== null) {
    const n = d.airportsNational as Record<string, unknown>;
    if (typeof n !== "object" || !isEnd(n.departures) || !isEnd(n.arrivals)) return false;
  }
  return true;
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

/** What a smooth takeoff or landing means, for the detail sheet. */
export const TAKEOFF_LANDING_DEFINITION =
  "A smooth takeoff or landing: the plane’s own turbulence readings within 30 nautical miles of the airport, below about 15,000 feet, stayed at the level ICAO counts as no turbulence. " +
  "Readings usually start a little after takeoff and run until shortly before touchdown.";

/** The source line with the weather reports added, when the rating used them. */
export function takeoffLandingSource(day: Pick<RouteHistoryDay, "from" | "to">, weather: boolean): string {
  return `${routeHistorySource(day)}${weather ? " · hourly airport weather reports · Iowa Environmental Mesonet" : ""}`;
}
