/*
 * Version D's route turbulence history (docs/REAL_DATA.md, "Status: route history from MADIS"):
 * the table backend/scripts/route-history builds from NOAA MADIS's airliner turbulence readings,
 * bundled into the API, and the part of it GET /flights/day attaches to a route-day. The table stays
 * on the server: a day carries its own routes' figures for its month, a few hundred bytes.
 */
import { routeHistoryDay, type RouteHistoryDay, type RouteHistoryTable } from "@preflight/shared/routeHistory";
import type { RouteDaySchedule } from "@preflight/shared/schedule";
import table from "./route-history.json" with { type: "json" };

/** The bundled table (refreshed monthly by .github/workflows/route-history.yml). */
export const ROUTE_HISTORY_TABLE = table as unknown as RouteHistoryTable;

/**
 * The history for a route-day: the schedule's own route and every route its rows fly, for the
 * day's month; undefined when the table can't be read, so a broken table never costs the day its schedule.
 */
export function routeHistoryForSchedule(schedule: RouteDaySchedule, source: RouteHistoryTable = ROUTE_HISTORY_TABLE): RouteHistoryDay | undefined {
  try {
    const routes: Array<readonly [string, string]> = [[schedule.origin, schedule.destination]];
    for (const row of schedule.rows) routes.push([row.origin, row.destination]);
    return routeHistoryDay(source, routes, schedule.date);
  } catch (err) {
    console.error("flights/day: the route history table could not be read", err instanceof Error ? err.message : err);
    return undefined;
  }
}
