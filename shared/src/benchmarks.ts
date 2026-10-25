/*
 * Industry benchmarks the dashboard and version C compare a flight against, so a
 * number such as "fleet average age 11.6 years" means something. Approximate,
 * published figures (all obtainable — docs/FEASIBILITY.md), rounded; the source
 * each comes from is in the comment so the team can refresh them.
 */

export interface Benchmark {
  /** The industry-wide figure. */
  value: number;
  /** Unit for copy: "%", "years", "in", "dB", "/10", "/100". */
  unit: string;
  /** Short label, e.g. "industry average". */
  label: string;
  /** Whether a higher value is better for the passenger (null: neither). */
  higherIsBetter: boolean | null;
  /** Where the figure comes from (for the team, never shown as a live source). */
  source: string;
}

export const BENCHMARKS = {
  /** Share of US flights arriving within 15 minutes of schedule, 2024 (DOT Air Travel Consumer Report). */
  onTimePct: { value: 78, unit: "%", label: "US industry average", higherIsBetter: true, source: "DOT Air Travel Consumer Report, 2024 full year" },
  /** Average age of the global commercial jet fleet (Cirium / IATA fleet analyses, 2024). */
  fleetAgeYears: { value: 13, unit: "years", label: "global fleet average", higherIsBetter: false, source: "Cirium fleet data, 2024" },
  /** Typical economy seat pitch on US network carriers (airline seat maps, SeatGuru). */
  seatPitchIn: { value: 31, unit: "in", label: "typical economy", higherIsBetter: true, source: "Airline seat maps / SeatGuru, 2024" },
  /** Typical economy seat width. */
  seatWidthIn: { value: 17.5, unit: "in", label: "typical economy", higherIsBetter: true, source: "Airline seat maps / SeatGuru, 2024" },
  /** Typical cabin noise at cruise for a narrow-body jet (published cabin measurements). */
  cabinNoiseDb: { value: 82, unit: "dB", label: "typical jet cabin", higherIsBetter: false, source: "Published cabin-noise measurements of A320/737-family jets" },
  /** The prototype's own comfort index: the median across the airlines in the catalogue. */
  comfortScore: { value: 7.6, unit: "/10", label: "typical airline here", higherIsBetter: true, source: "Median of this prototype's airline comfort index" },
  /** The prototype's smoothness score: the mean across generated flights. */
  smoothnessScore: { value: 83, unit: "/100", label: "typical flight here", higherIsBetter: true, source: "Mean smoothness score across this prototype's generated flights" },
} as const satisfies Record<string, Benchmark>;

export type BenchmarkKey = keyof typeof BENCHMARKS;

export interface Comparison {
  /** value − benchmark, in the benchmark's unit (rounded to one decimal). */
  diff: number;
  /** "better" | "worse" | "about average" — for the passenger, given higherIsBetter. */
  verdict: "better" | "worse" | "about average";
  /** Calm copy, e.g. "2 years newer than the global fleet average" or "about the industry average". */
  text: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compares a flight's figure with a benchmark. `tolerance` is the band treated as
 * "about average" (defaults to 3% of the benchmark, at least 0.5 unit).
 */
export function compareToBenchmark(key: BenchmarkKey, value: number, tolerance?: number): Comparison {
  const b = BENCHMARKS[key];
  const diff = round1(value - b.value);
  const band = tolerance ?? Math.max(0.5, b.value * 0.03);
  const magnitude = Math.abs(diff);
  const unitWord = (n: number) => (b.unit === "years" ? `${n} ${n === 1 ? "year" : "years"}` : b.unit === "%" ? `${n} points` : b.unit === "in" ? `${n} in` : b.unit === "dB" ? `${n} dB` : `${n}`);
  if (magnitude <= band) return { diff, verdict: "about average", text: `about the ${b.label}` };
  const higher = diff > 0;
  const better = b.higherIsBetter === null ? null : higher === b.higherIsBetter;
  const direction =
    key === "fleetAgeYears" ? (higher ? "older" : "newer")
    : key === "cabinNoiseDb" ? (higher ? "louder" : "quieter")
    : higher ? "above" : "below";
  const text = key === "fleetAgeYears" || key === "cabinNoiseDb"
    ? `${unitWord(magnitude)} ${direction} than the ${b.label}`
    : `${unitWord(magnitude)} ${direction} the ${b.label}`;
  return { diff, verdict: better === null ? "about average" : better ? "better" : "worse", text };
}
