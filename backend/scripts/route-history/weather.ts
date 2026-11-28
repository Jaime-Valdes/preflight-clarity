/*
 * The weather side of version D's takeoff and landing history (docs/REAL_DATA.md, "Status: takeoff
 * and landing from MADIS"): each airport's routine hourly weather reports (METAR) for a month, from
 * the Iowa Environmental Mesonet's ASOS archive (mesonet.agron.iastate.edu, free and public), counted
 * by the local time-of-day window: hours reported, hours with a gust, with wind of 15 knots or more,
 * with a thunderstorm at or near the airport (WEATHER_CELLS, shared/src/routeHistory.ts). They say why
 * an airport's takeoffs and landings are livelier at some times; the ratings rest on the readings.
 *
 * weatherCounts is pure; fetchWeatherMonth is the one network call, one airport at a time, spaced out
 * (IEM asks automated clients not to hammer it, and answers 429 when they do).
 */
import { WEATHER_CELLS, WX, windowOf } from "@preflight/shared/routeHistory";

const IEM = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
const HEADERS = { "user-agent": "route-history-refresh" };
/** An answer far larger than a month of hourly reports (about 50 KB) is not one. */
const MAX_BYTES = 8 * 1024 * 1024;
const ATTEMPTS = 5;
/** Wind at or above this many knots counts as windy. */
export const WINDY_KTS = 15;

const formatters = new Map<string, Intl.DateTimeFormat>();
function localHour(ms: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) formatters.set(tz, (f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" })));
  return Number(f.format(new Date(ms))) % 24;
}

/**
 * IEM's comma-separated answer (station,valid,sknt,gust,wxcodes; valid in UTC, "M" for missing) →
 * WEATHER_CELLS counts for the reports in `month` ("YYYY-MM", UTC), one per UTC hour (the first),
 * by the local window at `tz`. Null when the month has no reports.
 */
export function weatherCounts(csv: string, tz: string, month: string): number[] | null {
  const counts = new Array<number>(WEATHER_CELLS).fill(0);
  const seen = new Set<string>();
  let any = false;
  for (const line of csv.split("\n")) {
    const cols = line.trim().split(",");
    if (cols.length < 5 || cols[0] === "station" || line.startsWith("#")) continue;
    const [, valid, sknt, gust, wx] = cols;
    const m = /^(\d{4}-\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(valid ?? "");
    if (!m || m[1] !== month) continue;
    const hourKey = `${m[1]}-${m[2]} ${m[3]}`;
    if (seen.has(hourKey)) continue;
    seen.add(hourKey);
    const ms = Date.parse(`${m[1]}-${m[2]}T${m[3]}:${m[4]}:00Z`);
    if (!Number.isFinite(ms)) continue;
    const base = 4 * windowOf(localHour(ms, tz));
    any = true;
    counts[base + WX.hours]++;
    const g = Number(gust);
    if (gust !== "M" && Number.isFinite(g) && g > 0) counts[base + WX.gust]++;
    const k = Number(sknt);
    if (sknt !== "M" && Number.isFinite(k) && k >= WINDY_KTS) counts[base + WX.windy]++;
    if (wx && wx !== "M" && /TS/.test(wx)) counts[base + WX.storm]++;
  }
  return any ? counts : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The URL for one station's routine reports over a month ("YYYY-MM"). */
export function weatherUrl(station: string, month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const q = new URLSearchParams({ station, year1: String(y), month1: String(m), day1: "1", year2: String(next[0]), month2: String(next[1]), day2: "1" });
  for (const d of ["sknt", "gust", "wxcodes"]) q.append("data", d);
  for (const [k, v] of Object.entries({ tz: "Etc/UTC", format: "onlycomma", latlon: "no", elev: "no", missing: "M", trace: "T", direct: "no", report_type: "3" })) q.set(k, v);
  return `${IEM}?${q.toString()}`;
}

/** One station's month as IEM answers it, or null when it could not be had (the month then has no weather for it). */
export async function fetchWeatherMonth(station: string, month: string): Promise<string | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(weatherUrl(station, month), { headers: HEADERS, signal: controller.signal });
      const body = await res.text();
      if (res.status === 200 && body.length <= MAX_BYTES && body.startsWith("station,")) return body;
      if (res.status === 200) return null;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === ATTEMPTS) {
        console.warn(`weather ${station} ${month}: ${err instanceof Error ? err.message : String(err)}, left out`);
        return null;
      }
      await sleep(30_000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
