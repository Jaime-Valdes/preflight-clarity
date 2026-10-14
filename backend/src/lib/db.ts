// STUB — owned by the backend agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
//
// Storage adapters, chosen from the environment:
//   "supabase" — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) set
//   "file"     — otherwise, when DATA_FILE is set (a local JSON file; dev only)
//   "none"     — nothing configured: the API refuses writes with 503 not_configured
import type { SessionRecord, StorageKind } from "@preflight/shared/types";

export function storageKind(): StorageKind {
  return "none";
}

/** Insert or update by sessionId. A write with a lower seq than the stored one is ignored. Throws on error. */
export async function upsertResponse(record: SessionRecord): Promise<void> {
  void record;
  throw new Error("Storage not configured");
}

/** All responses, newest first. Throws on error. */
export async function listResponses(): Promise<SessionRecord[]> {
  return [];
}
