/*
 * Storage façade for the API. The adapter is chosen from the environment on
 * every call (nothing is read at import time, so tests and hosts can set
 * variables first):
 *
 *   "supabase" — SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) together with
 *                SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY, the newer
 *                sb_secret_… keys) are set
 *   "file"     — otherwise, when DATA_FILE is set (a local JSON file; dev only)
 *   "none"     — nothing configured: the API answers 503 not_configured
 */
import { resolve } from "node:path";
import type { SessionRecord, Signup, StorageKind } from "@preflight/shared/types";
import { createFileStore, type FileStore } from "./store/file";
import { createSupabaseStore, supabaseConfig } from "./store/supabase";
import type { ResponseStore } from "./store/types";

/** DATA_FILE as an absolute path (relative values resolve against the working directory). */
function dataFile(): string | undefined {
  const value = process.env.DATA_FILE?.trim();
  return value ? resolve(process.cwd(), value) : undefined;
}

export function storageKind(): StorageKind {
  if (supabaseConfig()) return "supabase";
  if (dataFile()) return "file";
  return "none";
}

/** One file store per path, so its write queue is shared by every request to the same file. */
let fileStore: FileStore | null = null;

function store(): ResponseStore {
  const supabase = supabaseConfig();
  if (supabase) return createSupabaseStore(supabase);

  const file = dataFile();
  if (file) {
    if (fileStore?.path !== file) fileStore = createFileStore(file);
    return fileStore;
  }

  throw new Error("Storage not configured (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or DATA_FILE)");
}

/** Insert or update by sessionId. A write with a lower seq than the stored one is ignored. Throws on error. */
export async function upsertResponse(record: SessionRecord): Promise<void> {
  await store().upsert(record);
}

/** All responses, newest first. Throws on error. */
export async function listResponses(): Promise<SessionRecord[]> {
  return store().list();
}

/** Insert or update a product-interest sign-up: one row per email per source, original createdAt kept. Throws on error. */
export async function upsertSignup(signup: Signup): Promise<void> {
  await store().upsertSignup(signup);
}

/** All sign-ups, newest first. Throws on error. */
export async function listSignups(): Promise<Signup[]> {
  return store().listSignups();
}
