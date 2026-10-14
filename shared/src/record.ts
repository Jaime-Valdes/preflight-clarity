// STUB — owned by the backend agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
import type { SessionRecord } from "./types";

export type ParseResult = { ok: true; record: SessionRecord } | { ok: false; error: string };

/**
 * Defensive validation and sanitization of an untrusted client payload.
 * Rejects anything that isn't a plausible SessionRecord; drops unknown keys;
 * trims and caps free text; filters arrays to known values.
 */
export function parseSessionRecord(input: unknown): ParseResult {
  if (!input || typeof input !== "object") return { ok: false, error: "not_an_object" };
  const candidate = input as Partial<SessionRecord>;
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.length === 0) {
    return { ok: false, error: "missing_session_id" };
  }
  if (candidate.schemaVersion !== 1) return { ok: false, error: "unsupported_schema_version" };
  return { ok: true, record: candidate as SessionRecord };
}
