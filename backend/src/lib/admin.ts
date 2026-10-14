import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Is `key` the team's admin key? Constant-time comparison; false whenever
 * ADMIN_KEY is unset or the provided key is empty.
 */
export function isAdminKey(key: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = createHash("sha256").update(key).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
