import type { SessionRecord, Signup } from "@preflight/shared/types";
import type { RouteDayStore } from "../flights/types";

/**
 * What every storage adapter provides. `lib/db.ts` picks one from the environment. The two
 * RouteDayStore methods are the durable layer of version D's route-day cache (lib/flights/cache.ts).
 */
export interface ResponseStore extends RouteDayStore {
  /** Insert or update by sessionId. A write with a lower seq than the stored one is ignored. Throws on error. */
  upsert(record: SessionRecord): Promise<void>;
  /** All records, newest first (by createdAt). Throws on error. */
  list(): Promise<SessionRecord[]>;
  /**
   * Insert or update a product-interest sign-up (docs/INTEREST.md). One row per
   * email per source: a repeat from the same source replaces the stored sign-up
   * but keeps its original createdAt. Throws on error, including an id that
   * already belongs to another email.
   */
  upsertSignup(signup: Signup): Promise<void>;
  /** All sign-ups, newest first (by createdAt). Throws on error. */
  listSignups(): Promise<Signup[]>;
}

/** Newest first by createdAt, then updatedAt; sessionId breaks remaining ties so the order is stable. */
export function sortNewestFirst(records: SessionRecord[]): SessionRecord[] {
  const time = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : 0;
  };
  return [...records].sort(
    (a, b) =>
      time(b.createdAt) - time(a.createdAt) ||
      time(b.updatedAt) - time(a.updatedAt) ||
      a.sessionId.localeCompare(b.sessionId),
  );
}
