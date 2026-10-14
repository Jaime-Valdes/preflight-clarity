import type { SessionRecord } from "@preflight/shared/types";

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
const MAX_LOCAL_RECORDS = 200;
const ENDPOINT = "/api/responses";
/** Chrome caps keepalive / sendBeacon payloads at 64 KB; stay comfortably under. */
const KEEPALIVE_LIMIT_BYTES = 60_000;

type SaveResult = "remote" | "local";

let queue: Promise<unknown> = Promise.resolve();

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

  if (opts?.beacon) {
    if (sendBeacon(json)) return Promise.resolve("remote");
    // Beacon refused (queue full / payload too large): fall through to fetch.
  }

  const run = queue.then(() => postRecord(json)).catch((): SaveResult => "local");
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

async function postRecord(json: string): Promise<SaveResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
      keepalive: byteLength(json) <= KEEPALIVE_LIMIT_BYTES,
    });
    return res.ok ? "remote" : "local";
  } catch {
    return "local";
  }
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
