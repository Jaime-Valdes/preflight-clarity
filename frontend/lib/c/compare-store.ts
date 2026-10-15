"use client";

import { useSyncExternalStore } from "react";
import { MAX_COMPARE, itemId, parseItemId, type CompareItem } from "./model";

/*
 * Version C's compare list: up to MAX_COMPARE flights, kept in localStorage
 * (falls back to memory when storage is blocked) and shared by every /c page
 * and tab. Read it with useCompareList(); never during server render.
 */

const STORAGE_KEY = "pfc.c.compare.v1";
const EMPTY: readonly CompareItem[] = Object.freeze([]);

const listeners = new Set<() => void>();
let memory: string | null = null;
let snapshot: { raw: string | null; items: readonly CompareItem[] } = { raw: null, items: EMPTY };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string): void {
  memory = raw;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Storage blocked (private mode, quota): the in-memory copy still works for this tab.
  }
}

function parse(raw: string | null): readonly CompareItem[] {
  if (!raw) return EMPTY;
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return EMPTY;
    const items: CompareItem[] = [];
    for (const id of ids) {
      const item = typeof id === "string" ? parseItemId(id) : null;
      if (item && !items.some((i) => itemId(i) === itemId(item))) items.push(item);
    }
    return items.slice(0, MAX_COMPARE);
  } catch {
    return EMPTY;
  }
}

/** Current list; the same array while nothing changed (useSyncExternalStore needs a stable snapshot). */
function getSnapshot(): readonly CompareItem[] {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, items: parse(raw) };
  return snapshot.items;
}

function getServerSnapshot(): readonly CompareItem[] {
  return EMPTY;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function save(items: readonly CompareItem[]): void {
  writeRaw(JSON.stringify(items.slice(0, MAX_COMPARE).map(itemId)));
  emit();
}

export interface CompareList {
  items: readonly CompareItem[];
  /** True when MAX_COMPARE flights are picked. */
  isFull: boolean;
  has(id: string): boolean;
  /** Adds the flight; false when it is already there or the list is full. */
  add(item: CompareItem): boolean;
  remove(id: string): void;
  /** Adds or removes; false when adding failed because the list is full. */
  toggle(item: CompareItem): boolean;
  /** Replaces the whole list (e.g. with the flights from a shared compare link). */
  replace(items: readonly CompareItem[]): void;
  clear(): void;
}

/** The visitor's compare list. Empty during server render and hydration. */
export function useCompareList(): CompareList {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const has = (id: string) => items.some((i) => itemId(i) === id);
  const add = (item: CompareItem) => {
    const current = getSnapshot();
    if (current.length >= MAX_COMPARE || current.some((i) => itemId(i) === itemId(item))) return false;
    save([...current, item]);
    return true;
  };
  const remove = (id: string) => save(getSnapshot().filter((i) => itemId(i) !== id));
  return {
    items,
    isFull: items.length >= MAX_COMPARE,
    has,
    add,
    remove,
    toggle: (item) => {
      if (getSnapshot().some((i) => itemId(i) === itemId(item))) {
        remove(itemId(item));
        return true;
      }
      return add(item);
    },
    replace: (next) => save(next),
    clear: () => save([]),
  };
}
