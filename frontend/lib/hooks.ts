"use client";

import { useSyncExternalStore } from "react";
import { toISODate } from "@preflight/shared/dates";

/*
 * Client-only values without hydration mismatches, without reading the clock
 * during prerender, and without `setState` inside effects (all three are
 * enforced: Next.js Cache Components + the React Compiler lint rules).
 */

const noopSubscribe = () => () => {};

/** false during server render and hydration, true afterwards on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Today's local date as "YYYY-MM-DD" on the client; null during server render/hydration. */
export function useTodayISO(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => toISODate(new Date()),
    () => null,
  );
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** A query-string parameter on the client (null if absent, or during server render). */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribeToLocation,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

let minuteNow = 0;
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToMinute(onChange: () => void) {
  minuteListeners.add(onChange);
  if (minuteTimer === null) {
    minuteTimer = setInterval(() => {
      minuteNow = Date.now();
      for (const listener of minuteListeners) listener();
    }, 60_000);
  }
  return () => {
    minuteListeners.delete(onChange);
    if (minuteListeners.size === 0 && minuteTimer !== null) {
      clearInterval(minuteTimer);
      minuteTimer = null;
    }
  };
}

/**
 * The current time in ms on the client, refreshed every minute (for "already left" checks);
 * null during server render and hydration. The value only changes on the minute tick, so
 * renders stay pure.
 */
export function useNowMs(): number | null {
  return useSyncExternalStore(
    subscribeToMinute,
    () => {
      if (minuteNow === 0) minuteNow = Date.now();
      return minuteNow;
    },
    () => null,
  );
}
