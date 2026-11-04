/*
 * The fixture provider (FLIGHT_PROVIDER=fixture, the tests): AeroDataBox FIDS listings saved as
 * backend/fixtures/aerodatabox/{ORIGIN}-{date}.json (one AirportFidsContract, the origin's
 * departures for the day), mapped by the same code as the live adapter. A day with no file is a
 * provider failure, like an API that does not answer.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scheduleFromFids, type AdbFids } from "./aerodatabox";
import { ProviderError, type ScheduleProvider } from "./types";

/** backend/fixtures/aerodatabox, whether the process runs from backend/ (npm run … -w backend) or from the repo root. */
export function defaultFixtureDir(cwd: string = process.cwd()): string {
  const own = resolve(cwd, "fixtures", "aerodatabox");
  const fromRoot = resolve(cwd, "backend", "fixtures", "aerodatabox");
  return !existsSync(own) && existsSync(fromRoot) ? fromRoot : own;
}

export function fixtureFile(dir: string, from: string, date: string): string {
  return join(dir, `${from}-${date}.json`);
}

function isMissingFile(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

export function createFixtureProvider(dir: string = defaultFixtureDir(), now: () => number = Date.now): ScheduleProvider {
  return {
    name: "fixture",
    async fetchDay(from, to, date) {
      const file = fixtureFile(dir, from, date);
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch (err) {
        if (isMissingFile(err)) throw new ProviderError(`no fixture for ${from} on ${date} (${file})`);
        throw new ProviderError(`fixture ${file} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
      let fids: AdbFids;
      try {
        fids = JSON.parse(raw) as AdbFids;
      } catch {
        throw new ProviderError(`fixture ${file} is not valid JSON`);
      }
      return scheduleFromFids(from, to, date, [fids], new Date(now()).toISOString());
    },
  };
}
