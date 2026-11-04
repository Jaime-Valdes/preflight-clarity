/*
 * The generator as a provider: the illustrative timetable versions A, B and C use
 * (shared/src/schedule.ts generatedSchedule), so GET /flights/day works with no key and the tests
 * have a deterministic source. Only fetchedAt reads the clock.
 */
import { generatedSchedule } from "@preflight/shared/schedule";
import type { ScheduleProvider } from "./types";

export function createGeneratorProvider(now: () => number = Date.now): ScheduleProvider {
  return {
    name: "generator",
    async fetchDay(from, to, date) {
      return generatedSchedule({ origin: from, destination: to, date }, new Date(now()).toISOString());
    },
  };
}
