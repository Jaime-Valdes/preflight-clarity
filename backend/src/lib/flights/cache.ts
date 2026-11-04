/*
 * The route-day cache: a small LRU in memory (256 route-days, the 24-hour TTL) in front of the
 * durable layer (Supabase `route_days`; the file store in development; nothing without storage).
 * A fresh record answers at once. An expired one is refreshed from the provider and overwritten;
 * when the provider fails, a stale record still within AeroDataBox's 7-day cache rule stands in,
 * and past that nothing is served. Requests for the same route-day in flight share one fetch. A
 * storage failure is noted and the provider asked, never a failed request. A paid provider is asked
 * at most `budgetPerHour` times an hour per process (a stale day stands in past that, else the
 * request fails with reason "budget"): one visitor paging through dates cannot spend the month's
 * plan. The clock is injectable so the tests can move it.
 */
import type { RouteDaySchedule } from "@preflight/shared/schedule";
import {
  DEFAULT_ROUTE_DAYS_PER_HOUR,
  ProviderError,
  ROUTE_DAY_MAX_AGE_MS,
  ROUTE_DAY_TTL_MS,
  routeDayAgeMs,
  routeDayKey,
  routeKey,
  type ProviderName,
  type RouteDayQuery,
  type RouteDayRecord,
  type RouteDayStore,
  type ScheduleProvider,
} from "./types";

/** Route-days kept in memory per process. */
export const MEMORY_CAPACITY = 256;

export interface RouteDayResult {
  schedule: RouteDaySchedule;
  /** true when the day came from the cache (memory or the durable layer), false when the provider was asked now. */
  cached: boolean;
}

export interface RouteDayCacheOptions {
  /** The durable layer, looked up on every call (the environment picks it); null for memory alone. */
  store?: () => RouteDayStore | null;
  now?: () => number;
  capacity?: number;
  /** Where a stale answer or a storage failure is noted. */
  warn?: (message: string) => void;
  /** Provider calls allowed per rolling hour (the generator is never counted). Default DEFAULT_ROUTE_DAYS_PER_HOUR. */
  budgetPerHour?: () => number;
}

const HOUR_MS = 60 * 60 * 1000;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Still within its TTL. */
function isFresh(record: RouteDayRecord, nowMs: number): boolean {
  const expires = Date.parse(record.expiresAt);
  return Number.isFinite(expires) && expires > nowMs;
}

/** Older than the 7-day ceiling (or undated): never served, never kept. */
function isPastCeiling(record: RouteDayRecord, nowMs: number): boolean {
  return routeDayAgeMs(record, nowMs) > ROUTE_DAY_MAX_AGE_MS;
}

/** A fetched day as a record: its TTL counts from the provider's fetchedAt (the clock when that is unreadable). */
export function recordOf(route: string, date: string, provider: ProviderName, schedule: RouteDaySchedule, nowMs: number): RouteDayRecord {
  const parsed = Date.parse(schedule.fetchedAt);
  const fetched = Number.isFinite(parsed) ? parsed : nowMs;
  return {
    route,
    date,
    provider,
    fetchedAt: new Date(fetched).toISOString(),
    expiresAt: new Date(fetched + ROUTE_DAY_TTL_MS).toISOString(),
    payload: schedule,
  };
}

export class RouteDayCache {
  private readonly memory = new Map<string, RouteDayRecord>();
  private readonly pending = new Map<string, Promise<RouteDayResult>>();
  private readonly store: () => RouteDayStore | null;
  private readonly now: () => number;
  private readonly capacity: number;
  private readonly warn: (message: string) => void;
  private readonly budgetPerHour: () => number;
  /** When the provider was asked, within the last hour. */
  private calls: number[] = [];

  constructor(options: RouteDayCacheOptions = {}) {
    this.store = options.store ?? (() => null);
    this.now = options.now ?? Date.now;
    this.capacity = options.capacity ?? MEMORY_CAPACITY;
    this.warn = options.warn ?? ((message) => console.warn(message));
    this.budgetPerHour = options.budgetPerHour ?? (() => DEFAULT_ROUTE_DAYS_PER_HOUR);
  }

  /** Provider calls made in the last hour. */
  callsThisHour(nowMs: number = this.now()): number {
    this.calls = this.calls.filter((at) => nowMs - at < HOUR_MS);
    return this.calls.length;
  }

  /** Route-days in memory. */
  get size(): number {
    return this.memory.size;
  }

  /** Forgets everything in memory (the durable layer is untouched). */
  clear(): void {
    this.memory.clear();
  }

  /** The route-day from the freshest source that has it: memory, the durable layer, then the provider. */
  get(query: RouteDayQuery, provider: ScheduleProvider): Promise<RouteDayResult> {
    const key = routeDayKey(routeKey(query.from, query.to), query.date, provider.name);
    const running = this.pending.get(key);
    if (running) return running;
    const task = this.lookUp(key, query, provider).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async lookUp(key: string, query: RouteDayQuery, provider: ScheduleProvider): Promise<RouteDayResult> {
    const now = this.now();
    const route = routeKey(query.from, query.to);
    const inMemory = this.recall(key, now);
    if (inMemory && isFresh(inMemory, now)) return { schedule: inMemory.payload, cached: true };

    const store = this.store();
    let stored: RouteDayRecord | null = null;
    if (store) {
      try {
        stored = await store.getRouteDay(route, query.date, provider.name);
      } catch (err) {
        this.warn(`route-day cache: read failed, asking the provider (${describe(err)})`);
      }
      if (stored && isPastCeiling(stored, now)) stored = null;
      if (stored && isFresh(stored, now)) {
        this.remember(key, stored);
        return { schedule: stored.payload, cached: true };
      }
    }

    const stale = inMemory ?? stored;
    if (provider.name !== "generator" && this.callsThisHour(now) >= this.budgetPerHour()) {
      if (stale) {
        this.warn(`route-day cache: the hourly ${provider.name} budget is spent; ${route} ${query.date} served as fetched ${stale.fetchedAt}`);
        return { schedule: stale.payload, cached: true };
      }
      throw new ProviderError(`the hourly ${provider.name} budget (${this.budgetPerHour()} route-days) is spent`, undefined, "budget");
    }

    let schedule: RouteDaySchedule;
    try {
      if (provider.name !== "generator") this.calls.push(now);
      schedule = await provider.fetchDay(query.from, query.to, query.date);
    } catch (err) {
      // Stale but within the ceiling: better than nothing while the provider is away.
      if (!stale) throw err;
      this.warn(`route-day cache: ${provider.name} failed (${describe(err)}); ${route} ${query.date} served as fetched ${stale.fetchedAt}`);
      return { schedule: stale.payload, cached: true };
    }
    const record = recordOf(route, query.date, provider.name, schedule, now);
    this.remember(key, record);
    if (store) {
      try {
        await store.putRouteDay(record);
      } catch (err) {
        this.warn(`route-day cache: write failed (${describe(err)})`);
      }
    }
    return { schedule, cached: false };
  }

  /** The memory entry, moved to the most recently used position; nothing past the ceiling. */
  private recall(key: string, nowMs: number): RouteDayRecord | undefined {
    const record = this.memory.get(key);
    if (!record) return undefined;
    this.memory.delete(key);
    if (isPastCeiling(record, nowMs)) return undefined;
    this.memory.set(key, record);
    return record;
  }

  /** Keeps the record, dropping the least recently used ones when over capacity. */
  private remember(key: string, record: RouteDayRecord): void {
    this.memory.delete(key);
    this.memory.set(key, record);
    while (this.memory.size > this.capacity) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }
}
