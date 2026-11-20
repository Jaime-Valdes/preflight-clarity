/*
 * AeroDataBox adapter (docs/REAL_DATA.md, step 1). A route-day is the origin's departures for its
 * local day, two FIDS calls of twelve hours each (the window a plan allows), kept when they land
 * at the destination, are operated under the number shown (no marketing codeshares) and carry
 * passengers. The scheduled instants give the block time; the local wall-clock values give the
 * published times and the arrival's day offset. The key travels only in request headers; an error
 * carries the status and the provider's message with the key scrubbed should it ever echo. The
 * mapping (scheduleFromFids) is also what the fixture provider runs, so the tests cover the live path.
 */
import { daysBetween } from "@preflight/shared/dates";
import type { RouteDaySchedule, ScheduleRow } from "@preflight/shared/schedule";
import { ProviderError, type ScheduleProvider } from "./types";

// ── Wire shapes: the parts of the OpenAPI contracts this adapter reads ──────

/** DateTimeContract. AeroDataBox writes "2026-11-26 06:00-05:00" and "2026-11-26 11:00Z"; the ISO "T" forms are read too. */
export interface AdbDateTime {
  utc?: string | null;
  local?: string | null;
}

/** FlightAirportMovementContract. `airport` is left out on the side that is the requested airport. */
export interface AdbMovement {
  airport?: { iata?: string | null; icao?: string | null; name?: string | null; timeZone?: string | null } | null;
  scheduledTime?: AdbDateTime | null;
  terminal?: string | null;
  gate?: string | null;
  quality?: string[] | null;
}

/** AirportFlightContract as a departures listing with withLeg=true fills it: departure and arrival, no movement. */
export interface AdbFlight {
  number: string;
  status?: string;
  /** "Unknown", "IsOperator" or "IsCodeshared". */
  codeshareStatus?: string;
  isCargo?: boolean;
  departure?: AdbMovement | null;
  arrival?: AdbMovement | null;
  movement?: AdbMovement | null;
  aircraft?: { reg?: string | null; modeS?: string | null; model?: string | null } | null;
  airline?: { name?: string | null; iata?: string | null; icao?: string | null } | null;
}

/** AirportFidsContract. */
export interface AdbFids {
  departures?: AdbFlight[] | null;
  arrivals?: AdbFlight[] | null;
}

// ── Hosts, keys, URLs ───────────────────────────────────────────────────────

export const HOSTS = {
  /** The RapidAPI marketplace plans (the free one among them). */
  rapidapi: "https://aerodatabox.p.rapidapi.com",
  /** A key issued by aerodatabox.com itself. */
  direct: "https://api.aerodatabox.com",
} as const;
export type AeroDataBoxHost = keyof typeof HOSTS;

export interface AeroDataBoxConfig {
  apiKey: string;
  host: AeroDataBoxHost;
}

/** AERODATABOX_API_KEY and AERODATABOX_HOST ("rapidapi" unless it says "direct"); null without a key. */
export function aeroDataBoxConfig(env: NodeJS.ProcessEnv = process.env): AeroDataBoxConfig | null {
  const apiKey = env.AERODATABOX_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, host: env.AERODATABOX_HOST?.trim().toLowerCase() === "direct" ? "direct" : "rapidapi" };
}

/** The headers each host expects the key in (the OpenAPI spec names X-Api-Key for the direct gateway). */
export function fidsHeaders(config: AeroDataBoxConfig): Record<string, string> {
  return config.host === "direct"
    ? { Accept: "application/json", "X-Api-Key": config.apiKey }
    : { Accept: "application/json", "x-rapidapi-key": config.apiKey, "x-rapidapi-host": new URL(HOSTS.rapidapi).host };
}

/** Departures only, with the other end of each leg; operators, passengers and flights that are flying only. */
export const FIDS_QUERY = "direction=Departure&withLeg=true&withCodeshared=false&withCargo=false&withPrivate=false&withCancelled=false";

/** The local day in two twelve-hour windows: {date}T00:00–12:00 and 12:00–23:59. */
export function fidsUrls(host: AeroDataBoxHost, from: string, date: string): [string, string] {
  const base = `${HOSTS[host]}/flights/airports/iata/${from}/${date}T`;
  return [`${base}00:00/${date}T12:00?${FIDS_QUERY}`, `${base}12:00/${date}T23:59?${FIDS_QUERY}`];
}

// ── Times and numbers ───────────────────────────────────────────────────────

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

export interface AdbInstant {
  /** The calendar date and wall-clock time as written. */
  date: string;
  time: string;
  /** The instant, when the text carries an offset or Z; null otherwise. */
  ms: number | null;
}

/** "2026-11-26 06:00-05:00", "2026-11-26 11:00Z" or "2026-11-26T06:00:00-05:00" → its parts; null when unreadable. */
export function parseAdbTime(text: string | null | undefined): AdbInstant | null {
  const m = DATE_TIME.exec(text?.trim() ?? "");
  if (!m) return null;
  const [, date, hh, mm, ss, zone] = m;
  const naive = Date.parse(`${date}T${hh}:${mm}:${ss ?? "00"}Z`);
  if (!Number.isFinite(naive)) return null;
  let ms: number | null = null;
  if (zone) {
    const offsetMin = zone.toUpperCase() === "Z" ? 0 : (zone.startsWith("-") ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
    ms = naive - offsetMin * 60_000;
  }
  return { date, time: `${hh}:${mm}`, ms };
}

/** The instant of a scheduled time: its UTC value, else its local value with the offset; null when neither reads. */
function instantOf(time: AdbDateTime | null | undefined): number | null {
  return parseAdbTime(time?.utc)?.ms ?? parseAdbTime(time?.local)?.ms ?? null;
}

const DIGITS = /^\d{1,4}[A-Z]?$/;

/** "DL 423" (or "DL423", "GTI 741", a bare "423") → the carrier and the digits; the airline's own IATA code wins over the prefix. */
export function splitFlightNumber(number: string, iata?: string | null): { airline: string; number: string } {
  const text = number.trim().toUpperCase();
  const code = iata?.trim().toUpperCase() || undefined;
  if (DIGITS.test(text)) return { airline: code ?? "", number: text };
  if (code && text.startsWith(code)) {
    const rest = text.slice(code.length).trim();
    if (DIGITS.test(rest)) return { airline: code, number: rest };
  }
  const m = /^([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)$|^([A-Z]{3})\s+(\d{1,4}[A-Z]?)$/.exec(text);
  if (!m) return { airline: code ?? "", number: "" };
  return { airline: code ?? m[1] ?? m[3], number: m[2] ?? m[4] };
}

// ── Rows ────────────────────────────────────────────────────────────────────

/**
 * One listed departure → a ScheduleRow, or null when it is not what the day shows: a marketing
 * codeshare, a cargo flight, a flight to somewhere else or on another date, or a listing without
 * the scheduled times, the carrier or the number a row needs.
 */
export function rowFromFlight(flight: AdbFlight, from: string, to: string, date: string): ScheduleRow | null {
  if (typeof flight?.number !== "string") return null;
  if (flight.isCargo === true || flight.codeshareStatus === "IsCodeshared") return null;
  const departure = flight.departure;
  const arrival = flight.arrival;
  if (!departure || !arrival) return null;
  if ((arrival.airport?.iata ?? "").trim().toUpperCase() !== to) return null;
  const dep = parseAdbTime(departure.scheduledTime?.local);
  const arr = parseAdbTime(arrival.scheduledTime?.local);
  if (!dep || !arr || dep.date !== date) return null;
  const departs = instantOf(departure.scheduledTime);
  const arrives = instantOf(arrival.scheduledTime);
  if (departs === null || arrives === null) return null;
  const blockMin = Math.round((arrives - departs) / 60_000);
  if (blockMin <= 0) return null;
  const { airline, number } = splitFlightNumber(flight.number, flight.airline?.iata);
  if (!airline || !number) return null;

  const airlineName = flight.airline?.name?.trim();
  const model = flight.aircraft?.model?.trim();
  const terminal = departure.terminal?.trim();
  return {
    airline,
    ...(airlineName ? { airlineName } : {}),
    number,
    origin: from,
    destination: to,
    date,
    departTime: dep.time,
    arriveTime: arr.time,
    arriveDayOffset: daysBetween(dep.date, arr.date),
    blockMin,
    aircraft: model ? { name: model } : {},
    ...(terminal ? { terminal } : {}),
  };
}

/**
 * The FIDS pages of a route-day (one per window; null for a 204) → the schedule: rows by departure
 * time, each flight once (a flight at the minute the windows share is listed on both pages).
 */
export function scheduleFromFids(from: string, to: string, date: string, pages: ReadonlyArray<AdbFids | null>, fetchedAt: string): RouteDaySchedule {
  const seen = new Set<string>();
  const rows: ScheduleRow[] = [];
  for (const page of pages) {
    const departures = page?.departures;
    if (!Array.isArray(departures)) continue;
    for (const flight of departures) {
      const row = rowFromFlight(flight, from, to, date);
      if (!row) continue;
      const key = `${row.airline}${row.number}|${row.departTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.departTime.localeCompare(b.departTime) || `${a.airline}${a.number}`.localeCompare(`${b.airline}${b.number}`));
  return { origin: from, destination: to, date, provider: "aerodatabox", fetchedAt, rows, served: rows.length > 0 ? true : null };
}

// ── The live provider ───────────────────────────────────────────────────────

export const REQUEST_TIMEOUT_MS = 10_000;
/** The wait before the one retry of a 429: Retry-After when it says, 1 s otherwise, never more than 5 s. */
export const RETRY_AFTER_DEFAULT_MS = 1_000;
export const RETRY_AFTER_MAX_MS = 5_000;

/** What the tests replace: the network, the clock, the wait, the timeout. */
export interface AeroDataBoxDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** Retry-After as milliseconds to wait: delta seconds or an HTTP date (already past → 0), capped. */
export function retryAfterMs(header: string | null | undefined, nowMs: number): number {
  const text = header?.trim() ?? "";
  let ms = RETRY_AFTER_DEFAULT_MS;
  if (/^\d+$/.test(text)) ms = Number(text) * 1000;
  else if (text) {
    const at = Date.parse(text);
    if (Number.isFinite(at)) ms = Math.max(0, at - nowMs);
  }
  return Math.min(ms, RETRY_AFTER_MAX_MS);
}

/** The key, should the provider ever echo it, never reaches a log line. */
function scrub(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join("[redacted]") : text;
}

/** The provider's message from an error body, trimmed to a log line. */
async function detailOf(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    const message = typeof body === "object" && body !== null && "message" in body ? (body as { message: unknown }).message : null;
    return typeof message === "string" && message.trim() ? `: ${message.trim().slice(0, 160)}` : "";
  } catch {
    return "";
  }
}

export function createAeroDataBoxProvider(config: AeroDataBoxConfig, deps: AeroDataBoxDeps = {}): ScheduleProvider {
  const fetchImpl: typeof fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const headers = fidsHeaders(config);

  /** One window: its page, null for a 204, after at most one retry of a 429. */
  async function call(url: string): Promise<AdbFids | null> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(url, { headers, signal: controller.signal });
      } catch (err) {
        const why =
          err instanceof Error && err.name === "AbortError" ? `no answer within ${timeoutMs / 1000} s` : err instanceof Error ? err.message : String(err);
        throw new ProviderError(`AeroDataBox request failed: ${scrub(why, config.apiKey)}`);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 && attempt === 0) {
        await sleep(retryAfterMs(res.headers.get("retry-after"), now()));
        continue;
      }
      if (res.status === 204) return null;
      if (res.status !== 200) throw new ProviderError(`AeroDataBox answered ${res.status}${scrub(await detailOf(res), config.apiKey)}`, res.status);
      try {
        return (await res.json()) as AdbFids;
      } catch {
        throw new ProviderError("AeroDataBox answered with a body that is not JSON", res.status);
      }
    }
  }

  return {
    name: "aerodatabox",
    async fetchDay(from, to, date) {
      const fetchedAt = new Date(now()).toISOString();
      const pages = await Promise.all(fidsUrls(config.host, from, date).map((url) => call(url)));
      return scheduleFromFids(from, to, date, pages, fetchedAt);
    },
  };
}
