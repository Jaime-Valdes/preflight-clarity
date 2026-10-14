import type { SessionRecord } from "@preflight/shared/types";

/** What every storage adapter provides. `lib/db.ts` picks one from the environment. */
export interface ResponseStore {
  /** Insert or update by sessionId. A write with a lower seq than the stored one is ignored. Throws on error. */
  upsert(record: SessionRecord): Promise<void>;
  /** All records, newest first (by createdAt). Throws on error. */
  list(): Promise<SessionRecord[]>;
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
