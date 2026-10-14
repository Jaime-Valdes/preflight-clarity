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
