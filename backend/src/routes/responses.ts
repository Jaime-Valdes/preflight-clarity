import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseSessionRecord } from "@preflight/shared/record";
import type { ListResponse, SaveResponse } from "@preflight/shared/types";
import { isAdminKey } from "../lib/admin";
import { listResponses, storageKind, upsertResponse } from "../lib/db";

/** Largest accepted request body, bytes. A full session record is ~10–20 KB. */
export const MAX_BODY_BYTES = 100_000;

/**
 * Saves accepted per client IP per minute (override with RATE_LIMIT_PER_MINUTE).
 * At peak a participant sends about 6 saves a minute (a dashboard checkpoint
 * every 20 s, two beacon saves per app switch, plus step saves), so 1000/min
 * covers ~160 participants behind one NAT address; a flood (10–100× that) does not.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAP_SWEEP_SIZE = 1000;

// ── Rate limit (in-memory, per process — plenty for one small API instance) ──

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimitPerMinute(): number {
  const configured = Number(process.env.RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/** Counts one request from `ip`; true when it is over the limit for the current minute. */
function isRateLimited(ip: string, now: number): boolean {
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
function clientIp(c: Context): string {
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

export const responses = new Hono();

const tooLarge = (c: Context) =>
  c.json<SaveResponse>({ ok: false, storage: storageKind(), error: "too_large" }, 413);

/**
 * Save (upsert) one session record. Accepts JSON sent as application/json or text/plain (sendBeacon).
 * The body cap is enforced by bodyLimit while the request streams in: a declared
 * Content-Length is checked up front, and a chunked upload is cut off as soon as it
 * passes MAX_BODY_BYTES, so an oversized body is never buffered in full.
 */
responses.post("/", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge }), async (c) => {
  if (isRateLimited(clientIp(c), Date.now())) {
    c.header("Retry-After", "60");
    return c.json<SaveResponse>({ ok: false, storage: storageKind(), error: "rate_limited" }, 429);
  }

  const text = await c.req.text(); // already capped by bodyLimit

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return c.json<SaveResponse>({ ok: false, storage: storageKind(), error: "invalid_json" }, 400);
  }

  const parsed = parseSessionRecord(payload);
  if (!parsed.ok) {
    return c.json<SaveResponse>({ ok: false, storage: storageKind(), error: parsed.error }, 400);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<SaveResponse>({ ok: false, storage, error: "not_configured" }, 503);
  }

  try {
    await upsertResponse(parsed.record);
    return c.json<SaveResponse>({ ok: true, storage });
  } catch (err) {
    console.error("upsertResponse failed", err);
    return c.json<SaveResponse>({ ok: false, storage, error: "db_error" }, 500);
  }
});

/** All session records, newest first. Team only: ?key=<ADMIN_KEY> or an x-admin-key header. */
responses.get("/", async (c) => {
  const key = c.req.header("x-admin-key") ?? c.req.query("key");
  if (!isAdminKey(key)) {
    return c.json<ListResponse>({ ok: false, storage: storageKind(), responses: [], error: "unauthorized" }, 401);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<ListResponse>({ ok: false, storage, responses: [], error: "not_configured" }, 503);
  }

  try {
    const records = await listResponses();
    return c.json<ListResponse>({ ok: true, storage, responses: records });
  } catch (err) {
    console.error("listResponses failed", err);
    return c.json<ListResponse>({ ok: false, storage, responses: [], error: "db_error" }, 500);
  }
});
