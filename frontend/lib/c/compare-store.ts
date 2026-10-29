"use client";

import { useSyncExternalStore } from "react";
import { useTool } from "@/components/c/shell/ToolContext";
import { MAX_COMPARE, itemId, parseItemId, type CompareItem } from "./model";

/*
 * A tool's compare list: up to MAX_COMPARE flights, kept in localStorage
 * (falls back to memory when storage is blocked) and shared by every page and
 * tab of that tool. Versions C and D keep separate lists (their keys are in
 * frontend/lib/tool.ts). Read it with useCompareList(); never during server render.
 */

const EMPTY: readonly CompareItem[] = Object.freeze([]);

/** One store per storage key, created on first use. */
interface Store {
  key: string;
  listeners: Set<() => void>;
  memory: string | null;
  snapshot: { raw: string | null; items: readonly CompareItem[] };
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly CompareItem[];
  save(items: readonly CompareItem[]): void;
}

const stores = new Map<string, Store>();

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

function storeFor(key: string): Store {
  const existing = stores.get(key);
  if (existing) return existing;
  const store: Store = {
    key,
    listeners: new Set(),
    memory: null,
    snapshot: { raw: null, items: EMPTY },
    subscribe(listener) {
      store.listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        store.listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    // The same array while nothing changed (useSyncExternalStore needs a stable snapshot).
    getSnapshot() {
      let raw: string | null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        raw = store.memory;
      }
      if (raw !== store.snapshot.raw) store.snapshot = { raw, items: parse(raw) };
      return store.snapshot.items;
    },
    save(items) {
      const raw = JSON.stringify(items.slice(0, MAX_COMPARE).map(itemId));
      store.memory = raw;
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Storage blocked (private mode, quota): the in-memory copy still works for this tab.
      }
      for (const listener of store.listeners) listener();
    },
  };
  stores.set(key, store);
  return store;
}

function getServerSnapshot(): readonly CompareItem[] {
  return EMPTY;
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
  /** Drops flights whose date is before `today` ("YYYY-MM-DD"). Call from an effect or handler, never in render. */
  prune(today: string): void;
}

/** The visitor's compare list for the current tool. Empty during server render and hydration. */
export function useCompareList(): CompareList {
  const { compareKey } = useTool();
  const store = storeFor(compareKey);
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const getSnapshot = store.getSnapshot;
  const save = store.save;
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
    prune: (today) => {
      const current = getSnapshot();
      const kept = current.filter((i) => i.date >= today);
      if (kept.length !== current.length) save(kept);
    },
  };
}
