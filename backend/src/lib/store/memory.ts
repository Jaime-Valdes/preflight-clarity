/*
 * In-memory route-day store: the durable layer's shape with nothing durable behind it. The cache
 * tests use it (no files, no Supabase). The API never does: without storage the memory cache in
 * lib/flights/cache.ts works on its own.
 */
import { routeDayKey, type RouteDayRecord, type RouteDayStore } from "../flights/types";

export interface MemoryRouteDayStore extends RouteDayStore {
  /** Records held. */
  readonly size: number;
  clear(): void;
}

export function createMemoryRouteDayStore(): MemoryRouteDayStore {
  const records = new Map<string, RouteDayRecord>();
  return {
    get size() {
      return records.size;
    },
    clear() {
      records.clear();
    },
    async getRouteDay(route, date, provider) {
      return records.get(routeDayKey(route, date, provider)) ?? null;
    },
    async putRouteDay(record) {
      records.set(routeDayKey(record.route, record.date, record.provider), record);
    },
  };
}
