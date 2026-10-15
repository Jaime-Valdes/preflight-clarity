import { getAirport } from "@preflight/shared/airports";
import { isISODate } from "@preflight/shared/dates";

/*
 * Version C (docs/VERSION_C.md): shared types and URL helpers for /c pages.
 * Pure functions — safe in render.
 */

/** Most flights in the compare list. */
export const MAX_COMPARE = 3;

/** One flight the visitor picked: enough to regenerate it (searchFlights → findOption). */
export interface CompareItem {
  /** Catalogue IATA code, uppercase. */
  origin: string;
  destination: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** FlightOption.key, e.g. "DL1423". */
  key: string;
}

/** A route and day to search. */
export interface RouteDay {
  origin: string;
  destination: string;
  date: string;
}

export type SortKey = "smoothest" | "cheapest" | "fastest" | "departure";
export const SORT_KEYS: readonly SortKey[] = ["smoothest", "cheapest", "fastest", "departure"];
export const DEFAULT_SORT: SortKey = "smoothest";
export const SORT_LABELS: Record<SortKey, string> = {
  smoothest: "Smoothest",
  cheapest: "Cheapest",
  fastest: "Fastest",
  departure: "Departure time",
};

const KEY_PATTERN = /^[A-Z0-9]{2}\d{1,4}$/;

/** A catalogue airport code ("jfk" → "JFK"), or null for anything else. */
export function airportCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return getAirport(code) ? code : null;
}

/** A flight key ("dl1423" → "DL1423"), or null. */
export function flightKey(value: string | null | undefined): string | null {
  const key = value?.replace(/\s+/g, "").toUpperCase() ?? "";
  return KEY_PATTERN.test(key) ? key : null;
}

export function parseSort(value: string | null | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : DEFAULT_SORT;
}

/** The route and day in a /c query string (from, to, date), or null when any part is missing or invalid. */
export function parseRouteDay(params: { get(name: string): string | null }): RouteDay | null {
  const origin = airportCode(params.get("from"));
  const destination = airportCode(params.get("to"));
  const date = params.get("date")?.trim() ?? "";
  if (!origin || !destination || origin === destination || !isISODate(date)) return null;
  return { origin, destination, date };
}

/** "JFK.LAX.2026-11-26.DL1423" — stable id of a compare item, also its URL form. */
export function itemId(item: CompareItem): string {
  return `${item.origin}.${item.destination}.${item.date}.${item.key}`;
}

export function parseItemId(id: string): CompareItem | null {
  const [origin, destination, date, key, ...rest] = id.trim().split(".");
  if (rest.length > 0) return null;
  const o = airportCode(origin);
  const d = airportCode(destination);
  const k = flightKey(key);
  if (!o || !d || o === d || !k || !isISODate(date ?? "")) return null;
  return { origin: o, destination: d, date: date!, key: k };
}

/** Items from a compare URL parameter ("id,id,id"): valid, unique, at most MAX_COMPARE. */
export function parseCompareParam(value: string | null | undefined): CompareItem[] {
  const items: CompareItem[] = [];
  for (const part of (value ?? "").split(",")) {
    const item = parseItemId(part);
    if (item && !items.some((i) => itemId(i) === itemId(item))) items.push(item);
    if (items.length === MAX_COMPARE) break;
  }
  return items;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value) search.set(name, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** /c/search for a route and day; `extra` adds sort/filter parameters (empty values are dropped). */
export function searchHref(day: RouteDay, extra: Record<string, string | undefined> = {}): string {
  return `/c/search${query({ from: day.origin, to: day.destination, date: day.date, ...extra })}`;
}

export function flightHref(item: CompareItem): string {
  return `/c/flight${query({ from: item.origin, to: item.destination, date: item.date, f: item.key })}`;
}

export function compareHref(items: readonly CompareItem[]): string {
  // Commas and dots are safe in a query value; keep the URL readable.
  return items.length ? `/c/compare?f=${items.map(itemId).join(",")}` : "/c/compare";
}
