"use client";

import type { ReactNode } from "react";
import { formatFare, TIME_BUCKET_LABELS, TIME_BUCKETS, type TimeBucket } from "@/lib/c/format";
import { cn } from "@/lib/cn";
import { toggled, type Facets, type MinScore, type ResultsView } from "./view";

interface FiltersProps {
  /** Unique per page (the sidebar and the phone sheet can both exist). */
  idPrefix: string;
  facets: Facets;
  view: ResultsView;
  onChange: (view: ResultsView) => void;
  className?: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Results filters: departure time (only buckets with flights), airlines (each
 * with its lowest fare), aircraft size and minimum smoothness. Every change
 * applies at once. A chosen option the day doesn't have stays listed, so it
 * can be cleared.
 */
export function Filters({ idPrefix, facets, view, onChange, className }: FiltersProps) {
  const timeCounts = new Map(facets.times.map((t) => [t.bucket, t.count]));
  const times = TIME_BUCKETS.filter((b) => timeCounts.has(b) || view.times.includes(b));
  const airlines = [
    ...facets.airlines,
    ...view.airlines
      .filter((code) => !facets.airlines.some((a) => a.code === code))
      .map((code) => ({ code, name: code, count: 0, lowestFareUsd: 0 })),
  ];

  return (
    <div className={cn("flex flex-col divide-y divide-line/80", className)}>
      <Group legend="Departure time">
        {times.map((bucket: TimeBucket) => {
          const count = timeCounts.get(bucket) ?? 0;
          return (
            <CheckRow
              key={bucket}
              id={`${idPrefix}-time-${bucket}`}
              checked={view.times.includes(bucket)}
              onChange={() => onChange({ ...view, times: toggled(view.times, bucket, TIME_BUCKETS) })}
              label={TIME_BUCKET_LABELS[bucket].label}
              sub={TIME_BUCKET_LABELS[bucket].range}
              aside={count ? String(count) : "None"}
              asideLabel={count ? plural(count, "flight") : "No flights this day"}
            />
          );
        })}
      </Group>

      <Group legend="Airlines">
        {airlines.map((airline) => (
          <CheckRow
            key={airline.code}
            id={`${idPrefix}-airline-${airline.code}`}
            checked={view.airlines.includes(airline.code)}
            onChange={() =>
              onChange({
                ...view,
                airlines: toggled(view.airlines, airline.code, [...view.airlines, airline.code].sort()),
              })
            }
            label={airline.name}
            sub={airline.count ? plural(airline.count, "flight") : "No flights this day"}
            aside={airline.count ? `from ${formatFare(airline.lowestFareUsd)}` : undefined}
          />
        ))}
      </Group>

      <Group legend="Aircraft size">
        <Segmented
          name={`${idPrefix}-size`}
          value={view.wide ? "wide" : "any"}
          onChange={(v) => onChange({ ...view, wide: v === "wide" })}
          options={[
            { value: "any", label: "Any size", count: facets.total },
            { value: "wide", label: "Wide-body only", count: facets.wideCount, disabled: facets.wideCount === 0 && !view.wide },
          ]}
        />
        {facets.wideCount === 0 ? (
          <p className="mt-2 text-xs text-ink-500">No wide-body jets fly this route on this day.</p>
        ) : null}
      </Group>

      <Group legend="Minimum smoothness">
        <Segmented
          name={`${idPrefix}-min`}
          value={String(view.min)}
          onChange={(v) => onChange({ ...view, min: Number(v) as MinScore })}
          options={[
            { value: "0", label: "Any", count: facets.total },
            { value: "75", label: "75+", count: facets.atLeast[75] },
            { value: "85", label: "85+", count: facets.atLeast[85] },
          ]}
        />
        <p className="mt-2 text-xs leading-snug text-ink-500">Smoothness score out of 100 — higher is smoother.</p>
      </Group>
    </div>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 py-4 first:pt-0 last:pb-0">
      <legend className="float-left mb-2 w-full text-[13px] font-bold text-ink-900">{legend}</legend>
      <div className="clear-left">{children}</div>
    </fieldset>
  );
}

interface CheckRowProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  sub?: string;
  aside?: string;
  /** Spoken instead of `aside` (e.g. "3 flights" for "3"). */
  asideLabel?: string;
}

function CheckRow({ id, checked, onChange, label, sub, aside, asideLabel }: CheckRowProps) {
  return (
    <label
      htmlFor={id}
      className="-mx-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-canvas"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-[18px] shrink-0 cursor-pointer rounded accent-calm-600"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-ink-900">{label}</span>
        {sub ? <span className="block text-xs leading-snug text-ink-500 tabular-nums">{sub}</span> : null}
      </span>
      {aside ? (
        <span className="shrink-0 text-xs text-ink-500 tabular-nums">
          {asideLabel ? (
            <>
              <span aria-hidden>{aside}</span>
              <span className="sr-only">{asideLabel}</span>
            </>
          ) : (
            aside
          )}
        </span>
      ) : null}
    </label>
  );
}

interface SegmentedOption {
  value: string;
  label: string;
  count: number;
  disabled?: boolean;
}

function Segmented({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
}) {
  return (
    <div className={cn("grid gap-1.5", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((option) => (
        <label key={option.value} className={cn("relative", option.disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex min-h-11 flex-col items-center justify-center rounded-xl px-1.5 py-1.5 text-center ring-1 ring-inset transition-colors",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-breeze-500",
              "peer-checked:bg-night-900 peer-checked:text-white peer-checked:ring-night-900",
              option.disabled
                ? "bg-canvas text-ink-400 ring-line"
                : "bg-surface text-ink-900 ring-line-strong hover:bg-canvas peer-checked:hover:bg-night-900",
            )}
          >
            <span className="text-[13px] font-semibold leading-tight">{option.label}</span>
            <span className="mt-0.5 text-[11px] leading-tight tabular-nums opacity-70">{plural(option.count, "flight")}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
