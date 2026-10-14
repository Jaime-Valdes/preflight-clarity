import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ListResponse, SessionRecord, StorageKind } from "@preflight/shared/types";

/*
 * Server-only data access for the team results page. Never import this from
 * a client component: it reads ADMIN_KEY and API_URL from the environment and
 * forwards the admin key to the backend.
 */

export type ResultsData =
  | { status: "ok"; records: SessionRecord[]; storage: StorageKind }
  | { status: "unauthorized" }
  | {
      status: "no_backend";
      /** `no_api_url`: API_URL unset. `not_configured`: the backend answered 503 (no storage yet). */
      reason: "no_api_url" | "not_configured";
    }
  | { status: "error"; message: string };

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Printable ASCII only — anything else can't be an admin key and can't go in a header. */
const HEADER_SAFE = /^[\x21-\x7e]+$/;

/**
 * Does `key` match the ADMIN_KEY configured for the web app? Constant-time
 * (both sides are hashed, so lengths never leak). When no ADMIN_KEY is set
 * locally the backend's own check decides, so this returns true.
 */
export function matchesLocalAdminKey(key: string | undefined): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return true;
  if (!key || !HEADER_SAFE.test(key)) return false;
  return timingSafeEqual(sha256(key), sha256(expected));
}

function storageKind(value: unknown): StorageKind {
  return value === "supabase" || value === "file" || value === "none" ? value : "none";
}

/** Fetch every session record from the backend for the results page. Never throws. */
export async function fetchResults(key: string | undefined): Promise<ResultsData> {
  if (!matchesLocalAdminKey(key)) return { status: "unauthorized" };

  const apiUrl = process.env.API_URL?.trim().replace(/\/+$/, "");
  if (!apiUrl) return { status: "no_backend", reason: "no_api_url" };

  const headerKey = key && HEADER_SAFE.test(key) ? key : "";
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/responses`, {
      headers: { "x-admin-key": headerKey, accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: "error", message: `The backend at ${apiUrl} could not be reached (${detail}).` };
  }

  if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
  if (response.status === 503) return { status: "no_backend", reason: "not_configured" };
  if (!response.ok) {
    return { status: "error", message: `The backend answered with status ${response.status}.` };
  }

  let body: Partial<ListResponse> | null = null;
  try {
    body = (await response.json()) as Partial<ListResponse>;
  } catch {
    return { status: "error", message: "The backend sent a response that isn't JSON." };
  }
  if (!body || !Array.isArray(body.responses)) {
    return { status: "error", message: "The backend sent an unexpected response shape." };
  }
  return { status: "ok", records: body.responses, storage: storageKind(body.storage) };
}
