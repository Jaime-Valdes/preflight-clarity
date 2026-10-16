import { AIRLINES } from "@preflight/shared/airlines";
import { AIRPORTS, getAirport } from "@preflight/shared/airports";
import { hasNonstopService, searchFlights, type FlightOption } from "@preflight/shared/search";
import type { Airport } from "@preflight/shared/types";
import type { RouteDay } from "@/lib/c/model";

/*
 * Version C: route-level facts for the results page. Pure and deterministic
 * (the search is cached) — safe in render / useMemo.
 *
 * - A route no airline would plausibly fly nonstop has no flights on any day
 *   (docs/FEASIBILITY.md): the page then says so and suggests nearby routes
 *   that do have nonstops, from major airports in the same countries.
 * - Some airports only have shorter flights (LaGuardia, Reagan National), so
 *   the day's flights may leave from (or land at) the city's other airport.
 */

/** Airports some airline uses as a hub or focus city: the "major" airports suggestions come from. */
const MAJOR = new Set(AIRLINES.flatMap((airline) => airline.hubs));

function distanceKm(a: Airport, b: Airport): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when no airline would fly this route nonstop — a route-level fact, the same on every date. */
export function routeHasNoNonstops(day: RouteDay): boolean {
  return !hasNonstopService(day.origin, day.destination);
}

/** The route has nonstops on `date` that really use these two airports (not the city's other airport). */
function fliesAsNamed(route: RouteDay): boolean {
  try {
    const first = searchFlights(route).options[0]?.flight;
    return !!first && first.origin.code === route.origin && first.destination.code === route.destination;
  } catch {
    return false;
  }
}

/** Major airports in the same country as `airport`, nearest first (not `exclude`). */
function majorsNear(airport: Airport, exclude: readonly string[], limit: number): Airport[] {
  return AIRPORTS.filter((a) => a.country === airport.country && MAJOR.has(a.code) && !exclude.includes(a.code))
    .map((a) => ({ a, km: distanceKm(airport, a) }))
    .sort((x, y) => x.km - y.km || x.a.code.localeCompare(y.a.code))
    .slice(0, limit)
    .map((x) => x.a);
}

/**
 * Up to `limit` routes like this one that do have nonstop flights on the day:
 * the same destination from a major airport near the origin, and the same
 * origin to a major airport near the destination — alternating, nearest first.
 * Only routes whose flights use the airports named (long flights "from LGA"
 * leave from JFK, so LGA isn't suggested for them).
 */
export function nearbyRoutes(day: RouteDay, limit = 4): RouteDay[] {
  const origin = getAirport(day.origin);
  const destination = getAirport(day.destination);
  if (!origin || !destination) return [];
  const exclude = [origin.code, destination.code];
  const fromSide = majorsNear(origin, exclude, 5).map((a) => ({ ...day, origin: a.code }));
  const toSide = majorsNear(destination, exclude, 5).map((a) => ({ ...day, destination: a.code }));
  const picked: RouteDay[] = [];
  for (let i = 0; i < 5 && picked.length < limit; i += 1) {
    for (const route of [fromSide[i], toSide[i]]) {
      if (route && picked.length < limit && hasNonstopService(route.origin, route.destination) && fliesAsNamed(route)) picked.push(route);
    }
  }
  return picked;
}

/** "LaGuardia (LGA)" */
function named(code: string): string {
  const airport = getAirport(code);
  return airport ? `${airport.name} (${airport.code})` : code;
}

/**
 * When the day's flights use another airport than the one searched (long
 * flights from LGA leave from JFK), a calm sentence that says so; else null.
 */
export function airportSwapNote(day: RouteDay, options: readonly FlightOption[]): string | null {
  const first = options[0]?.flight;
  if (!first) return null;
  const notes: string[] = [];
  if (first.origin.code !== day.origin) {
    notes.push(`Nonstop flights on this route leave from ${named(first.origin.code)} — ${named(day.origin)} handles shorter flights.`);
  }
  if (first.destination.code !== day.destination) {
    notes.push(`Nonstop flights on this route land at ${named(first.destination.code)} — ${named(day.destination)} handles shorter flights.`);
  }
  return notes.length ? notes.join(" ") : null;
}
