"use client";

import posthog from "posthog-js";
import { isCTest } from "@/components/c/interest/signupState";

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
 * Clicks since the last page view. Every $pageview carries the count made on the page just
 * left (clicks_on_previous_page) and every $pageleave the count for its page (clicks_on_page),
 * so "how many clicks did it take to move on" is a property, not an extra event. Referrer and
 * UTM parameters ($referrer, utm_source…) are PostHog's own default pageview properties.
 */
let clicksOnPage = 0;

/**
 * Version C's context for an event sent from a /c page: `variant` "C" and `is_test` (the tab was
 * opened with ?test=1, or carries it now). The study registers its context once a session exists
 * (setContext), but super properties persist per browser, so registering C's the same way would
 * leak A/B into C events and C into the study's welcome pageview. Stamping by URL instead means
 * every C event carries them, including the first pageview, and the study's are untouched.
 */
function cContext(currentUrl: unknown): { variant: "C"; is_test: boolean } | null {
  let url: URL;
  try {
    url = new URL(typeof currentUrl === "string" ? currentUrl : window.location.href, window.location.origin);
  } catch {
    return null;
  }
  if (url.pathname !== "/c" && !url.pathname.startsWith("/c/")) return null;
  return { variant: "C", is_test: isCTest() || url.searchParams.get("test") === "1" };
}

/** Call once on the client. Safe to call again (no-op). */
export function startAnalytics(): void {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;
  document.addEventListener("click", () => { clicksOnPage += 1; }, true);
  posthog.init(KEY, {
    api_host: PROXY_PATH,
    ui_host: UI_HOST,
    defaults: "2026-08-30",
    debug: DEBUG,
    before_send: (event) => {
      if (!event) return event;
      const c = cContext(event.properties?.$current_url);
      if (c) event.properties = { ...event.properties, ...c };
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
