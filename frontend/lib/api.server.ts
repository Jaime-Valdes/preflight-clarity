import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ListResponse, ListSignupsResponse, SessionRecord, Signup, StorageKind } from "@preflight/shared/types";

/*
 * Server-only data access for the team results page. Never import this from
 * a client component: it reads ADMIN_KEY and API_URL from the environment and
 * forwards the admin key to the backend.
 */

export type ResultsData =
  | {
      status: "ok";
      records: SessionRecord[];
      storage: StorageKind;
      /** Product-interest sign-ups (docs/INTEREST.md); empty when the backend has none or no endpoint. */
      signups: Signup[];
      /** Why the sign-ups may be incomplete (old backend, no storage, request failed); undefined when they loaded. */
      signupsNote?: string;
    }
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

type Fetched = { kind: "response"; response: Response } | { kind: "unreachable"; detail: string };

/** One admin GET against the backend. Network failures come back as a value, never a throw. */
async function adminGet(apiUrl: string, path: string, headerKey: string): Promise<Fetched> {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { "x-admin-key": headerKey, accept: "application/json" },
      cache: "no-store",
    });
    return { kind: "response", response };
  } catch (err) {
    return { kind: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch every session record (and the sign-ups) from the backend for the results page. Never throws. */
export async function fetchResults(key: string | undefined): Promise<ResultsData> {
  if (!matchesLocalAdminKey(key)) return { status: "unauthorized" };

  const apiUrl = process.env.API_URL?.trim().replace(/\/+$/, "");
  if (!apiUrl) return { status: "no_backend", reason: "no_api_url" };

  const headerKey = key && HEADER_SAFE.test(key) ? key : "";
  const [responses, signups] = await Promise.all([
    adminGet(apiUrl, "/responses", headerKey),
    adminGet(apiUrl, "/signups", headerKey),
  ]);

  if (responses.kind === "unreachable") {
    return { status: "error", message: `The backend at ${apiUrl} could not be reached (${responses.detail}).` };
  }
  const response = responses.response;
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

  const interest = await readSignups(signups);
  return {
    status: "ok",
    records: body.responses,
    storage: storageKind(body.storage),
    signups: interest.signups,
    signupsNote: interest.note,
  };
}

/**
 * The sign-ups are a bonus on top of the sessions: whatever goes wrong here
 * (an older backend without the endpoint, no storage, a bad body) turns into
 * an empty list plus a note the page can show — never a failed page.
 */
async function readSignups(fetched: Fetched): Promise<{ signups: Signup[]; note?: string }> {
  if (fetched.kind === "unreachable") {
    return { signups: [], note: `Sign-ups could not be loaded (${fetched.detail}).` };
  }
  const response = fetched.response;
  if (response.status === 404) {
    return { signups: [], note: "This backend has no sign-ups endpoint yet — deploy the latest API to see them here." };
  }
  if (response.status === 503) {
    return { signups: [], note: "The backend has no storage for sign-ups yet." };
  }
  if (!response.ok) {
    return { signups: [], note: `Sign-ups could not be loaded (the backend answered with status ${response.status}).` };
  }
  let body: Partial<ListSignupsResponse> | null = null;
  try {
    body = (await response.json()) as Partial<ListSignupsResponse>;
  } catch {
    return { signups: [], note: "Sign-ups could not be loaded (the backend sent a response that isn't JSON)." };
  }
  if (!body || !Array.isArray(body.signups)) {
    return { signups: [], note: "Sign-ups could not be loaded (the backend sent an unexpected response shape)." };
  }
  return { signups: body.signups };
}
