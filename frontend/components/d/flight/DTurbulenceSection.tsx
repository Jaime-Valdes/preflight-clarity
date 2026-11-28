"use client";

import { Clock3, PlaneLanding, PlaneTakeoff, Waves } from "lucide-react";
import { createContext, useContext } from "react";
import { availabilityFor } from "@preflight/shared/forecast";
import {
  SMOOTH_DEFINITION,
  TAKEOFF_LANDING_DEFINITION,
  WHERE_LABELS,
  WINDOW_WORDS,
  routeHistorySource,
  shareText,
  type AirportHistoryFigures,
  type EndFigures,
  type RouteHistoryDay,
  type RouteHistoryFigures,
} from "@preflight/shared/routeHistory";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { TurbulenceSection, turbulenceTeaser } from "@/components/dashboard/TurbulenceSection";
import { ForecastMarker } from "@/components/dashboard/turbulence/ForecastMarker";
import { turbulenceForecastFrom } from "@/components/dashboard/turbulence/format";

/*
 * Version D's turbulence section under "More detail" (docs/REAL_DATA.md, "Status: route history
 * from MADIS"). Weeks out, version C's section shows the generator's "typical" figures; D shows the
 * route's measured history instead (the same figures as the cruise rating), and the two airports'
 * measured takeoffs and landings (the same figures as the takeoff & landing rating), or says plainly
 * that there are none. Within the forecast window it is version C's section. The flight page provides
 * the figures through the context, so the body stays one module-level component.
 */

export interface DRouteHistoryShown {
  /** The day's history (null: the day came without it). */
  day: RouteHistoryDay | null;
  /** This flight's route (null: too few flights were measured along it, or no history). */
  figures: RouteHistoryFigures | null;
  /** The origin's and the destination's takeoff and landing history (null: none measured, or no history). */
  origin: AirportHistoryFigures | null;
  destination: AirportHistoryFigures | null;
}

export const DRouteHistoryContext = createContext<DRouteHistoryShown>({ day: null, figures: null, origin: null, destination: null });

export function dTurbulenceTeaser(flight: Flight, ctx: SectionContext, shown: DRouteHistoryShown): string {
  if (availabilityFor(ctx.daysUntil).turbulence) return turbulenceTeaser(flight, ctx);
  const from = `Forecast from ${turbulenceForecastFrom(flight.input.date)}`;
  const h = shown.figures;
  return h ? `${from} · ${shareText(h.smoothPct)} of ${h.monthWords} flights along this route were smooth` : from;
}

export function DTurbulenceSection(props: SectionProps) {
  const shown = useContext(DRouteHistoryContext);
  if (availabilityFor(props.ctx.daysUntil).turbulence) return <TurbulenceSection {...props} />;
  const { day, figures, origin, destination } = shown;
  const ends = Boolean(origin?.departures || destination?.arrivals);
  return (
    <div className="flex flex-col gap-4">
      <ForecastMarker date={props.flight.input.date}>
        {figures && ends
          ? "Until then, here is what airliners measured along this route and at these airports at this time of year."
          : figures
            ? "Until then, here is what airliners measured on flights along this route at this time of year."
            : ends
              ? "Until then, here is what airliners measured at these airports at this time of year; there are too few readings along the route itself."
              : "Until then, there are too few airliner turbulence readings along this route to show a history."}
      </ForecastMarker>
      {figures && day ? <MeasuredTile h={figures} day={day} /> : null}
      {ends && day ? <EndsTile flight={props.flight} origin={origin} destination={destination} day={day} /> : null}
    </div>
  );
}

/** The first and last few minutes: the origin's departures and the destination's arrivals, as the takeoff & landing rating reads them. */
function EndsTile({ flight, origin, destination, day }: { flight: Flight; origin: AirportHistoryFigures | null; destination: AirportHistoryFigures | null; day: RouteHistoryDay }) {
  const monthWords = (origin?.departures ? origin : destination)?.monthWords ?? "";
  const period = (origin?.departures ? origin : destination)?.period ?? "";
  const row = (side: "dep" | "arr", code: string, e: EndFigures | null | undefined) => {
    const Icon = side === "dep" ? PlaneTakeoff : PlaneLanding;
    const best = e?.calmest ? e.windows.find((w) => w.window === e.calmest) : undefined;
    return (
      <li className="flex gap-3">
        <Icon aria-hidden className="mt-1 size-4 shrink-0 text-calm-600" />
        {e ? (
          <div className="min-w-0">
            <p className="text-sm leading-snug text-ink-700">
              <span className="text-[22px] font-bold leading-none tracking-tight text-calm-700 tabular-nums">{shareText(e.smoothPct)}</span>{" "}
              of {e.flights.toLocaleString("en-US")} {side === "dep" ? `departures from ${code} had a smooth climb` : `arrivals at ${code} had a smooth descent`}; {shareText(e.calmPct, true)} had no more than light bumps.
            </p>
            <p className="mt-1 text-[13px] leading-snug text-ink-500">
              {best
                ? `Smoothest ${WINDOW_WORDS[best.window]}: ${shareText(best.smoothPct, true)} of ${best.flights.toLocaleString("en-US")}.`
                : "No clear difference by time of day."}
            </p>
          </div>
        ) : (
          <p className="text-sm leading-snug text-ink-700">Too few {side === "dep" ? `departures measured at ${code}` : `arrivals measured at ${code}`} to show a figure.</p>
        )}
      </li>
    );
  };
  return (
    <div className="rounded-2xl bg-calm-50 p-4 ring-1 ring-inset ring-calm-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-calm-700/80">Measured at the airports · {monthWords}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {row("dep", flight.origin.code, origin?.departures)}
        {row("arr", flight.destination.code, destination?.arrivals)}
      </ul>
      <p className="mt-3 text-xs leading-snug text-ink-500">{TAKEOFF_LANDING_DEFINITION}</p>
      <p className="mt-1 text-xs leading-snug text-ink-500">
        {routeHistorySource(day)}
        {period ? ` · counted here: ${period}` : ""}
      </p>
    </div>
  );
}

function MeasuredTile({ h, day }: { h: RouteHistoryFigures; day: RouteHistoryDay }) {
  const calmest = h.calmest ? h.windows.find((w) => w.window === h.calmest) : undefined;
  return (
    <div className="rounded-2xl bg-calm-50 p-4 ring-1 ring-inset ring-calm-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-calm-700/80">Measured along this route · {h.monthWords}</p>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3">
        <span className="text-[34px] font-bold leading-none tracking-tight text-calm-700 tabular-nums">{shareText(h.smoothPct)}</span>
        <p className="text-sm leading-snug text-ink-700">
          of {h.flights.toLocaleString("en-US")} flights along this route had a smooth cruise; {shareText(h.calmPct, true)} had no more than light bumps.
        </p>
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-snug text-ink-700">
        {h.where ? (
          <li className="flex gap-1.5">
            <Waves aria-hidden className="mt-0.5 size-3.5 shrink-0 text-calm-600" />
            <span>
              {h.where === "spread"
                ? "When there were bumps, they came anywhere along the route — no one stretch stands out."
                : `When there were bumps, they came most often ${WHERE_LABELS[h.where].charAt(0).toLowerCase()}${WHERE_LABELS[h.where].slice(1)}.`}
            </span>
          </li>
        ) : null}
        <li className="flex gap-1.5">
          <Clock3 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-calm-600" />
          <span>
            {calmest
              ? `Flights ${WINDOW_WORDS[calmest.window]} were the smoothest: ${shareText(calmest.smoothPct, true)} of ${calmest.flights.toLocaleString("en-US")}.`
              : "No clear difference by time of day."}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-xs leading-snug text-ink-500">{SMOOTH_DEFINITION}</p>
      <p className="mt-1 text-xs leading-snug text-ink-500">
        {routeHistorySource(day)} · counted here: {h.period}
      </p>
    </div>
  );
}
