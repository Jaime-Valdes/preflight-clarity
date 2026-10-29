"use client";

import { useSyncExternalStore } from "react";
import { RATING_CATEGORIES, parsePriorityOrder, type RatingCategory } from "@preflight/shared/ratings";

/*
 * Version D's "What matters to you" answer: the four rating categories in the
 * visitor's order, kept per browser in localStorage (docs/ITERATION_2.md). No
 * accounts, nothing sent anywhere; the order only shapes the "For you" sort
 * and which ratings sit first on a card. Read it with usePriorities(); never
 * during server render (it reports the default there).
 */

export const PRIORITIES_KEY = "pfc.d.priorities.v1";

export interface Priorities {
  /** All four categories, most important first. The default order until the visitor ranks them. */
  order: readonly RatingCategory[];
  /** The visitor ranked them (false: skipped, or never asked). */
  chosen: boolean;
  /** The setup was answered in this browser, by ranking or by skipping. */
  answered: boolean;
}

const DEFAULT: Priorities = Object.freeze({ order: RATING_CATEGORIES, chosen: false, answered: false });

const listeners = new Set<() => void>();
let memory: string | null = null;
let snapshot: { raw: string | null; value: Priorities } = { raw: null, value: DEFAULT };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PRIORITIES_KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(PRIORITIES_KEY);
    else window.localStorage.setItem(PRIORITIES_KEY, raw);
  } catch {
    // Storage blocked: the in-memory copy still works for this tab.
  }
  for (const listener of listeners) listener();
}

function parse(raw: string | null): Priorities {
  if (!raw) return DEFAULT;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT;
    const { order, chosen } = value as { order?: unknown; chosen?: unknown };
    const parsed = parsePriorityOrder(order);
    if (chosen === true && parsed) return { order: parsed, chosen: true, answered: true };
    if (chosen === false) return { order: RATING_CATEGORIES, chosen: false, answered: true };
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** The same object while nothing changed (useSyncExternalStore needs a stable snapshot). */
function getSnapshot(): Priorities {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, value: parse(raw) };
  return snapshot.value;
}

function getServerSnapshot(): Priorities {
  return DEFAULT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PRIORITIES_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The visitor's priorities. The default order during server render and hydration. */
export function usePriorities(): Priorities {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The visitor ranked the categories (a partial ranking is completed with the default order). */
export function savePriorities(ranked: readonly RatingCategory[]): RatingCategory[] {
  const order = completeOrder(ranked);
  writeRaw(JSON.stringify({ order, chosen: true }));
  return order;
}

/** The visitor skipped the setup: the default order, remembered so the question isn't asked again. */
export function skipPriorities(): void {
  writeRaw(JSON.stringify({ order: RATING_CATEGORIES, chosen: false }));
}

export function clearPriorities(): void {
  writeRaw(null);
}

/** The ranked categories first (duplicates and unknowns dropped), then the rest in the default order. */
export function completeOrder(ranked: readonly RatingCategory[]): RatingCategory[] {
  const seen = new Set<RatingCategory>();
  const order: RatingCategory[] = [];
  for (const category of [...ranked, ...RATING_CATEGORIES]) {
    if (!RATING_CATEGORIES.includes(category) || seen.has(category)) continue;
    seen.add(category);
    order.push(category);
  }
  return order;
}

/** "cruise,takeoff_landing,aircraft,space" — the order as an analytics property. */
export function orderKey(order: readonly RatingCategory[]): string {
  return order.join(",");
}
