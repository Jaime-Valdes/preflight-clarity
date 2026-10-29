"use client";

import { useSyncExternalStore } from "react";
import { itemId, parseItemId, type CompareItem, type RouteDay } from "@/lib/c/model";

/*
 * Version D's "I'd pick this flight" (docs/ITERATION_2.md): one chosen flight
 * per route and day, kept per browser in localStorage (memory when storage is
 * blocked). Recorded only — nothing is booked and nothing is sent anywhere
 * except the analytics event the button logs. Read it with useChoice(day);
 * never during server render (it reports no pick there).
 */

export const CHOICE_KEY = "pfc.d.choice.v1";

/** Most route-days remembered; the oldest picks go first. */
const MAX_DAYS = 60;

/** "JFK.LAX.2026-11-26" → "JFK.LAX.2026-11-26.DL1423", in the order the picks were made. */
type Choices = Readonly<Record<string, string>>;

const EMPTY: Choices = Object.freeze({});
const listeners = new Set<() => void>();
let memory: string | null = null;
let snapshot: { raw: string | null; value: Choices } = { raw: null, value: EMPTY };

/** "JFK.LAX.2026-11-26" — the route and day a pick belongs to (a compare item's own airports and date). */
export function dayKey(day: RouteDay): string {
  return `${day.origin}.${day.destination}.${day.date}`;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CHOICE_KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(CHOICE_KEY);
    else window.localStorage.setItem(CHOICE_KEY, raw);
  } catch {
    // Storage blocked: the in-memory copy still works for this tab.
  }
  for (const listener of listeners) listener();
}

/** Only entries whose value is a compare item on the day the key names survive. */
function parse(raw: string | null): Choices {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
    const out: Record<string, string> = {};
    for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
      if (typeof id !== "string") continue;
      const item = parseItemId(id);
      if (item && dayKey(item) === key) out[key] = itemId(item);
    }
    return Object.keys(out).length ? out : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** The same object while nothing changed (useSyncExternalStore needs a stable snapshot). */
function getSnapshot(): Choices {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, value: parse(raw) };
  return snapshot.value;
}

function getServerSnapshot(): Choices {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHOICE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The id of the flight picked for that route and day ("JFK.LAX.2026-11-26.DL1423"), or null when
 * none is — and null during server render and hydration. A compare item passes as the day.
 */
export function useChoice(day: RouteDay): string | null {
  const choices = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return choices[dayKey(day)] ?? null;
}

/** Remember the flight as the pick for its route and day, replacing an earlier pick that day. */
export function chooseFlight(item: CompareItem): void {
  const next: Record<string, string> = { ...getSnapshot() };
  const key = dayKey(item);
  // Re-inserted at the end: the most recent pick is the last to be dropped.
  delete next[key];
  next[key] = itemId(item);
  const keys = Object.keys(next);
  while (keys.length > MAX_DAYS) delete next[keys.shift()!];
  writeRaw(JSON.stringify(next));
}

/** Withdraw the pick for that route and day (nothing to do when there is none). */
export function clearChoice(day: RouteDay): void {
  const current = getSnapshot();
  const key = dayKey(day);
  if (!(key in current)) return;
  const next: Record<string, string> = { ...current };
  delete next[key];
  writeRaw(Object.keys(next).length ? JSON.stringify(next) : null);
}
