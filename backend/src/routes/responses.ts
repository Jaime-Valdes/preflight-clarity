import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseSessionRecord } from "@preflight/shared/record";
import type { ListResponse, SaveResponse } from "@preflight/shared/types";
import { isAdminKey } from "../lib/admin";
import { listResponses, storageKind, upsertResponse } from "../lib/db";
import { rateLimit } from "../lib/rateLimit";

/** Largest accepted request body, bytes. A full session record is ~10–20 KB. */
export const MAX_BODY_BYTES = 100_000;

export const responses = new Hono();

const tooLarge = (c: Context) =>
  c.json<SaveResponse>({ ok: false, storage: storageKind(), error: "too_large" }, 413);

/**
 * Save (upsert) one session record. Accepts JSON sent as application/json or text/plain (sendBeacon).
 * The body cap is enforced by bodyLimit while the request streams in: a declared
 * Content-Length is checked up front, and a chunked upload is cut off as soon as it
 * passes MAX_BODY_BYTES, so an oversized body is never buffered in full. The per-IP
 * rate limit (lib/rateLimit.ts) is shared with /signups.
 */
responses.post("/", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge }), rateLimit, async (c) => {
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
