/*
 * Version D schedules (docs/REAL_DATA.md, "Step 1 build specification", Backend): the shapes the
 * route, the providers and the cache share. The rows and the day are the shared package's
 * (shared/src/schedule.ts), so the browser reads exactly what a provider produced.
 */
import type { RouteDaySchedule } from "@preflight/shared/schedule";

/** FLIGHT_PROVIDER values: the illustrative timetable (default, no key), AeroDataBox, or its saved listings (tests). */
export type ProviderName = "generator" | "aerodatabox" | "fixture";

export interface ScheduleProvider {
  name: ProviderName;
  /** The route-day's nonstops. Rejects with a ProviderError when the source could not answer (the route says 502). */
  fetchDay(from: string, to: string, date: string): Promise<RouteDaySchedule>;
}

/** The source could not answer: a network error or timeout, a status other than 200 or 204, a missing fixture, no key. */
export class ProviderError extends Error {
  /** The HTTP status the source answered with, when it did. */
  readonly status?: number;
  /** "budget": the process's hourly allowance of provider calls is spent (the route answers 503, not 502). */
  readonly reason?: "budget";

  constructor(message: string, status?: number, reason?: "budget") {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.reason = reason;
  }
}

/** Provider calls (route-days fetched) a process makes per hour unless FLIGHT_PROVIDER_ROUTE_DAYS_PER_HOUR says otherwise. */
export const DEFAULT_ROUTE_DAYS_PER_HOUR = 60;

/** GET /flights/day's query once validated (lib/flights/index.ts validateDayQuery). */
export interface RouteDayQuery {
  from: string;
  to: string;
  date: string;
}

/** GET /flights/day's answer. */
export type RouteDayResponse = { ok: true; schedule: RouteDaySchedule; cached: boolean } | { ok: false; error: string };

/** A route-day as the durable layer keeps it (Supabase `route_days`; route_days.json in development). */
export interface RouteDayRecord {
  /** "JFK-LAX". */
  route: string;
  /** "YYYY-MM-DD", the local departure date at the origin. */
  date: string;
  /** The provider that produced the payload. */
  provider: ProviderName;
  /** ISO instants: when the rows were fetched, and when the 24-hour TTL ends. */
  fetchedAt: string;
  expiresAt: string;
  payload: RouteDaySchedule;
}

/** The durable layer behind the memory cache: one record per (route, date, provider). Both methods throw on a storage error. */
export interface RouteDayStore {
  getRouteDay(route: string, date: string, provider: ProviderName): Promise<RouteDayRecord | null>;
  /** Insert or replace the record for its (route, date, provider). */
  putRouteDay(record: RouteDayRecord): Promise<void>;
}

/** How long a fetched day answers requests before it is refreshed. */
export const ROUTE_DAY_TTL_MS = 24 * 60 * 60 * 1000;
/** AeroDataBox's cache rule (docs/REAL_DATA.md): contents are kept at most 7 days, so nothing older is served or stored. */
export const ROUTE_DAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** "JFK" + "LAX" → "JFK-LAX", the `route` column. */
export function routeKey(from: string, to: string): string {
  return `${from}-${to}`;
}

/** The one key of a record: "JFK-LAX|2026-11-26|aerodatabox". */
export function routeDayKey(route: string, date: string, provider: string): string {
  return `${route}|${date}|${provider}`;
}

/** Milliseconds since the record was fetched; Infinity when its fetchedAt cannot be read (so it counts as too old). */
export function routeDayAgeMs(record: Pick<RouteDayRecord, "fetchedAt">, nowMs: number): number {
  const fetched = Date.parse(record.fetchedAt);
  return Number.isFinite(fetched) ? nowMs - fetched : Infinity;
}
