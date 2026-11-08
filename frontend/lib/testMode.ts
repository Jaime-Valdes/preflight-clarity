"use client";

/*
 * Team test mode for the two flight tools (version C at /c, version D at /d; docs/INTEREST.md,
 * docs/ANALYTICS.md). Opening any tool page with ?test=1 marks this browser as a team test: every
 * PostHog event from the tools carries is_test = true, a sign-up is stored as a test, and the
 * session is not recorded (lib/analytics.ts). The mark lasts while the tester keeps going — every
 * flagged event refreshes it — and ends after TEST_MODE_IDLE_MS without activity, the way a PostHog
 * session does, so a teammate's phone is not a test device for ever. It used to live in
 * sessionStorage, per tab, which lost the flag the moment a link was opened in a new tab; PostHog's
 * session spans tabs, so the rest of the run arrived unflagged. The study (/) has its own flag in
 * the session record. Read in handlers and effects, never during render: storage and the clock.
 */

export const TEST_MODE_KEY = "pfc.test.v2";
/** Idle time after which test mode ends: PostHog's own session timeout. */
export const TEST_MODE_IDLE_MS = 30 * 60 * 1000;

function readMark(): number | null {
  try {
    const raw = window.localStorage.getItem(TEST_MODE_KEY);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeMark(at: number): void {
  try {
    window.localStorage.setItem(TEST_MODE_KEY, String(at));
  } catch {
    // Storage blocked: the run is simply not marked as a test.
  }
}

/** Whether this browser is in team test mode right now (a mark less than TEST_MODE_IDLE_MS old). */
export function isTestMode(now: number = Date.now()): boolean {
  const at = readMark();
  return at !== null && Math.abs(now - at) < TEST_MODE_IDLE_MS;
}

/** Keep test mode going (called for every flagged event), so it ends only after idle time. */
export function touchTestMode(now: number = Date.now()): void {
  if (isTestMode(now)) writeMark(now);
}

/** From the tools' layouts, in an effect: ?test=1 in the URL starts (or refreshes) test mode. */
export function noteTestFlag(now: number = Date.now()): void {
  try {
    if (new URLSearchParams(window.location.search).get("test") === "1") writeMark(now);
  } catch {
    // No URL to read: nothing to mark.
  }
}
