import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseDFeedback } from "@preflight/shared/dFeedback";
import type { ListDFeedbackResponse, SaveDFeedbackResponse } from "@preflight/shared/types";
import { isAdminKey } from "../lib/admin";
import { listDFeedback, storageKind, upsertDFeedback } from "../lib/db";
import { rateLimit } from "../lib/rateLimit";

/** Largest accepted request body, bytes. Three answers of 1,000 characters at most, plus the row: well under 10 KB. */
export const MAX_D_FEEDBACK_BODY_BYTES = 10_000;

export const dFeedback = new Hono();

const tooLarge = (c: Context) =>
  c.json<SaveDFeedbackResponse>({ ok: false, storage: storageKind(), error: "too_large" }, 413);

/**
 * Save (upsert by id) one answered step of version D's Flight Day Pack test or its general
 * feedback (docs/FLIGHT_DAY_PACK.md). Accepts JSON sent as application/json or text/plain.
 * Public, so it has the same guards as /responses and /signups: the body cap (enforced while
 * the request streams in) and the shared per-IP rate limit (lib/rateLimit.ts). Strict
 * validation in shared/src/dFeedback.ts: known kinds, placements and answer keys only.
 */
dFeedback.post("/", bodyLimit({ maxSize: MAX_D_FEEDBACK_BODY_BYTES, onError: tooLarge }), rateLimit, async (c) => {
  const text = await c.req.text(); // already capped by bodyLimit

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return c.json<SaveDFeedbackResponse>({ ok: false, storage: storageKind(), error: "invalid_json" }, 400);
  }

  const parsed = parseDFeedback(payload);
  if (!parsed.ok) {
    return c.json<SaveDFeedbackResponse>({ ok: false, storage: storageKind(), error: parsed.error }, 400);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<SaveDFeedbackResponse>({ ok: false, storage, error: "not_configured" }, 503);
  }

  try {
    await upsertDFeedback(parsed.feedback);
    return c.json<SaveDFeedbackResponse>({ ok: true, storage });
  } catch (err) {
    console.error("upsertDFeedback failed", err);
    return c.json<SaveDFeedbackResponse>({ ok: false, storage, error: "db_error" }, 500);
  }
});

/** Every row, newest first. Team only: ?key=<ADMIN_KEY> or an x-admin-key header. */
dFeedback.get("/", async (c) => {
  const key = c.req.header("x-admin-key") ?? c.req.query("key");
  if (!isAdminKey(key)) {
    return c.json<ListDFeedbackResponse>({ ok: false, storage: storageKind(), feedback: [], error: "unauthorized" }, 401);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<ListDFeedbackResponse>({ ok: false, storage, feedback: [], error: "not_configured" }, 503);
  }

  try {
    // Stored rows are read with the lenient parser (iteration 1's "airline" item stays readable); a row it can't
    // read is passed through as stored rather than dropped.
    const feedback = (await listDFeedback()).map((row) => {
      const parsed = parseDFeedback(row, { stored: true });
      return parsed.ok ? parsed.feedback : row;
    });
    return c.json<ListDFeedbackResponse>({ ok: true, storage, feedback });
  } catch (err) {
    console.error("listDFeedback failed", err);
    return c.json<ListDFeedbackResponse>({ ok: false, storage, feedback: [], error: "db_error" }, 500);
  }
});
