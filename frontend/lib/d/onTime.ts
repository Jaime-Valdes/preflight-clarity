import { airlineOnTime, type AirlineOnTime, type RouteOnTime } from "@preflight/shared/onTime";
import type { Flight } from "@preflight/shared/types";

/*
 * Version D's airline on-time record (docs/REAL_DATA.md, "Status: airline on-time from BTS"): the
 * US DOT's figures the API sent with a day (lib/flights/store.ts keeps them as `onTime`), looked up
 * for one flight's airline on that flight's own route. The generator's airlineStats on-time numbers
 * are never shown in D.
 */

/** The flight's record from the first of the days' figures there are (null when none came with any of them). */
export function onTimeFor(flight: Flight, blocks: ReadonlyArray<RouteOnTime | null | undefined>): AirlineOnTime | null {
  const block = blocks.find((b) => b != null);
  return block ? airlineOnTime(block, flight.airline.code, flight.origin.code, flight.destination.code) : null;
}
