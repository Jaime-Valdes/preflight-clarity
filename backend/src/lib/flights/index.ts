/*
 * GET /flights/day's pieces (docs/REAL_DATA.md, step 1): which provider FLIGHT_PROVIDER names,
 * the query validation, and the cached lookup the route calls. The environment is read on every
 * call, like lib/db.ts, so tests and hosts can set it first.
 */
import { getAirport } from "@preflight/shared/airports";
import { daysUntil, isISODate } from "@preflight/shared/dates";
import { SCHEDULE_DAYS } from "@preflight/shared/forecast";
import { routeDayStore } from "../db";
import { aeroDataBoxConfig, createAeroDataBoxProvider } from "./aerodatabox";
import { RouteDayCache, type RouteDayResult } from "./cache";
import { createFixtureProvider } from "./fixture";
import { createGeneratorProvider } from "./generator";
import { DEFAULT_ROUTE_DAYS_PER_HOUR, ProviderError, type ProviderName, type RouteDayQuery, type ScheduleProvider } from "./types";

export const PROVIDER_NAMES: readonly ProviderName[] = ["generator", "aerodatabox", "fixture"];

/** FLIGHT_PROVIDER, case-insensitive; the generator unless it names another provider. */
export function providerName(env: NodeJS.ProcessEnv = process.env): ProviderName {
  const value = env.FLIGHT_PROVIDER?.trim().toLowerCase() ?? "";
  return PROVIDER_NAMES.find((name) => name === value) ?? "generator";
}

/**
 * The provider for this request. AeroDataBox without its key answers every request with a provider
 * failure (502) rather than quietly showing the illustrative timetable: the log says what is missing.
 */
export function currentProvider(env: NodeJS.ProcessEnv = process.env): ScheduleProvider {
  switch (providerName(env)) {
    case "aerodatabox": {
      const config = aeroDataBoxConfig(env);
      return config ? createAeroDataBoxProvider(config) : unconfigured("aerodatabox", "AERODATABOX_API_KEY is not set");
    }
    case "fixture":
      return createFixtureProvider();
    default:
      return createGeneratorProvider();
  }
}

function unconfigured(name: ProviderName, why: string): ScheduleProvider {
  return { name, fetchDay: () => Promise.reject(new ProviderError(why)) };
}

export type QueryCheck = { ok: true; query: RouteDayQuery } | { ok: false; error: string };

const IATA = /^[A-Z]{3}$/;

/** FLIGHT_PROVIDER_ROUTE_DAYS_PER_HOUR: provider calls a process may make per hour (a positive integer), else the default. */
export function routeDaysPerHour(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.FLIGHT_PROVIDER_ROUTE_DAYS_PER_HOUR);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_ROUTE_DAYS_PER_HOUR;
}

/**
 * from and to: three upper-case letters, in the airport catalogue, different. date: YYYY-MM-DD,
 * from yesterday (a traveller west of the server is still on that day) to a day past the 330 days
 * ahead schedules are published (a traveller east of the server is already on the next day);
 * `today` is the server's calendar.
 */
export function validateDayQuery(raw: { from?: string; to?: string; date?: string }, today: Date): QueryCheck {
  const { from = "", to = "", date = "" } = raw;
  if (!IATA.test(from)) return { ok: false, error: "invalid_from" };
  if (!getAirport(from)) return { ok: false, error: "unknown_from" };
  if (!IATA.test(to)) return { ok: false, error: "invalid_to" };
  if (!getAirport(to)) return { ok: false, error: "unknown_to" };
  if (from === to) return { ok: false, error: "same_airport" };
  if (!isISODate(date)) return { ok: false, error: "invalid_date" };
  const ahead = daysUntil(date, today);
  if (ahead < -1 || ahead > SCHEDULE_DAYS + 1) return { ok: false, error: "date_out_of_range" };
  return { ok: true, query: { from, to, date } };
}

/** One cache per process; its durable layer is whatever storage the environment names at call time. */
export const routeDayCache = new RouteDayCache({ store: routeDayStore, budgetPerHour: () => routeDaysPerHour() });

/** The route-day for a validated query: the cache, or the provider FLIGHT_PROVIDER names. Rejects when nothing can be served. */
export function loadRouteDay(query: RouteDayQuery, provider: ScheduleProvider = currentProvider()): Promise<RouteDayResult> {
  return routeDayCache.get(query, provider);
}
