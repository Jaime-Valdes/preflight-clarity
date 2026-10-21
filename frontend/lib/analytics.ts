"use client";

import posthog from "posthog-js";

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

/** Call once on the client. Safe to call again (no-op). */
export function startAnalytics(): void {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;
  posthog.init(KEY, {
    api_host: PROXY_PATH,
    ui_host: UI_HOST,
    defaults: "2026-08-30",
    debug: DEBUG,
    // Visitors stay anonymous: one distinct id per browser, no person profiles.
    person_profiles: "never",
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
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
