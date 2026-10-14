// STUB — owned by the generator agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
import type { Airport } from "./types";

export const AIRPORTS: readonly Airport[] = [
  { code: "JFK", city: "New York", name: "John F. Kennedy International", country: "US", lat: 40.6413, lon: -73.7781, tz: "America/New_York", known: true },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles International", country: "US", lat: 33.9416, lon: -118.4085, tz: "America/Los_Angeles", known: true },
  { code: "LHR", city: "London", name: "Heathrow", country: "GB", lat: 51.47, lon: -0.4543, tz: "Europe/London", known: true },
];

/** Codes shown as quick picks in flight setup, most popular first. */
export const POPULAR_AIRPORT_CODES: readonly string[] = ["JFK", "LAX", "LHR"];

/** Exact IATA code lookup (case-insensitive). */
export function getAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code.trim().toUpperCase());
}

/** Ranked search over code, city and name. Empty query → popular airports. */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return AIRPORTS.slice(0, limit);
  return AIRPORTS.filter((a) => `${a.code} ${a.city} ${a.name}`.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Resolve a FlightInput origin/destination value to an Airport: a known
 * airport by code, otherwise a deterministic synthetic one (known: false).
 */
export function resolveAirport(value: string): Airport {
  return getAirport(value) ?? { ...AIRPORTS[0], code: value.slice(0, 3).toUpperCase(), city: value, name: value, known: false };
}
