// STUB — owned by the study-flow agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
import type { SessionRecord } from "./types";

/**
 * Save (upsert) a session record: always mirrors it to localStorage, then
 * POSTs it to /api/responses (navigator.sendBeacon when `beacon`, e.g. on
 * pagehide). Resolves to where it ended up. Never throws.
 */
export async function saveSession(record: SessionRecord, opts?: { beacon?: boolean }): Promise<"remote" | "local"> {
  void record;
  void opts;
  return "local";
}

/** All records saved in this browser (the no-database fallback), newest first. */
export function loadLocalResponses(): SessionRecord[] {
  return [];
}
