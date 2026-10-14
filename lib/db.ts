// STUB — owned by the backend agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
// Server-only: reads secret environment variables.
import type { SessionRecord } from "./types";

/** True when SUPABASE_URL and a service-role/secret key are set. */
export function isDbConfigured(): boolean {
  return false;
}

/** Insert or update by session_id. Stale writes (lower seq) are ignored by the DB. Throws on error. */
export async function upsertResponse(record: SessionRecord): Promise<void> {
  void record;
  throw new Error("Database not configured");
}

/** All responses, newest first. Throws on error. */
export async function listResponses(): Promise<SessionRecord[]> {
  return [];
}
