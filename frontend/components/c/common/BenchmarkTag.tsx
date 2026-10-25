import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { BENCHMARKS, compareToBenchmark, type BenchmarkKey, type Comparison } from "@preflight/shared/benchmarks";
import { cn } from "@/lib/cn";

/*
 * Version C: a figure set against its industry benchmark (shared/src/benchmarks.ts),
 * so "86% on time" reads as "8 points above the US industry average". Calm
 * tones only: teal when the flight comes out better for the passenger, soft
 * sand when it comes out behind, neutral around the average — a fact, never
 * a warning. Pure apart from the icons.
 */

const TONE: Record<Comparison["verdict"], { classes: string; icon: typeof ArrowUp; spoken: string }> = {
  better: { classes: "bg-calm-50 text-calm-700", icon: ArrowUp, spoken: "better than typical" },
  worse: { classes: "bg-sand-50 text-sand-700", icon: ArrowDown, spoken: "behind typical" },
  "about average": { classes: "bg-canvas text-ink-500", icon: Minus, spoken: "about typical" },
};

/**
 * compareToBenchmark, with fleet age told in whole years against a band of a
 * year: the global figure is an average over every jet type flying, so "0.7
 * years newer" claims more precision than it has, and the label says what it
 * is set against (an A321neo fleet reads "newer" than the all-types average
 * by construction — the tag should say so).
 */
export function comparisonFor(key: BenchmarkKey, value: number, tolerance?: number): Comparison {
  if (key !== "fleetAgeYears") return compareToBenchmark(key, value, tolerance);
  const b = BENCHMARKS[key];
  const comparison = compareToBenchmark(key, value, tolerance ?? 1);
  const label = `${b.label} (all types, ${b.value} years)`;
  if (comparison.verdict === "about average") return { ...comparison, text: `about the ${label}` };
  const years = Math.max(1, Math.round(Math.abs(comparison.diff)));
  const amount = years === 1 ? "about a year" : `${years} years`;
  return { ...comparison, text: `${amount} ${comparison.diff > 0 ? "older" : "newer"} than the ${label}` };
}

/** The figure against its benchmark, for copy: "8 points above the US industry average". */
export function benchmarkText(key: BenchmarkKey, value: number): string {
  return comparisonFor(key, value).text;
}

/** "US industry average 78%" — the benchmark itself, for a footnote or a compare row. */
export function benchmarkLine(key: BenchmarkKey): string {
  const b = BENCHMARKS[key];
  const unit = b.unit === "%" ? "%" : b.unit === "/10" || b.unit === "/100" ? "" : ` ${b.unit}`;
  return `${b.label[0].toUpperCase()}${b.label.slice(1)} ${b.value}${unit}`;
}

interface BenchmarkTagProps {
  benchmark: BenchmarkKey;
  value: number;
  /** "about average" band, in the benchmark's unit (default: compareToBenchmark's; a year for fleet age). */
  tolerance?: number;
  className?: string;
}

/** A small tinted tag: "8 points above the US industry average". */
export function BenchmarkTag({ benchmark, value, tolerance, className }: BenchmarkTagProps) {
  const comparison = comparisonFor(benchmark, value, tolerance);
  const tone = TONE[comparison.verdict];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-snug",
        tone.classes,
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">{tone.spoken}: </span>
      <span className="tabular-nums [overflow-wrap:anywhere]">{comparison.text}</span>
    </span>
  );
}
