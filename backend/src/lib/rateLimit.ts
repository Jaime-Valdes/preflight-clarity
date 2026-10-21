/*
 * Per-IP rate limit shared by the public POST routes (/responses, /signups):
 * one in-memory counter per client address per minute, per process — plenty
 * for one small API instance. Both routes draw on the same budget, so a flood
 * on either is stopped the same way.
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import type { SaveResponse } from "@preflight/shared/types";
import { storageKind } from "./db";

/**
 * Requests accepted per client IP per minute (override with RATE_LIMIT_PER_MINUTE).
 * At peak a participant sends about 6 saves a minute (a dashboard checkpoint
 * every 20 s, two beacon saves per app switch, plus step saves), so 1000/min
 * covers ~160 participants behind one NAT address; a flood (10–100× that) does not.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAP_SWEEP_SIZE = 1000;

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimitPerMinute(): number {
  const configured = Number(process.env.RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/** Counts one request from `ip`; true when it is over the limit for the current minute. */
export function isRateLimited(ip: string, now: number): boolean {
  let entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (hits.size >= RATE_MAP_SWEEP_SIZE) {
      for (const [key, value] of hits) if (now >= value.resetAt) hits.delete(key);
    }
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    hits.set(ip, entry);
  }
  entry.count += 1;
  return entry.count > rateLimitPerMinute();
}

/** Best-effort client address: proxy headers (Railway, the Vercel rewrite) first, then the socket. */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // no socket (e.g. app.request() in tests)
  }
}

/**
 * Route middleware: 429 with Retry-After once the client is over its budget for
 * the minute. The body has the shape every save route answers with
 * (SaveResponse and SaveSignupResponse are the same shape).
 */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  if (isRateLimited(clientIp(c), Date.now())) {
    c.header("Retry-After", "60");
    return c.json<SaveResponse>({ ok: false, storage: storageKind(), error: "rate_limited" }, 429);
  }
  await next();
};
