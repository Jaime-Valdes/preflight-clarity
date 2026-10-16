import { formatOffset } from "@preflight/shared/dates";
import { availabilityFor, getForecastStatus, type Availability } from "@preflight/shared/forecast";
import { findOption, type FlightOption } from "@preflight/shared/search";
import type { CrewInfo, Flight, ForecastMode, ForecastStatus, Intensity } from "@preflight/shared/types";
import { KIND_LABEL, describeSeat } from "@/components/dashboard/control/seatMap";
import { windowMoment } from "@/components/dashboard/turbulence/format";
import { MAX_DAYS_AHEAD, dateStatus, itemId, type CompareItem } from "@/lib/c/model";
import { COLORS, INTENSITY } from "@/lib/theme";
import { daysBefore } from "../flight/availability";
import { monthDay, routeText } from "../flight/copy";

/*
 * Version C compare page: pure helpers — which columns to show, the quiet
 * "Smoothest / Cheapest / Fastest" markers, stable series styles, and the
 * wording of each row. Safe in render ("today" is passed in).
 */

// ── Columns ─────────────────────────────────────────────────────────────────

export interface FlightColumn {
  kind: "flight";
  /** itemId — "JFK.LAX.2026-11-26.DL1423". */
  id: string;
  item: CompareItem;
  option: FlightOption;
  flight: Flight;
  daysUntil: number;
  forecast: ForecastStatus;
  /** What exists for this flight today (availabilityFor its real distance). */
  avail: Availability;
}

export interface UnavailableColumn {
  kind: "unavailable";
  id: string;
  item: CompareItem;
  /** Not in that day's schedule, or a date the tool no longer (or doesn't yet) shows. */
  reason: "missing" | "past" | "too-far";
}

export type Column = FlightColumn | UnavailableColumn;

export function isFlightColumn(column: Column): column is FlightColumn {
  return column.kind === "flight";
}

/** Regenerates each picked flight (deterministic, cached by the generator). */
export function resolveColumns(items: readonly CompareItem[], today: string): Column[] {
  return items.map((item): Column => {
    const id = itemId(item);
    const status = dateStatus(item.date, today);
    if (status !== "ok") return { kind: "unavailable", id, item, reason: status };
    let option: FlightOption | null = null;
    try {
      option = findOption({ origin: item.origin, destination: item.destination, date: item.date }, item.key);
    } catch {
      option = null;
    }
    if (!option) return { kind: "unavailable", id, item, reason: "missing" };
    const daysUntil = daysBefore(today, item.date);
    return {
      kind: "flight",
      id,
      item,
      option,
      flight: option.flight,
      daysUntil,
      forecast: getForecastStatus(daysUntil, option.flight.turbulence.history),
      avail: availabilityFor(daysUntil),
    };
  });
}

export const UNAVAILABLE_NOTE: Record<UnavailableColumn["reason"], string> = {
  missing: "This flight is no longer on the schedule.",
  past: "This flight’s date has passed.",
  "too-far": `Schedules are published about ${MAX_DAYS_AHEAD} days ahead; this date is further out.`,
};

// ── Markers ─────────────────────────────────────────────────────────────────

/**
 * Ids of the columns holding the best value — every tied one. Empty with fewer
 * than two flights, or when they are all equal (a marker on every column would
 * tell nothing apart).
 */
export function leaders(columns: readonly FlightColumn[], value: (c: FlightColumn) => number, best: "min" | "max"): ReadonlySet<string> {
  if (columns.length < 2) return new Set();
  const values = columns.map(value);
  const target = best === "min" ? Math.min(...values) : Math.max(...values);
  const ids = columns.filter((_, i) => values[i] === target).map((c) => c.id);
  return new Set(ids.length === columns.length ? [] : ids);
}

// ── Series styles (chart lines, column keys) ────────────────────────────────

export interface SeriesStyle {
  color: string;
  /** SVG stroke-dasharray; undefined = solid. */
  dash: string | undefined;
  /** For the text alternative: "solid line" … */
  pattern: string;
}

/**
 * calm / breeze / dusk, each with its own dash pattern so identity never rests
 * on colour alone. Checked with the dataviz palette validator against white:
 * all pairs pass colour-blind and normal-vision separation and 3:1 contrast
 * (the muted calm palette is below the validator's chroma floor by design).
 */
export const SERIES: readonly SeriesStyle[] = [
  { color: COLORS.calm500, dash: undefined, pattern: "solid line" },
  { color: COLORS.breeze700, dash: "7 4", pattern: "dashed line" },
  // --color-dusk-500 (not in lib/theme COLORS).
  { color: "#8170c4", dash: "0.5 4.5", pattern: "dotted line" },
];

/**
 * Keeps each flight's series slot while others come and go (a removed flight
 * must not repaint the ones that stay); new flights take the lowest free slot.
 */
export function assignSlots(ids: readonly string[], previous: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const next = new Map<string, number>();
  const taken = new Set<number>();
  for (const id of ids) {
    const slot = previous.get(id);
    if (slot !== undefined && slot < SERIES.length && !taken.has(slot)) {
      next.set(id, slot);
      taken.add(slot);
    }
  }
  for (const id of ids) {
    if (next.has(id)) continue;
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    next.set(id, slot % SERIES.length);
    taken.add(slot);
  }
  return next;
}

/**
 * Short, unique names for the compared flights: "DL 1423", plus the date when
 * the dates differ and the route when the routes differ.
 */
export function flightNames(columns: readonly FlightColumn[]): ReadonlyMap<string, string> {
  const dates = new Set(columns.map((c) => c.item.date));
  const routes = new Set(columns.map((c) => `${c.item.origin}-${c.item.destination}`));
  const names = new Map<string, string>();
  for (const c of columns) {
    let name = c.flight.flightNumber;
    if (dates.size > 1) name += ` · ${monthDay(c.item.date)}`;
    if (routes.size > 1) name += ` · ${routeText(c.item.origin, c.item.destination)}`;
    names.set(c.id, name);
  }
  return names;
}

/** A visual name read out well: "DL 843 · Nov 26 · JFK → LAX" → "DL 843, Nov 26, JFK to LAX". */
export function spoken(name: string): string {
  return name.replaceAll(" · ", ", ").replaceAll(" → ", " to ");
}

/**
 * Compact tags for the small column keys: the flight number, plus the date when the
 * dates differ; the full name (with the route) only where that still leaves two alike.
 */
export function flightTags(columns: readonly FlightColumn[], names: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const dates = new Set(columns.map((c) => c.item.date));
  const short = new Map(
    columns.map((c) => [c.id, dates.size > 1 ? `${c.flight.flightNumber} · ${monthDay(c.item.date)}` : c.flight.flightNumber]),
  );
  const counts = new Map<string, number>();
  for (const tag of short.values()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return new Map(
    columns.map((c) => {
      const tag = short.get(c.id)!;
      return [c.id, (counts.get(tag) ?? 0) > 1 ? (names.get(c.id) ?? tag) : tag];
    }),
  );
}

// ── Row wording ─────────────────────────────────────────────────────────────

export const STRONGEST_BUMPS: Record<Intensity, string> = {
  none: "None expected",
  light: "Light",
  moderate: "Moderate",
};

/** Under the confidence label, once a flight-specific forecast exists (getForecastStatus tiers). */
export function forecastBasis(forecast: ForecastStatus): string {
  if (forecast.mode === "history") return "Typical pattern only";
  return forecast.confidence === "high" ? "Hourly forecasts and pilot reports" : "Latest turbulence forecasts";
}

/** "89% smooth" + "October · about 1,200 past flights with turbulence reports" — the route, never this flight. */
export function routeTypical(flight: Flight): { main: string; sub: string } {
  const { smoothPct, month, flightsAnalyzed } = flight.turbulence.history;
  const step = flightsAnalyzed >= 1000 ? 100 : 10;
  const about = Math.max(step, Math.round(flightsAnalyzed / step) * step).toLocaleString("en-US");
  return { main: `${smoothPct}% smooth`, sub: `Typical for ${month} · about ${about} past flights with reports` };
}

// ── Aircraft ────────────────────────────────────────────────────────────────

/** 6.2 → "6.2 years", 0.8 → "10 months". */
export function yearsText(years: number): string {
  const age = Math.max(0, years);
  if (age < 1) {
    const months = Math.max(1, Math.round(age * 12));
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${Number.isInteger(age) ? age : age.toFixed(1)} years`;
}

/** "1–9 years": whole years, never "0". */
export function rangeText([min, max]: readonly [number, number]): string {
  const lo = Math.max(1, Math.floor(min));
  const hi = Math.max(lo, Math.ceil(max));
  return lo === hi ? `${lo} ${lo === 1 ? "year" : "years"}` : `${lo}–${hi} years`;
}

// ── Who flies it ────────────────────────────────────────────────────────────

/** "2 pilots" + "Licensed and type-rated on the A321neo" (relief pilots on long flights). */
export function crewLine(crew: CrewInfo, model: string): { main: string; sub: string } {
  const relief = crew.pilots - 2;
  if (relief <= 0) return { main: "2 pilots", sub: `Licensed and type-rated on the ${model}` };
  return {
    main: `${crew.pilots} pilots`,
    sub: `Captain, first officer and ${relief === 1 ? "a relief pilot" : `${relief} relief pilots`}, so the crew can rest on this long flight`,
  };
}

/** The licence every pilot on board holds and the rules behind it — the same for every airline under that regulator. */
export function crewRules(crew: CrewInfo): { licence: { main: string; sub: string }; checks: { main: string; sub: string } } {
  if (crew.regime === "faa") {
    return {
      licence: { main: "Airline Transport Pilot certificate", sub: "1,500+ flight hours · FAA rules" },
      checks: { main: "Simulator checks every 6–12 months", sub: "Plus regular medicals and Part 117 rest rules" },
    };
  }
  const regulator = crew.regulator.trim() || "the national aviation authority";
  if (crew.regime === "easa") {
    return {
      licence: { main: "Airline pilot licence", sub: `The captain holds the full ATPL · ${regulator} rules` },
      checks: { main: "Proficiency checks every 6 months", sub: "Plus yearly medicals and flight-time limits" },
    };
  }
  return {
    licence: { main: "Airline pilot licence", sub: `ICAO standard · licensed by ${regulator}` },
    checks: { main: "Recurrent simulator checks", sub: "Usually twice a year, plus regular medicals and rest limits" },
  };
}

// ── Best seat ───────────────────────────────────────────────────────────────

/** The smoothest zone from the seat map's rows: "Rows 14–19" + "Over the wing" (the wing span if no row is marked). */
export function smoothestZone(flight: Flight): { main: string; sub: string } {
  const rows = flight.seatMap.rows.filter((r) => r.zone === "smoothest").map((r) => r.row);
  const first = rows.length ? Math.min(...rows) : flight.seatMap.wingStartRow;
  const last = rows.length ? Math.max(...rows) : flight.seatMap.wingEndRow;
  return { main: first === last ? `Row ${first}` : `Rows ${first}–${last}`, sub: "Over the wing, where the cabin moves least" };
}

/** An open seat in that zone right now: "Seat 15A" + "Window · open right now", or null when none is. */
export function openSeat(flight: Flight): { seat: string; detail: string } | null {
  const id = flight.seatMap.recommended[0];
  const info = id ? describeSeat(flight.seatMap, id) : null;
  if (!info) return null;
  return { seat: info.id, detail: `${KIND_LABEL[info.kind]} · open right now` };
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/**
 * The chart's text alternative for one flight: when the bumpy stretches come,
 * how strong and for how long, and how long it is in the air.
 */
export function timelineSummary(flight: Flight, mode: ForecastMode): string {
  const { windows } = flight.turbulence;
  const air = `${formatOffset(flight.airborneMin)} in the air`;
  if (windows.length === 0) return `Smooth from takeoff to landing (${air}).`;
  const parts = windows.map(
    (w) => `${INTENSITY[w.intensity].short.toLowerCase()} bumps ${windowMoment(w, flight.airborneMin)}, for about ${formatOffset(w.durationMin)}`,
  );
  const lead = mode === "history" ? "typically " : "";
  return `${capitalize(lead + parts.join("; "))}; smooth otherwise (${air}).`;
}
