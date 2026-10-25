"use client";

import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BENCHMARKS, compareToBenchmark } from "@preflight/shared/benchmarks";
import { formatShortDate } from "@preflight/shared/dates";
import { availabilityFor, getForecastStatus, TURBULENCE_FORECAST_DAYS } from "@preflight/shared/forecast";
import type { Flight, SectionContext, WeatherReport } from "@preflight/shared/types";
import { scoreFactors, type FactorEffect, type ScoreFactor } from "@/components/dashboard/summary/scoreFactors";
import { historyBasis, typicalBumpyPhaseLine, typicalSmoothLine } from "@/components/dashboard/turbulence/format";
import { cn } from "@/lib/cn";
import { marker } from "./availability";
import { ScoreBadge, SCORE_SURFACE, scoreTone } from "./ScoreBadge";
import { Sheet } from "./Sheet";

/*
 * Version C: "How the smoothness score works" — a sheet for one flight. The
 * method in a few lines, then this flight's own factors (the same list the
 * study's summary card shows: frontend/components/dashboard/summary/scoreFactors.ts)
 * with a calm up / down / neutral marker each, and the typical-flight
 * benchmark (shared/src/benchmarks.ts). Before the flight-specific forecast
 * exists (TURBULENCE_FORECAST_DAYS before departure) only what is knowable is
 * listed, with the date the rest comes out. Calm copy throughout: a lower
 * score is a fact, never a warning.
 *
 * Told as the illustrative model works (shared/src/fakeFlight.ts): the score
 * is 97 less the forecast's average level of movement and a penalty for each
 * expected bumpy stretch; aircraft size and time of day shape those; the
 * route's history is derived from the model's own scores and the weather only
 * words and places the stretches — so those two are shown as context, with a
 * neutral marker, whatever the dashboard's list says about them.
 */

interface ScoreSheetProps {
  flight: Flight;
  /** Whole days until departure (0 = today) — decides what is knowable. */
  daysUntil: number;
  onClose: () => void;
}

const EFFECT: Record<FactorEffect, { icon: typeof ArrowUp; classes: string; label: string }> = {
  up: { icon: ArrowUp, classes: "bg-calm-50 text-calm-700 ring-calm-100", label: "Keeps the score up" },
  down: { icon: ArrowDown, classes: "bg-sand-50 text-sand-700 ring-sand-100", label: "Takes a little off" },
  neutral: { icon: Minus, classes: "bg-canvas text-ink-500 ring-line", label: "No push either way" },
};

/** "9 points above a typical flight" / "about the same as a typical flight" (BENCHMARKS.smoothnessScore). */
function versusTypical(score: number): string {
  const { diff, verdict } = compareToBenchmark("smoothnessScore", score);
  if (verdict === "about average") return "about the same as a typical flight";
  const n = Math.abs(Math.round(diff));
  return `${n} ${n === 1 ? "point" : "points"} ${diff > 0 ? "above" : "below"} a typical flight`;
}

/** Factors knowable before the flight's own forecast is out: the route's history, the plane, the time of day, and how firm it all is. */
const EARLY_FACTORS: ReadonlyArray<ScoreFactor["id"]> = ["history", "aircraft", "time", "confidence"];

function weatherLine(report: WeatherReport, moment: "departure" | "arrival"): string {
  return `${report.label.toLowerCase()} at ${report.airportCode} for ${moment}`;
}

/** The route's history and the weather, as context: neither moves the number (see the header). */
function contextFactor(flight: Flight, id: "history" | "weather", title: string): ScoreFactor {
  if (id === "history") {
    const { history } = flight.turbulence;
    return {
      id,
      title,
      detail: `${typicalSmoothLine(history)}, ${historyBasis(history)}. Context for the number, not part of it: the score comes from this flight’s own forecast. ${typicalBumpyPhaseLine(history.typicalBumpyPhase)}`,
      effect: "neutral",
    };
  }
  const { origin, destination } = flight.weather;
  const ends = `${weatherLine(origin, "departure")}, ${weatherLine(destination, "arrival")}`;
  return {
    id,
    title,
    detail: `${ends[0].toUpperCase()}${ends.slice(1)}. The weather shapes where any light bumps low down are expected and how they are described; it doesn’t move the score on its own.`,
    effect: "neutral",
  };
}

function safeFactors(flight: Flight, ctx: SectionContext): ScoreFactor[] {
  try {
    return scoreFactors(flight, ctx).map((f) =>
      f.id === "history" || f.id === "weather" ? contextFactor(flight, f.id, f.title) : f,
    );
  } catch {
    return [];
  }
}

export function ScoreSheet({ flight, daysUntil, onClose }: ScoreSheetProps) {
  const { score, label } = flight.smoothness;
  const forecastOut = availabilityFor(daysUntil).turbulence;
  const ctx = useMemo<SectionContext>(
    () => ({ daysUntil, forecast: getForecastStatus(daysUntil, flight.turbulence.history), variant: "A", preview: false }),
    [daysUntil, flight.turbulence.history],
  );
  const factors = useMemo(() => {
    const all = safeFactors(flight, ctx);
    return forecastOut ? all : all.filter((f) => EARLY_FACTORS.includes(f.id));
  }, [flight, ctx, forecastOut]);
  const typical = BENCHMARKS.smoothnessScore;
  const versus = versusTypical(score);
  const tone = scoreTone(score);
  const from = marker("turbulence", flight.input.date);
  let date = flight.input.date;
  try {
    date = formatShortDate(flight.input.date);
  } catch {
    // Keep the ISO date.
  }

  return (
    <Sheet
      title="How the smoothness score works"
      description={`${flight.airline.name} ${flight.flightNumber} · ${flight.origin.code} → ${flight.destination.code} · ${date}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 pt-2 text-ink-700">
        {forecastOut ? (
          <div className={cn("rounded-2xl p-4 ring-1 ring-inset", SCORE_SURFACE[tone])}>
            <ScoreBadge score={score} label={label} size="lg" detail={flight.smoothness.summary} />
            <p className="mt-3 text-[13px] leading-snug text-ink-700">
              A typical flight here scores <span className="font-semibold tabular-nums">{typical.value}</span> — this one is{" "}
              <span className="tabular-nums">{versus}</span>.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-canvas p-4 ring-1 ring-inset ring-line">
            <p className="text-[15px] font-bold leading-snug text-ink-900">No score for this flight yet</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-700">
              The turbulence forecast for this flight comes out {from.from} ({from.lead}), with its score. A typical flight
              here scores <span className="font-semibold tabular-nums">{typical.value}</span> out of 100.
            </p>
          </div>
        )}

        <section aria-labelledby="c-score-method">
          <h3 id="c-score-method" className="text-[13px] font-bold text-ink-900">
            The method
          </h3>
          <p className="mt-1 text-sm leading-relaxed">
            The score is out of 100 — higher is smoother. A flight with no movement at all would score 97. The forecast’s
            average level of movement and each expected bumpy stretch take points off — more for moderate bumps and for
            longer stretches. Larger aircraft feel the same air less, and the time of day changes how many stretches are
            expected. The route’s history and the weather at both ends are shown for context; forecast confidence says how
            settled the number is, and doesn’t move it.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            A forecast for one specific flight exists from {TURBULENCE_FORECAST_DAYS} days before departure
            {forecastOut ? " — this flight’s is out." : `; before that, only the route’s history and the schedule are known.`}
          </p>
        </section>

        {factors.length > 0 ? (
          <section aria-labelledby="c-score-factors">
            <h3 id="c-score-factors" className="text-[13px] font-bold text-ink-900">
              {forecastOut ? "This flight’s factors" : "What is known so far"}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {factors.map((factor) => (
                <FactorRow key={factor.id} factor={factor} />
              ))}
            </ul>
            {!forecastOut ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                Its expected bumpy stretches — what the score is made of — and the weather at both ends join the list on{" "}
                {from.from}.
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="flex items-start gap-2 rounded-2xl bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-ink-500 ring-1 ring-inset ring-line">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-breeze-500" />
          <span>
            Typical flight here: {typical.value} out of 100 — the average across this prototype’s flights. Every score and
            forecast is illustrative.
          </span>
        </p>
      </div>
    </Sheet>
  );
}

function FactorRow({ factor }: { factor: ScoreFactor }) {
  const effect = EFFECT[factor.effect];
  const Icon = effect.icon;
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-surface p-3 ring-1 ring-inset ring-line/80">
      <span
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", effect.classes)}
      >
        <Icon aria-hidden className="size-3.5" />
        <span className="sr-only">{effect.label}: </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-ink-900">{factor.title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-700">{factor.detail}</span>
      </span>
    </li>
  );
}

// ── The badge as a button ───────────────────────────────────────────────────

interface ScoreBadgeButtonProps {
  flight: Flight;
  daysUntil: number;
  /** A quiet line under the label (e.g. "1 bumpy stretch · 5 min"). */
  detail?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Called when the sheet opens (e.g. to log it). */
  onOpen?: () => void;
  className?: string;
}

/**
 * The smoothness score as a button that opens the score sheet for its flight.
 * Same look as ScoreBadge (plus a small "how it works" hint), 44 px tall,
 * aria-haspopup="dialog". Back/forward closes the sheet.
 */
export function ScoreBadgeButton({ flight, daysUntil, detail, size = "md", onOpen, className }: ScoreBadgeButtonProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className={cn(
          "group/score -m-1.5 flex min-h-11 max-w-full items-center gap-2.5 rounded-2xl p-1.5 text-left transition-colors hover:bg-white/70",
          className,
        )}
      >
        <ScoreBadge score={flight.smoothness.score} label={flight.smoothness.label} detail={detail} size={size} className="min-w-0" />
        <span className="sr-only">, how the score works</span>
        <span
          aria-hidden
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink-500 ring-1 ring-inset ring-line/80 transition-colors group-hover/score:text-ink-900"
        >
          <Info className="size-3.5" />
        </span>
      </button>
      {open ? <ScoreSheet flight={flight} daysUntil={daysUntil} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
