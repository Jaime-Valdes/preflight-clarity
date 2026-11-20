import { Hono } from "hono";
import { loadRouteDay, validateDayQuery } from "../lib/flights/index";
import { ProviderError, type RouteDayResponse } from "../lib/flights/types";
import { onTimeForSchedule } from "../lib/onTime/index";
import { rateLimit } from "../lib/rateLimit";

export const flights = new Hono();

/** Browsers and the web app's proxy may keep a day for ten minutes; the server's own cache keeps it for a day. */
export const DAY_CACHE_CONTROL = "public, max-age=600";

/**
 * The day's nonstops on a route (docs/REAL_DATA.md, step 1): ?from=JFK&to=LAX&date=YYYY-MM-DD.
 * Public, so the shared per-IP rate limit applies. The answer is the shared RouteDaySchedule plus
 * whether it came from the cache, and the airline on-time figures for the day (`onTime`, the US
 * DOT's, attached on the way out and never cached with the day, so a refreshed table shows at
 * once; a client that predates it ignores the field); a provider that cannot answer is a 502, and a process that has
 * spent its hourly allowance of provider calls a 503 with Retry-After. The app-wide no-store gives
 * way to a short public max-age on success only.
 */
flights.get("/day", rateLimit, async (c) => {
  const check = validateDayQuery({ from: c.req.query("from"), to: c.req.query("to"), date: c.req.query("date") }, new Date());
  if (!check.ok) return c.json<RouteDayResponse>({ ok: false, error: check.error }, 400);

  try {
    const { schedule, cached } = await loadRouteDay(check.query);
    c.header("Cache-Control", DAY_CACHE_CONTROL);
    const onTime = onTimeForSchedule(schedule);
    return c.json<RouteDayResponse>(onTime ? { ok: true, schedule, cached, onTime } : { ok: true, schedule, cached });
  } catch (err) {
    if (err instanceof ProviderError && err.reason === "budget") {
      console.warn("flights/day:", err.message);
      c.header("Retry-After", "600");
      return c.json<RouteDayResponse>({ ok: false, error: "provider_budget" }, 503);
    }
    console.error("flights/day: the provider could not answer", err instanceof Error ? err.message : err);
    return c.json<RouteDayResponse>({ ok: false, error: "provider_error" }, 502);
  }
});
