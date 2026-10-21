import { signupKey } from "@preflight/shared/signup";
import type { SessionRecord, Signup } from "@preflight/shared/types";

/*
 * Saving session records — client only.
 *
 * Every save mirrors the record to localStorage first (the no-database
 * fallback the results page can read), then sends it to the backend through
 * the web app's same-origin proxy (/api/responses → backend /responses).
 *
 * Network saves are serialized so records leave the browser in `seq` order.
 * Beacon saves (page hidden / unloading) bypass the queue: sendBeacon is the
 * only thing guaranteed to get out of an unloading page, and the backend
 * ignores stale (lower seq) writes anyway.
 */

export const LOCAL_RESPONSES_KEY = "pfc.responses.v1";
/** Product-interest sign-ups saved in this browser (the no-backend fallback), newest last. */
export const LOCAL_SIGNUPS_KEY = "pfc.signups.v1";
const MAX_LOCAL_RECORDS = 200;
const MAX_LOCAL_SIGNUPS = 200;
const ENDPOINT = "/api/responses";
const SIGNUP_ENDPOINT = "/api/signups";
/** Chrome caps keepalive / sendBeacon payloads at 64 KB; stay comfortably under. */
const KEEPALIVE_LIMIT_BYTES = 60_000;

type SaveResult = "remote" | "local";

let queue: Promise<unknown> = Promise.resolve();
/** Set once /api/responses answers with an HTML 404: the deploy has no backend, so later saves stay local. */
let backendMissing = false;
/** Bound on one network save; a stalled request must not hold back every later save. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Save (upsert) a session record: always mirrors it to localStorage, then
 * POSTs it to /api/responses (navigator.sendBeacon when `beacon`, e.g. on
 * pagehide). Resolves to where it ended up. Never throws.
 */
export function saveSession(record: SessionRecord, opts?: { beacon?: boolean }): Promise<SaveResult> {
  if (typeof window === "undefined") return Promise.resolve("local");

  let json: string;
  try {
    json = JSON.stringify(record);
  } catch {
    return Promise.resolve("local");
  }

  mirrorToLocal(record);
  if (backendMissing) return Promise.resolve("local");

  if (opts?.beacon) {
    if (sendBeacon(json)) return Promise.resolve("remote");
    // Beacon refused (queue full / payload too large): fall through to fetch.
  }

  const run = queue.then(() => postJson(ENDPOINT, json)).catch((): SaveResult => "local");
  queue = run;
  return run;
}

/** All records saved in this browser (the no-database fallback), newest first. */
export function loadLocalResponses(): SessionRecord[] {
  if (typeof window === "undefined") return [];
  const records = Object.values(readLocalMap());
  records.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
  return records;
}

// ── product-interest sign-ups ───────────────────────────────────────────────

/**
 * Save one sign-up (docs/INTEREST.md): mirrored to localStorage, then POSTed
 * to /api/signups. Resolves to where it ended up. Never throws.
 */
export function saveSignup(signup: Signup): Promise<SaveResult> {
  if (typeof window === "undefined") return Promise.resolve("local");
  let json: string;
  try {
    json = JSON.stringify(signup);
  } catch {
    return Promise.resolve("local");
  }
  mirrorSignupToLocal(signup);
  if (backendMissing) return Promise.resolve("local");
  return postJson(SIGNUP_ENDPOINT, json).catch((): SaveResult => "local");
}

/** Sign-ups saved in this browser (the no-backend fallback), newest first. */
export function loadLocalSignups(): Signup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SIGNUPS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(isSignupLike).reverse();
  } catch {
    return [];
  }
}

function isSignupLike(value: unknown): value is Signup {
  return typeof value === "object" && value !== null && typeof (value as Signup).id === "string" && typeof (value as Signup).email === "string";
}

function mirrorSignupToLocal(signup: Signup): void {
  try {
    const raw = window.localStorage.getItem(LOCAL_SIGNUPS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    // One row per email + source, like the stores; a repeat keeps the first sign-up's time.
    const all = Array.isArray(list) ? list.filter(isSignupLike) : [];
    const earlier = all.find((s) => signupKey(s) === signupKey(signup));
    const kept = all.filter((s) => signupKey(s) !== signupKey(signup));
    kept.push(earlier ? { ...signup, createdAt: earlier.createdAt } : signup);
    window.localStorage.setItem(LOCAL_SIGNUPS_KEY, JSON.stringify(kept.slice(-MAX_LOCAL_SIGNUPS)));
  } catch {
    // Storage blocked or full: the network save still goes out.
  }
}

// ── network ─────────────────────────────────────────────────────────────────

function sendBeacon(json: string): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
    if (byteLength(json) > KEEPALIVE_LIMIT_BYTES) return false;
    // text/plain is a "simple" content type: no CORS preflight, and the backend parses it as JSON.
    return navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "text/plain" }));
  } catch {
    return false;
  }
}

/** A 429 is retried this many times, honouring Retry-After (capped) or a short backoff. */
const RATE_LIMIT_RETRIES = 2;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 10_000;

async function postJson(endpoint: string, json: string): Promise<SaveResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
        keepalive: byteLength(json) <= KEEPALIVE_LIMIT_BYTES,
        // Guarded: older Safari has no AbortSignal.timeout.
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
      });
      if (res.status === 404 && (res.headers.get("content-type") ?? "").includes("text/html")) backendMissing = true;
      if (res.status === 429 && attempt < RATE_LIMIT_RETRIES) {
        await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
        continue;
      }
      return res.ok ? "remote" : "local";
    } catch {
      return "local";
    }
  }
}

/** Retry-After in seconds (or an HTTP date), else exponential backoff; never longer than RETRY_MAX_MS. */
function retryDelayMs(retryAfter: string | null, attempt: number): number {
  let ms = RETRY_BASE_MS * 2 ** attempt;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) ms = seconds * 1000;
    else {
      const at = Date.parse(retryAfter);
      if (Number.isFinite(at)) ms = Math.max(0, at - Date.now());
    }
  }
  return Math.min(RETRY_MAX_MS, ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function byteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length * 2;
  }
}

// ── localStorage mirror ─────────────────────────────────────────────────────

type LocalMap = Record<string, SessionRecord>;

function isRecordLike(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<SessionRecord>;
  return r.schemaVersion === 1 && typeof r.sessionId === "string" && r.sessionId.length > 0;
}

function readLocalMap(): LocalMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_RESPONSES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: LocalMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRecordLike(value)) map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

function writeLocalMap(map: LocalMap): boolean {
  try {
    window.localStorage.setItem(LOCAL_RESPONSES_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** Drop the least recently updated records until at most `keep` remain (never the one being saved). */
function prune(map: LocalMap, keep: number, protectId: string): LocalMap {
  const ids = Object.keys(map);
  if (ids.length <= keep) return map;
  const byAge = ids
    .filter((id) => id !== protectId)
    .sort((a, b) => (map[a].updatedAt < map[b].updatedAt ? -1 : map[a].updatedAt > map[b].updatedAt ? 1 : 0));
  const excess = ids.length - keep;
  for (const id of byAge.slice(0, excess)) delete map[id];
  return map;
}

function mirrorToLocal(record: SessionRecord): void {
  try {
    const map = readLocalMap();
    map[record.sessionId] = record;
    prune(map, MAX_LOCAL_RECORDS, record.sessionId);
    if (writeLocalMap(map)) return;
    // Quota exceeded: make room and try once more.
    prune(map, 20, record.sessionId);
    if (writeLocalMap(map)) return;
    writeLocalMap({ [record.sessionId]: record });
  } catch {
    // localStorage unavailable (private mode, disabled storage) — the network save still runs.
  }
}
