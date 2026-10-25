import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { BENCHMARKS, compareToBenchmark, type BenchmarkKey, type Comparison } from "@preflight/shared/benchmarks";
import { cn } from "@/lib/cn";

/*
 * Version C: one calm line that puts a figure next to its industry benchmark,
 * so "89% on time" or "12.3 years" means something — "11 points above the US
 * industry average (78%)". Better for the passenger reads calm, worse reads
 * sand (gentle, never red), about average stays quiet; the arrow carries the
 * direction so colour is never the only cue. Used on the flight page's fare
 * card and the compare page's rows.
 */

const VERDICT_UI: Record<Comparison["verdict"], { className: string; Icon: typeof ArrowUp }> = {
  better: { className: "text-calm-700", Icon: ArrowUp },
  worse: { className: "text-sand-700", Icon: ArrowDown },
  "about average": { className: "text-ink-500", Icon: Minus },
};

/** "78%", "13 years", "31 in", "82 dB", "7.6/10", "83/100". */
export function benchmarkValue(key: BenchmarkKey): string {
  const b = BENCHMARKS[key];
  return b.unit === "years" ? `${b.value} years` : b.unit === "in" || b.unit === "dB" ? `${b.value} ${b.unit}` : `${b.value}${b.unit}`;
}

/**
 * The comparison in words, with the benchmark's figure in brackets: "11 points above the
 * US industry average (78%)". `approx` softens a difference to "about 4 dB quieter…" where the
 * figure itself is a band rather than a reading (cabin noise — docs/FEASIBILITY.md).
 */
export function benchmarkText(key: BenchmarkKey, value: number, approx = false): { comparison: Comparison; text: string } {
  const comparison = compareToBenchmark(key, value);
  const lead = approx && comparison.verdict !== "about average" ? "about " : "";
  // Scores out of 10 or 100 come back as a bare number ("9 above …"): say "point(s)", as the on-time line does.
  const worded = /^\/\d+$/.test(BENCHMARKS[key].unit)
    ? comparison.text.replace(/^([\d.]+) (above|below)/, (_, n: string, dir: string) => `${n} ${Number(n) === 1 ? "point" : "points"} ${dir}`)
    : comparison.text;
  const sentence = `${lead}${worded}`;
  return { comparison, text: `${sentence[0]!.toUpperCase()}${sentence.slice(1)} (${benchmarkValue(key)})` };
}

interface BenchmarkLineProps {
  benchmark: BenchmarkKey;
  value: number;
  /** See benchmarkText. */
  approx?: boolean;
  className?: string;
}

export function BenchmarkLine({ benchmark, value, approx, className }: BenchmarkLineProps) {
  const { comparison, text } = benchmarkText(benchmark, value, approx);
  const ui = VERDICT_UI[comparison.verdict];
  return (
    <span className={cn("flex items-start gap-1 text-xs leading-snug", ui.className, className)}>
      <ui.Icon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
    </span>
  );
}
