import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseSignup } from "@preflight/shared/signup";
import type { ListSignupsResponse, SaveSignupResponse } from "@preflight/shared/types";
import { isAdminKey } from "../lib/admin";
import { listSignups, storageKind, upsertSignup } from "../lib/db";
import { rateLimit } from "../lib/rateLimit";

/** Largest accepted request body, bytes. A sign-up is well under 1 KB. */
export const MAX_SIGNUP_BODY_BYTES = 10_000;

export const signups = new Hono();

const tooLarge = (c: Context) =>
  c.json<SaveSignupResponse>({ ok: false, storage: storageKind(), error: "too_large" }, 413);

/**
 * Save (upsert) one product-interest sign-up (docs/INTEREST.md). Accepts JSON sent as
 * application/json or text/plain. One row per email per source: a repeat sign-up
 * replaces the stored one but keeps its original createdAt. Public, so it has the
 * same guards as /responses: the body cap (enforced while the request streams in)
 * and the shared per-IP rate limit (lib/rateLimit.ts).
 */
signups.post("/", bodyLimit({ maxSize: MAX_SIGNUP_BODY_BYTES, onError: tooLarge }), rateLimit, async (c) => {
  const text = await c.req.text(); // already capped by bodyLimit

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return c.json<SaveSignupResponse>({ ok: false, storage: storageKind(), error: "invalid_json" }, 400);
  }

  const parsed = parseSignup(payload);
  if (!parsed.ok) {
    return c.json<SaveSignupResponse>({ ok: false, storage: storageKind(), error: parsed.error }, 400);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<SaveSignupResponse>({ ok: false, storage, error: "not_configured" }, 503);
  }

  try {
    await upsertSignup(parsed.signup);
    return c.json<SaveSignupResponse>({ ok: true, storage });
  } catch (err) {
    console.error("upsertSignup failed", err);
    return c.json<SaveSignupResponse>({ ok: false, storage, error: "db_error" }, 500);
  }
});

/** All sign-ups, newest first. Team only: ?key=<ADMIN_KEY> or an x-admin-key header. */
signups.get("/", async (c) => {
  const key = c.req.header("x-admin-key") ?? c.req.query("key");
  if (!isAdminKey(key)) {
    return c.json<ListSignupsResponse>({ ok: false, storage: storageKind(), signups: [], error: "unauthorized" }, 401);
  }

  const storage = storageKind();
  if (storage === "none") {
    return c.json<ListSignupsResponse>({ ok: false, storage, signups: [], error: "not_configured" }, 503);
  }

  try {
    const list = await listSignups();
    return c.json<ListSignupsResponse>({ ok: true, storage, signups: list });
  } catch (err) {
    console.error("listSignups failed", err);
    return c.json<ListSignupsResponse>({ ok: false, storage, signups: [], error: "db_error" }, 500);
  }
});
