"use client";

import { useState, type ReactNode } from "react";
import { ceilToPrice, ceilToStep, floorToStep, formatFare, formatMinutes12, PRICE_STEP, WINDOW_STEP_MIN } from "@/lib/c/format";
import { cn } from "@/lib/cn";
import { airlineName, toggled, type Facets, type MinScore, type ResultsView } from "./view";

interface FiltersProps {
  /** Unique per page (the sidebar and the phone sheet can both exist). */
  idPrefix: string;
  facets: Facets;
  view: ResultsView;
  onChange: (view: ResultsView) => void;
  /** While the day has no smoothness scores yet: when they appear ("From Tue, Nov 24 · 2 days before departure"). */
  scoresNote?: string;
  /** Leave out "Minimum smoothness" altogether (version D never filters by score). Default: shown, as version C does. */
  hideScoreFilter?: boolean;
  className?: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const SELECT =
  "h-11 w-full min-w-0 appearance-none rounded-xl bg-surface pl-3 pr-8 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-breeze-500 tabular-nums";

/** `from`, the half-hour marks after it up to `to`, and `to` itself — the ends exact (a departure time), the marks between on the grid. */
function marksBetween(from: number, to: number): number[] {
  const out = [from];
  for (let m = ceilToStep(from); m <= to; m += WINDOW_STEP_MIN) if (m > from) out.push(m);
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

/**
 * Results filters: a departure window (earliest and latest, in half hours,
 * from the day's first to its last departure — both exact, so the default
 * reads as the day really is), a highest fare (today's fares, on a $10 grid
 * laid over the day's cheapest and dearest; it applies when the thumb is let
 * go, not on every step), airlines (each with its lowest fare today),
 * aircraft size (only when the day mixes wide- and narrow-bodies) and minimum
 * smoothness (once the day's turbulence forecast is out; before that a quiet
 * note says when — or not at all with `hideScoreFilter`, version D). Every
 * other change applies at once. A chosen airline the day doesn't have stays
 * listed, so it can be cleared.
 */
export function Filters({ idPrefix, facets, view, onChange, scoresNote, hideScoreFilter = false, className }: FiltersProps) {
  const { bounds } = facets;
  const airlines = [
    ...facets.airlines,
    ...view.airlines
      .filter((code) => !facets.airlines.some((a) => a.code === code))
      .map((code) => ({ code, name: airlineName(code, facets), count: 0, lowestFareUsd: 0 })),
  ];
  // "Wide-body only" changes nothing when the day has none, or nothing else.
  const sizeMatters = view.wide || (facets.wideCount > 0 && facets.wideCount < facets.total);

  // The window on screen: the chosen limits, or the day's own first and last departure. Each select
  // offers the half-hour marks between the day's edge and the other limit (the Latest list starts at
  // the first mark after the earliest departure, so its lowest choice still holds that flight). A limit
  // from a link that sits outside today's span is shown where it is, so it can be put back.
  const from = view.depFrom ?? bounds.depFirst;
  const to = view.depTo ?? bounds.depLast;
  const depFirst = Math.min(bounds.depFirst, from);
  const depLast = Math.max(bounds.depLast, to);
  // The slider's grid lies over the day's fares: its top step is the first $10 mark at or above the dearest
  // fare (the same as no cap), its bottom the first at or above the cheapest, so the lowest cap still shows
  // a flight. A cap from a link below that is shown where it is.
  const sliderMax = ceilToPrice(bounds.fareMax);
  const sliderMin = Math.min(ceilToPrice(bounds.fareMin), view.maxPrice ?? sliderMax);

  return (
    <div className={cn("flex flex-col divide-y divide-line/80", className)}>
      <Group legend="Departure window">
        {facets.total > 0 ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <TimeSelect
                id={`${idPrefix}-dep-from`}
                label="Earliest"
                value={from}
                options={marksBetween(depFirst, Math.max(depFirst, floorToStep(to)))}
                onChange={(m) => onChange({ ...view, depFrom: m <= bounds.depFirst ? null : m })}
              />
              <span aria-hidden className="pb-3 text-sm text-ink-400">
                –
              </span>
              <TimeSelect
                id={`${idPrefix}-dep-to`}
                label="Latest"
                value={to}
                options={marksBetween(Math.min(depLast, ceilToStep(from)), depLast)}
                onChange={(m) => onChange({ ...view, depTo: m >= bounds.depLast ? null : m })}
              />
            </div>
            <p className="mt-2 text-xs leading-snug text-ink-500 tabular-nums">
              Flights this day leave between {formatMinutes12(bounds.depFirst)} and {formatMinutes12(bounds.depLast)}.
            </p>
          </>
        ) : (
          <p className="text-xs leading-snug text-ink-500">No flights this day.</p>
        )}
      </Group>

      <Group legend="Highest fare">
        {facets.total > 0 && sliderMax > sliderMin ? (
          <PriceSlider
            id={`${idPrefix}-price`}
            min={sliderMin}
            max={sliderMax}
            cap={view.maxPrice}
            fares={bounds}
            onCommit={(n) => onChange({ ...view, maxPrice: n !== null && n >= bounds.fareMax ? null : n })}
          />
        ) : (
          <p className="text-xs leading-snug text-ink-500">
            {facets.total > 0 ? `Every flight this day is ${formatFare(bounds.fareMax)} or less.` : "No flights this day."}
          </p>
        )}
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

      {sizeMatters ? (
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
      ) : null}

      {hideScoreFilter ? null : (
        <Group legend="Minimum smoothness">
          {view.scores ? (
            <>
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
            </>
          ) : (
            <p className="rounded-xl bg-canvas px-3 py-2.5 text-xs leading-snug text-ink-500 ring-1 ring-inset ring-line">
              {scoresNote ?? "Available once the turbulence forecast for these flights is out."}
            </p>
          )}
        </Group>
      )}
    </div>
  );
}

interface PriceSliderProps {
  id: string;
  /** The slider's steps, on the $10 grid. */
  min: number;
  max: number;
  /** The cap in the view (null: none — the thumb sits at the top). */
  cap: number | null;
  /** The day's exact cheapest and dearest fare, for the labels. */
  fares: { fareMin: number; fareMax: number };
  onCommit: (cap: number | null) => void;
}

/**
 * The highest-fare slider. The thumb moves in local state while it is held
 * or stepped, and the view changes once it is let go (pointer up, key up,
 * blur) — not on every step, which would rewrite the URL and log a filter
 * change for each pixel of a drag. The label follows the thumb.
 */
function PriceSlider({ id, min, max, cap, fares, onCommit }: PriceSliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const position = draft ?? cap ?? max;
  // "Up to $467": the dearest fare itself when nothing is capped, never the grid mark above it.
  const shown = Math.min(position, fares.fareMax);
  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink-900 tabular-nums">
          Up to {formatFare(shown)}
        </label>
        <span className="text-xs text-ink-500 tabular-nums">
          {formatFare(fares.fareMin)} – {formatFare(fares.fareMax)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={PRICE_STEP}
        value={position}
        aria-valuetext={`Up to ${formatFare(shown)}`}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="mt-1 block h-11 w-full cursor-pointer accent-calm-600"
      />
      <p className="text-xs leading-snug text-ink-500">Today’s illustrative one-way fares.</p>
    </>
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

interface TimeSelectProps {
  id: string;
  label: string;
  /** Minutes after midnight. */
  value: number;
  options: readonly number[];
  onChange: (minutes: number) => void;
}

function TimeSelect({ id, label, value, options, onChange }: TimeSelectProps) {
  // The current value is always listed, even when the other limit has moved past it.
  const listed = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-500">
        {label}
      </label>
      <span className="relative block">
        <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={SELECT}>
          {listed.map((m) => (
            <option key={m} value={m}>
              {formatMinutes12(m)}
            </option>
          ))}
        </select>
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
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
