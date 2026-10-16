"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { daysBetween, formatDuration, formatOffset, formatShortDate, formatTime12 } from "@preflight/shared/dates";
import { getForecastStatus, previewDaysUntil } from "@preflight/shared/forecast";
import type { Flight } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Ring } from "../trust/Ring";
import { cn } from "@/lib/cn";
import { INTENSITY } from "@/lib/theme";
import { BODY_LABEL, dayMarker, scoreLabel } from "../control/compare";
import { CompareChart, SERIES_COLOR } from "./CompareChart";
import { previewForecastLabel } from "../turbulence/format";
import { bumpyStretches, exploreLabel, routeLabel, type ExploredEntry } from "./model";
import { Sheet } from "./Sheet";

interface CompareViewProps {
  entries: readonly ExploredEntry[];
  /** The two flight ids being compared (A = calm, B = breeze). */
  pair: readonly [string, string];
  onPairChange: (a: string, b: string) => void;
  preferredId: string | null;
  onPrefer: (id: string | null) => void;
  today: string;
  onClose: () => void;
}

type Side = "a" | "b";

function safeShort(iso: string): string {
  try {
    return formatShortDate(iso);
  } catch {
    return iso;
  }
}

function daysAway(today: string, iso: string): string {
  const d = daysBetween(today, iso);
  return d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
}

/**
 * Full-screen side-by-side view of two explored flights: smoothness, the two
 * turbulence timelines overlaid, and the facts that differ. "I'd prefer this
 * one" is recorded only — it never changes anything.
 */
export function CompareView({ entries, pair, onPairChange, preferredId, onPrefer, today, onClose }: CompareViewProps) {
  const pickersRef = useRef<HTMLDivElement>(null);
  // Set by a tap on "I'd prefer this one" only, so changing the pair never re-announces it.
  const [noted, setNoted] = useState(false);

  // Each picker row scrolls sideways: keep its selected chip in view (the default
  // second flight is the most recent one, i.e. the last chip).
  useEffect(() => {
    for (const row of pickersRef.current?.querySelectorAll<HTMLElement>("[data-picker-row]") ?? []) {
      const chip = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!chip) continue;
      const r = row.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      const visibleRight = r.right - 40; // the row's right padding and fade
      if (c.right > visibleRight) row.scrollLeft += c.right - visibleRight;
      else if (c.left < r.left) row.scrollLeft -= r.left - c.left;
    }
  }, [pair]);

  const index = new Map(entries.map((e, i) => [e.meta.id, i]));
  const ia = index.get(pair[0]) ?? 0;
  const ib = index.get(pair[1]) ?? Math.min(1, entries.length - 1);
  const a = entries[ia];
  const b = entries[ib];
  if (!a || !b) return null;
  const sides: Record<Side, { entry: ExploredEntry; label: string }> = {
    a: { entry: a, label: exploreLabel(ia) },
    b: { entry: b, label: exploreLabel(ib) },
  };

  function choose(side: Side, id: string) {
    if (side === "a" && id !== pair[0] && id !== pair[1]) onPairChange(id, pair[1]);
    if (side === "b" && id !== pair[1] && id !== pair[0]) onPairChange(pair[0], id);
    setNoted(false);
  }

  function prefer(id: string | null) {
    onPrefer(id);
    setNoted(id !== null);
  }

  const fa = a.flight;
  const fb = b.flight;
  // The study's briefing (and so this view) is the preview: the day before each flight, or the day itself
  // for a flight today (previewDaysUntil, as the dashboard) — its forecast tier, not the real distance's.
  const ha = previewDaysUntil(daysBetween(today, fa.input.date));
  const hb = previewDaysUntil(daysBetween(today, fb.input.date));
  const sameHorizon = previewForecastLabel(ha) === previewForecastLabel(hb);
  const conf = (f: Flight, h: number): ReactNode => {
    const label = getForecastStatus(h, f.turbulence.history).confidenceLabel;
    if (sameHorizon) return label;
    return (
      <>
        {label}
        <span className="block text-ink-500">{previewForecastLabel(h)}</span>
      </>
    );
  };

  return (
    <Sheet
      kind="full"
      title="Compare flights"
      description="Two of the flights you’ve looked at, side by side. All data is illustrative."
      onClose={onClose}
      footer={
        <Button block onClick={onClose}>
          Back to the dashboard
        </Button>
      }
    >
      {/* Which two flights */}
      <div ref={pickersRef} className="mt-2 space-y-2">
        {(["a", "b"] as const).map((side) => (
          <div key={side} role="group" aria-label={side === "a" ? "First flight" : "Second flight"} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLOR[side] }} />
            <div data-picker-row className="-my-1 -mr-5 flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto py-1 pr-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-16px),transparent)]">
              {entries.map((e, i) => {
                const selected = e.meta.id === pair[side === "a" ? 0 : 1];
                const taken = e.meta.id === pair[side === "a" ? 1 : 0];
                return (
                  <button
                    key={e.meta.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={taken}
                    onClick={() => choose(side, e.meta.id)}
                    className={cn(
                      "relative h-9 shrink-0 snap-start whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-inset transition-colors",
                      "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
                      selected
                        ? "bg-night-900 text-white ring-night-900"
                        : taken
                          ? "cursor-not-allowed text-ink-300 ring-line"
                          : "bg-surface text-ink-700 ring-line-strong hover:bg-canvas",
                    )}
                  >
                    {exploreLabel(i)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Headline tiles */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {(["a", "b"] as const).map((side) => {
          const { entry, label } = sides[side];
          const f = entry.flight;
          const preferred = preferredId === entry.meta.id;
          return (
            <div key={side} className="flex min-w-0 flex-col rounded-3xl bg-surface p-3.5 shadow-soft ring-1 ring-line/80">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
                <span aria-hidden className="size-2 rounded-full" style={{ background: SERIES_COLOR[side] }} />
                {label}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-ink-900">{routeLabel(f)}</p>
              <p className="text-xs text-ink-500 tabular-nums">{safeShort(f.input.date)}</p>
              <p className="truncate text-xs text-ink-500 tabular-nums">
                {formatTime12(f.departTime)} · {f.flightNumber}
              </p>
              <div className="mt-3 flex justify-center">
                <Ring value={f.smoothness.score} size={84} stroke={8} label={`Smoothness score ${f.smoothness.score} out of 100`}>
                  <span className="text-[22px] font-bold leading-none text-ink-900 tabular-nums">{f.smoothness.score}</span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-400">of 100</span>
                </Ring>
              </div>
              <p className="mt-2 text-center text-xs font-semibold text-ink-700">{scoreLabel(f.smoothness.score)}</p>
              <button
                type="button"
                aria-pressed={preferred}
                aria-label={`I’d prefer this one: ${label}, ${f.origin.code} to ${f.destination.code}, ${safeShort(f.input.date)}, ${formatTime12(f.departTime)}`}
                onClick={() => prefer(preferred ? null : entry.meta.id)}
                className={cn(
                  "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-full px-2 py-2 text-[13px] font-semibold leading-tight text-balance ring-1 ring-inset transition-colors",
                  preferred ? "bg-calm-50 text-calm-700 ring-calm-200" : "bg-surface text-ink-900 ring-line-strong hover:bg-canvas",
                )}
              >
                {preferred ? <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} /> : null}
                I&rsquo;d prefer this one
              </button>
            </div>
          );
        })}
      </div>
      <p role="status" className="mt-2.5 min-h-[18px] text-center text-xs text-ink-500">
        {noted ? "Noted — nothing is booked." : null}
      </p>

      {/* Overlaid timelines */}
      <section aria-label="Turbulence timelines" className="mt-2 rounded-3xl bg-surface px-4 pb-3 pt-4 shadow-soft ring-1 ring-line/80">
        <h3 className="text-sm font-bold text-ink-900">Expected motion, minute by minute</h3>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          {(["a", "b"] as const).map((side) => (
            <span key={side} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("h-0.5 w-4", side === "a" ? "rounded-full" : "border-t-2 border-dashed bg-transparent")}
                style={side === "a" ? { background: SERIES_COLOR.a } : { borderColor: SERIES_COLOR.b }}
              />
              {sides[side].label}
            </span>
          ))}
        </div>
        <div className="mt-2">
          <CompareChart
            a={{ label: sides.a.label, points: fa.turbulence.points, phases: fa.turbulence.phases, airborneMin: fa.airborneMin }}
            b={{ label: sides.b.label, points: fb.turbulence.points, phases: fb.turbulence.phases, airborneMin: fb.airborneMin }}
          />
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink-500">Minutes after takeoff. Each line ends when that flight lands.</p>
      </section>

      {/* Side-by-side facts */}
      <dl className="mt-3 rounded-3xl bg-surface px-4 py-1 shadow-soft ring-1 ring-line/80">
        <Fact names={[sides.a.label, sides.b.label]} label="Bumpy stretches" a={bumpy(fa)} b={bumpy(fb)} />
        <Fact
          names={[sides.a.label, sides.b.label]}
          label="Strongest motion"
          a={INTENSITY[fa.turbulence.maxIntensity].label}
          b={INTENSITY[fb.turbulence.maxIntensity].label}
        />
        <Fact
          names={[sides.a.label, sides.b.label]}
          label="Aircraft"
          a={
            <>
              {fa.aircraft.fullName}
              <span className="block text-ink-500">{BODY_LABEL[fa.aircraft.bodyType]}</span>
            </>
          }
          b={
            <>
              {fb.aircraft.fullName}
              <span className="block text-ink-500">{BODY_LABEL[fb.aircraft.bodyType]}</span>
            </>
          }
        />
        <Fact
          names={[sides.a.label, sides.b.label]}
          label="Airline on time"
          a={
            <>
              {fa.airlineStats.onTimePct}%<span className="block text-ink-500">{fa.airline.name}</span>
            </>
          }
          b={
            <>
              {fb.airlineStats.onTimePct}%<span className="block text-ink-500">{fb.airline.name}</span>
            </>
          }
        />
        <Fact names={[sides.a.label, sides.b.label]} label="Departs" a={departs(fa)} b={departs(fb)} />
        <Fact names={[sides.a.label, sides.b.label]} label="Arrives" a={arrives(fa)} b={arrives(fb)} />
        <Fact names={[sides.a.label, sides.b.label]} label="Gate to gate" a={formatDuration(fa.blockMin)} b={formatDuration(fb.blockMin)} />
        <Fact names={[sides.a.label, sides.b.label]} label="Days away" a={daysAway(today, fa.input.date)} b={daysAway(today, fb.input.date)} />
        <Fact
          names={[sides.a.label, sides.b.label]}
          label={sameHorizon ? previewForecastLabel(ha) : "Forecast confidence"}
          a={conf(fa, ha)}
          b={conf(fb, hb)}
          last
        />
      </dl>
    </Sheet>
  );
}

/** "25 min" over "1 stretch" — the windows the turbulence section lists. */
function bumpy(f: Flight): ReactNode {
  const { count, minutes } = bumpyStretches(f);
  if (count === 0) return "None expected";
  return (
    <>
      {formatOffset(minutes)}
      <span className="block text-ink-500">
        {count} stretch{count === 1 ? "" : "es"}
      </span>
    </>
  );
}

/** Time over the airport code (like Aircraft and Airline), so the code never dangles after a wrap. */
function departs(f: Flight): ReactNode {
  return (
    <>
      {formatTime12(f.departTime)}
      <span className="block text-ink-500">{f.origin.code}</span>
    </>
  );
}

function arrives(f: Flight): ReactNode {
  const m = dayMarker(f.arriveDayOffset);
  return (
    <>
      {formatTime12(f.arriveTime)}
      {m ? ` (${m} day)` : ""}
      <span className="block text-ink-500">{f.destination.code}</span>
    </>
  );
}

function Fact({
  names,
  label,
  a,
  b,
  last = false,
}: {
  names: readonly [string, string];
  label: string;
  a: ReactNode;
  b: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn("py-3", !last && "border-b border-line/70")}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 grid grid-cols-2 gap-3 text-[13px] font-semibold leading-snug text-ink-900 tabular-nums">
        <span className="flex min-w-0 gap-1.5 [overflow-wrap:anywhere]">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: SERIES_COLOR.a }} />
          <span className="min-w-0">
            <span className="sr-only">{names[0]}: </span>
            {a}
          </span>
        </span>
        <span className="flex min-w-0 gap-1.5 [overflow-wrap:anywhere]">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: SERIES_COLOR.b }} />
          <span className="min-w-0">
            <span className="sr-only">{names[1]}: </span>
            {b}
          </span>
        </span>
      </dd>
    </div>
  );
}
