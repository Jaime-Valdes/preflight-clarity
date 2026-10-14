/*
 * Seeded pseudo-random numbers for the fake-flight generator.
 *
 * Everything the dashboard shows must be a pure function of the participant's
 * input, so nothing here touches Math.random or the clock. A seed string is
 * hashed with cyrb128 into four 32-bit words that start an sfc32 stream.
 * `fork(label)` derives an independent stream from the same seed, so each
 * facet of a flight (crew, weather, seats…) stays stable even when another
 * facet starts drawing more or fewer numbers.
 */

export interface Rng {
  /** The seed string this stream was created from. */
  readonly seed: string;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [a, b). */
  float(a: number, b: number): number;
  /** Uniform integer in [a, b] (both inclusive). */
  int(a: number, b: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** One element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** One value from [value, weight] pairs; weights need not sum to 1. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[];
  /** An independent stream derived from this seed and a label. */
  fork(label: string): Rng;
}

/** cyrb128: 128-bit string hash → four unsigned 32-bit words. */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Short stable hex id for a string (8 characters). */
export function hashId(str: string): string {
  const [a, b] = hashString(str);
  return ((a ^ Math.imul(b, 0x9e3779b1)) >>> 0).toString(16).padStart(8, "0");
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const [a, b, c, d] = hashString(seed);
  const nextRaw = sfc32(a, b, c, d);
  // Warm up so nearby seeds diverge quickly.
  for (let i = 0; i < 16; i++) nextRaw();

  const rng: Rng = {
    seed,
    next: () => nextRaw(),
    float: (lo, hi) => lo + nextRaw() * (hi - lo),
    int: (lo, hi) => {
      const min = Math.ceil(Math.min(lo, hi));
      const max = Math.floor(Math.max(lo, hi));
      return min + Math.floor(nextRaw() * (max - min + 1));
    },
    chance: (p) => nextRaw() < p,
    pick: (arr) => {
      if (arr.length === 0) throw new Error("pick: empty array");
      return arr[Math.floor(nextRaw() * arr.length)];
    },
    weighted: (entries) => {
      if (entries.length === 0) throw new Error("weighted: no entries");
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return entries[0][0];
      let r = nextRaw() * total;
      for (const [value, w] of entries) {
        r -= Math.max(0, w);
        if (r < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextRaw() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (label) => createRng(`${seed}#${label}`),
  };
  return rng;
}

/** Rounds to one decimal without floating-point noise. */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
