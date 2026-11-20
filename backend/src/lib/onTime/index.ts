/*
 * Version D's airline on-time record (docs/REAL_DATA.md, "Status: airline on-time from BTS"): the
 * table backend/scripts/bts-ontime.ts precomputes from the US DOT's monthly files, bundled into
 * the API, and the part of it GET /flights/day attaches to a route-day. The table stays on the
 * server: a day carries the period, the industry and network figures and its own routes' figures,
 * a few hundred bytes, so D's first load does not grow.
 */
import { routeOnTime, type OnTimeTable, type RouteOnTime } from "@preflight/shared/onTime";
import type { RouteDaySchedule } from "@preflight/shared/schedule";
import table from "./bts-ontime.json" with { type: "json" };

/** The bundled table (Oct 2025–Sep 2026 when this was written; refresh monthly with the script). */
export const ON_TIME_TABLE = table as unknown as OnTimeTable;

/**
 * The figures for a route-day: the schedule's own route and every route its rows fly (a provider
 * may list a flight from another airport of the city), or undefined when the table can't be read,
 * so a broken table never costs the day its schedule.
 */
export function onTimeForSchedule(schedule: RouteDaySchedule, source: OnTimeTable = ON_TIME_TABLE): RouteOnTime | undefined {
  try {
    const routes: Array<readonly [string, string]> = [[schedule.origin, schedule.destination]];
    for (const row of schedule.rows) routes.push([row.origin, row.destination]);
    return routeOnTime(source, routes);
  } catch (err) {
    console.error("flights/day: the on-time table could not be read", err instanceof Error ? err.message : err);
    return undefined;
  }
}
