"use client";

import posthog from "posthog-js";
import { isTestMode, touchTestMode } from "@/lib/testMode";
import { toolForPath } from "@/lib/tool";

/*
 * Product analytics (PostHog): funnels, paths and session replay for the study
 * and version C. Off entirely unless NEXT_PUBLIC_POSTHOG_KEY is set, so local
 * runs and forks send nothing. Never receives names, emails or survey answers —
 * those live only in the session record (backend). Event names and properties
 * are listed in docs/ANALYTICS.md; keep them in sync.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
/** Same-origin proxy (next.config.ts rewrites /ingest/* to PostHog), so ad blockers don't drop events. */
const PROXY_PATH = "/ingest";
const UI_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com";
/** NEXT_PUBLIC_POSTHOG_DEBUG=1 logs every event to the browser console (team debugging). */
const DEBUG = process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "1";

let started = false;
/**
 * Set when this is a team test (?test=1 now, or the browser's test mode): the session is not
 * recorded. Events still go out, flagged is_test, so a test run can be checked in PostHog; a
 * replay of a team member clicking around would only be noise among the recordings the team watches.
 */
let recordingOff = false;

/**
 * Clicks since the last page view. Every $pageview carries the count made on the page just
 * left (clicks_on_previous_page) and every $pageleave the count for its page (clicks_on_page),
 * so "how many clicks did it take to move on" is a property, not an extra event. Referrer and
 * UTM parameters ($referrer, utm_source…) are PostHog's own default pageview properties.
 */
let clicksOnPage = 0;

/**
 * The tools' context for an event sent from a /c or /d page: `variant` ("C" or "D") and `is_test`
 * (the browser is in team test mode, lib/testMode.ts, or the URL carries ?test=1 now). The study registers its context once a
 * session exists (setContext), but super properties persist per browser, so registering the tools'
 * the same way would leak A/B into their events and theirs into the study's welcome pageview.
 * Stamping by URL instead means every tool event carries them, including the first pageview, and
 * the study's are untouched.
 */
function toolContext(currentUrl: unknown): { variant: "C" | "D"; is_test: boolean } | null {
  let url: URL;
  try {
    url = new URL(typeof currentUrl === "string" ? currentUrl : window.location.href, window.location.origin);
  } catch {
    return null;
  }
  const tool = toolForPath(url.pathname);
  if (!tool) return null;
  return { variant: tool.variant, is_test: url.searchParams.get("test") === "1" || isTestMode() };
}

/** Call once on the client. Safe to call again (no-op). */
export function startAnalytics(): void {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;
  if (isTestTab()) recordingOff = true;
  document.addEventListener("click", () => { clicksOnPage += 1; }, true);
  posthog.init(KEY, {
    api_host: PROXY_PATH,
    ui_host: UI_HOST,
    defaults: "2026-08-30",
    debug: DEBUG,
    before_send: (event) => {
      if (!event) return event;
      const tool = toolContext(event.properties?.$current_url);
      if (tool) event.properties = { ...event.properties, ...tool };
      if (tool?.is_test) {
        // A test run in progress: keep its mark alive, and make sure none of it is recorded.
        touchTestMode();
        if (!recordingOff) disableRecordingForTests();
      }
      if (event.event === "$pageview") {
        event.properties = { ...event.properties, clicks_on_previous_page: clicksOnPage };
        clicksOnPage = 0;
      } else if (event.event === "$pageleave") {
        event.properties = { ...event.properties, clicks_on_page: clicksOnPage };
      }
      return event;
    },
    // Visitors stay anonymous: one distinct id per browser, no person profiles.
    person_profiles: "never",
    // The SDK's localhost hook would mark a "test user" on the person profile we never create, and
    // logs an error about it on every dev page; nothing to set, so the hook never matches.
    internal_or_test_user_hostname: /(?!)/,
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    // Team tests are never recorded (see recordingOff); everyone else is, within the masking below.
    disable_session_recording: recordingOff,
    session_recording: {
      // Typed text (airports, survey free text, name, email) never reaches the recording.
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
  });
}

export function analyticsOn(): boolean {
  return started;
}

/** Whether this is a team test: asked for already, the browser's test mode (the tools), or ?test=1 in the URL now. */
function isTestTab(): boolean {
  if (recordingOff || isTestMode()) return true;
  try {
    return new URLSearchParams(window.location.search).get("test") === "1";
  } catch {
    return false;
  }
}

/**
 * Keep this browser's replay out of PostHog (team tests). Called before analytics start, it shapes the
 * config; after, it stops the recording that has begun. Events keep flowing, flagged is_test.
 */
export function disableRecordingForTests(): void {
  recordingOff = true;
  if (started) posthog.stopSessionRecording();
}

export type EventProps = Record<string, string | number | boolean | null | undefined>;

/** One event; dropped when analytics is off. */
export function track(event: string, props: EventProps = {}): void {
  if (!started) return;
  posthog.capture(event, props);
}

/** Properties attached to every later event in this browser (variant, test flag, participant label…). */
export function setContext(props: EventProps): void {
  if (!started) return;
  posthog.register(props);
}
