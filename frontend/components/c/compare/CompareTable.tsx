"use client";

import { Armchair, CalendarClock, CloudSun, Gauge, Info, Plane, ShieldCheck, UserRound, Wind, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FocusEvent, type ReactNode } from "react";
import { addDays, formatDuration, formatOffset, formatTime12 } from "@preflight/shared/dates";
import { BENCHMARKS } from "@preflight/shared/benchmarks";
import type { WeatherReport } from "@preflight/shared/types";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { ScoreBadge, scoreTone } from "@/components/c/common/ScoreBadge";
import { ScoreSheet } from "@/components/c/common/ScoreSheet";
import { cabinNoiseBand } from "@/components/dashboard/trust/format";
import { formatFare } from "@/lib/c/format";
import { flightHref } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import { TONE_CLASSES, type Tone } from "@/lib/theme";
import { marker, type PendingItem } from "@/components/c/common/availability";
import { BenchmarkLine, benchmarkValue } from "../flight/BenchmarkLine";
import { LINK_BASE, LINK_TONE, daysAwayLabel, dayOffsetMark, dayOffsetWords, fareFor, routeText, shortDate } from "../flight/copy";
import {
  SERIES,
  STRONGEST_BUMPS,
  UNAVAILABLE_LABEL,
  crewLine,
  crewRules,
  flightTags,
  forecastBasis,
  isFlightColumn,
  leaders,
  openSeat,
  rangeText,
  routeTypical,
  smoothestZone,
  spoken,
  timelineSummary,
  unavailableNote,
  yearsText,
  type Column,
  type FlightColumn,
} from "./facts";
import { PendingTimelines } from "./PendingTimelines";
import { LineKey, TimelineChart, type TimelineSeries } from "./TimelineChart";

interface CompareTableProps {
  columns: readonly Column[];
  /** Series slot (colour + dash) per column id; see assignSlots. */
  slots: ReadonlyMap<string, number>;
  /** Short unique name per flight column, e.g. "DL 1423 · Nov 26". */
  names: ReadonlyMap<string, string>;
  onRemove: (id: string) => void;
}

/* Row labels stay put while the flight columns scroll sideways on phones (the cell must be opaque). */
const STICKY =
  "sticky left-0 z-10 px-2 text-left shadow-[inset_-1px_0_0_var(--color-line)] min-[400px]:px-2.5 sm:px-4";
const LABEL = `${STICKY} bg-surface align-top`;
const CELL = "px-2.5 align-top min-[400px]:px-3 sm:px-4";
const ROW_LINE = "border-t border-line/70";

/** The tinted tile behind a score, by the calm scale (scoreTone) — a column's focal point. */
const SCORE_TILE: Record<ReturnType<typeof scoreTone>, string> = {
  calm: "bg-calm-50 ring-calm-100 hover:bg-calm-100",
  breeze: "bg-breeze-50 ring-breeze-100 hover:bg-breeze-100",
  sand: "bg-sand-50 ring-sand-100 hover:bg-sand-100",
};

/**
 * When a control inside the sideways-scrolling table gets keyboard focus, bring all of it into view: the
 * browser leaves a partly visible one cut off at the edge, or under the sticky row labels (the scroller's
 * scroll-padding keeps it clear of them).
 */
function revealFocused(event: FocusEvent<HTMLDivElement>) {
  const target = event.target;
  if (target === event.currentTarget || !(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/**
 * Version C compare page: 2–3 flights side by side — a header per flight, then
 * grouped rows (smoothness, the overlaid turbulence timelines, schedule,
 * aircraft, airline, crew, weather, best seat). On phones two columns fit at
 * 390 px; a third scrolls sideways inside the table, never the page.
 */
export function CompareTable({ columns, slots, names, onRemove }: CompareTableProps) {
  const flights = useMemo(() => columns.filter(isFlightColumn), [columns]);
  const n = columns.length;
  // Flight-specific turbulence exists only close to departure (docs/FEASIBILITY.md): scores, stretches and
  // timelines are compared among the flights that have a forecast; the others show when theirs starts.
  const forecasted = useMemo(() => flights.filter((c) => c.avail.turbulence), [flights]);
  const pendingTurbulence = useMemo(() => flights.filter((c) => !c.avail.turbulence), [flights]);
  const anyForecast = forecasted.length > 0;
  const anyWeather = flights.some((c) => c.avail.weather);
  // Fares as shown: the base fare moved by each flight's own lead time (they can be on different dates).
  const cheapest = leaders(flights, (c) => fareFor(c.option, c.daysUntil), "min");
  const smoothest = leaders(forecasted, (c) => c.flight.smoothness.score, "max");
  const fastest = leaders(flights, (c) => c.flight.blockMin, "min");
  const tags = useMemo(() => flightTags(flights, names), [flights, names]);
  // The flight whose "How the smoothness score works" sheet is open (its column id), if any.
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const sheetColumn = sheetFor ? (forecasted.find((c) => c.id === sheetFor) ?? null) : null;

  const series = useMemo<TimelineSeries[]>(
    () =>
      forecasted.map((c) => ({
        id: c.id,
        name: names.get(c.id) ?? c.flight.flightNumber,
        detail: `${formatTime12(c.flight.departTime)} · ${c.flight.airline.name}`,
        style: SERIES[slots.get(c.id) ?? 0]!,
        points: c.flight.turbulence.points,
        airborneMin: c.flight.airborneMin,
        summary: timelineSummary(c.flight, c.forecast.mode),
      })),
    [forecasted, names, slots],
  );

  /** For screen readers: "DL 843, Nov 26, JFK to LAX". */
  const nameOf = (c: Column) =>
    spoken(isFlightColumn(c) ? (names.get(c.id) ?? c.flight.flightNumber) : `${c.item.key} · ${shortDate(c.item.date)}`);
  const slotOf = (c: Column) => slots.get(c.id) ?? 0;

  /** One row: a label and a cell per column (an unavailable flight shows a dash). */
  const row = (label: string, render: (c: FlightColumn) => ReactNode) => (
    <tr>
      <th scope="row" className={cn(LABEL, ROW_LINE, "py-3 text-xs font-semibold leading-snug text-ink-500")}>
        {label}
      </th>
      {columns.map((c) => (
        <td key={c.id} className={cn(CELL, ROW_LINE, "py-3")}>
          {isFlightColumn(c) ? render(c) : <NotAvailable />}
        </td>
      ))}
    </tr>
  );

  /**
   * Rows of flight-specific data that only exists close to departure. A flight that doesn't have it yet gets
   * one cell spanning the rows, with the marker saying when it will.
   */
  const gatedRows = (
    rows: ReadonlyArray<readonly [string, (c: FlightColumn) => ReactNode]>,
    has: (c: FlightColumn) => boolean,
    item: PendingItem,
    subject?: string,
  ) =>
    rows.map(([label, render], i) => (
      <tr key={label}>
        <th scope="row" className={cn(LABEL, ROW_LINE, "py-3 text-xs font-semibold leading-snug text-ink-500")}>
          {label}
        </th>
        {columns.map((c) => {
          if (!isFlightColumn(c)) {
            return (
              <td key={c.id} className={cn(CELL, ROW_LINE, "py-3")}>
                <NotAvailable />
              </td>
            );
          }
          if (has(c)) {
            return (
              <td key={c.id} className={cn(CELL, ROW_LINE, "py-3")}>
                {render(c)}
              </td>
            );
          }
          return i === 0 ? (
            <td key={c.id} rowSpan={rows.length} className={cn(CELL, ROW_LINE, "py-3")}>
              <PendingCell item={item} date={c.item.date} subject={subject} />
            </td>
          ) : null;
        })}
      </tr>
    ));

  /**
   * Group title in the label column (with a tinted icon from sm up — the same tones as the flight page's
   * sections), and a small key per flight so a column stays recognisable far down the table.
   */
  const groupHead = (title: string, icon: ReactNode, tone: Tone) => (
    <tr>
      <th scope="rowgroup" className={cn(STICKY, "border-t border-line bg-canvas pb-2.5 pt-4 align-top")}>
        <span className="flex items-center gap-2 text-xs font-bold leading-tight text-ink-900 sm:text-[13px]">
          <span
            aria-hidden
            className={cn(
              "hidden size-6 shrink-0 items-center justify-center rounded-lg sm:flex [&_svg]:size-3.5",
              TONE_CLASSES[tone].bg,
              TONE_CLASSES[tone].text,
            )}
          >
            {icon}
          </span>
          {title}
        </span>
      </th>
      {columns.map((c) => (
        <td key={c.id} className={cn(CELL, "border-t border-line bg-canvas pb-2.5 pt-4")}>
          {isFlightColumn(c) ? (
            // Wraps rather than truncating: in a narrow column the date is what tells two of the same flight apart.
            <span aria-hidden className="inline-flex max-w-full items-start gap-1.5 text-[11px] font-semibold leading-tight text-ink-500">
              <LineKey style={SERIES[slotOf(c)]!} className="mt-px shrink-0" />
              <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{tags.get(c.id) ?? c.flight.flightNumber}</span>
            </span>
          ) : null}
        </td>
      ))}
    </tr>
  );

  return (
    // `relative`: the sr-only text in the cells is absolutely positioned; without a positioned scroller its
    // containing block lies outside, so it escapes the clip and widens the page by the hidden column.
    <div
      onFocus={revealFocused}
      className="@container relative overflow-x-auto overscroll-x-contain rounded-3xl bg-surface shadow-soft ring-1 ring-line/80 [--cmp-col:108px] [--cmp-label:92px] [scroll-padding-inline-start:var(--cmp-label)] [scrollbar-width:thin] min-[400px]:[--cmp-col:124px] min-[400px]:[--cmp-label:100px] sm:[--cmp-col:11rem] sm:[--cmp-label:9.5rem] lg:[--cmp-col:13rem] lg:[--cmp-label:12rem]"
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-left"
        style={{ minWidth: `calc(var(--cmp-label) + ${n} * var(--cmp-col))` }}
      >
        <caption className="sr-only">
          {flights.length} flights compared side by side. Prices and forecasts are illustrative.
        </caption>
        <colgroup>
          <col style={{ width: "var(--cmp-label)" }} />
          {columns.map((c) => (
            <col key={c.id} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <td className={cn(STICKY, "bg-surface pb-3 pt-4 align-bottom")}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 max-[399px]:tracking-normal">
                {flights.length} {flights.length === 1 ? "flight" : "flights"}
              </span>
            </td>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={cn(CELL, "pb-3 pt-4 font-normal")}>
                <ColumnHead column={c} slot={slotOf(c)} />
              </th>
            ))}
          </tr>
        </thead>

        {/* The rest of each flight's header: where and when, fare, score, actions. */}
        <tbody>
          <tr>
            <th scope="row" className={cn(LABEL, ROW_LINE, "py-3 text-xs font-semibold text-ink-500")}>
              Route
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, ROW_LINE, "py-3")}>
                <Value main={routeText(c.item.origin, c.item.destination)} sub={shortDate(c.item.date)} />
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={cn(LABEL, "pb-3 text-xs font-semibold text-ink-500")}>
              Times
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, "pb-3")}>
                {isFlightColumn(c) ? (
                  <Value main={<Times column={c} />} />
                ) : (
                  <p className="text-xs leading-snug text-ink-500">{unavailableNote(c)}</p>
                )}
              </td>
            ))}
          </tr>
          {/* The column's focal point: the score on a tinted tile (calm scale), a button that explains the score. */}
          <tr>
            <th scope="row" className={cn(LABEL, "pb-3 text-xs font-semibold text-ink-500")}>
              Score
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, "pb-3")}>
                {isFlightColumn(c) && !c.avail.turbulence ? (
                  <PendingCell item="turbulence" date={c.item.date} subject="Score" />
                ) : isFlightColumn(c) ? (
                  <>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setSheetFor(c.id)}
                      className={cn(
                        "flex w-full min-w-0 flex-col items-start gap-1.5 rounded-2xl px-2.5 py-2.5 text-left ring-1 ring-inset transition-colors",
                        SCORE_TILE[scoreTone(c.flight.smoothness.score)],
                      )}
                    >
                      <ScoreBadge
                        score={c.flight.smoothness.score}
                        label={c.flight.smoothness.label}
                        size="sm"
                        // The narrowest columns (340 px phones) stack the label under the ring so "Mostly smooth" isn't cut off.
                        className="max-[399px]:flex-col max-[399px]:items-start max-[399px]:gap-1 [&>span:last-child]:text-[13px] [&>span:last-child]:text-ink-900"
                      />
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-500">
                        <Info aria-hidden className="size-3.5 shrink-0" />
                        How it works<span className="sr-only"> for {nameOf(c)}</span>
                      </span>
                    </button>
                    {smoothest.has(c.id) ? <Marker className="mt-2">Smoothest</Marker> : null}
                    <BenchmarkLine benchmark="smoothnessScore" value={c.flight.smoothness.score} className="mt-2" />
                  </>
                ) : (
                  <NotAvailable />
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={cn(LABEL, "pb-3 text-xs font-semibold text-ink-500")}>
              Fare
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, "pb-3")}>
                {isFlightColumn(c) ? (
                  <>
                    <span className="block text-2xl font-bold leading-tight tracking-tight text-ink-900 tabular-nums">
                      {formatFare(fareFor(c.option, c.daysUntil))}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">one way · illustrative</span>
                    {cheapest.has(c.id) ? <Marker>Cheapest</Marker> : null}
                  </>
                ) : (
                  <NotAvailable />
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={cn(LABEL, "pb-4")}>
              <span className="sr-only">Actions</span>
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, "pb-4")}>
                <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap">
                  {isFlightColumn(c) ? (
                    <Link href={flightHref(c.item)} className={cn(LINK_BASE, LINK_TONE.secondary, "h-11 px-3 lg:flex-1")}>
                      Details<span className="sr-only"> for {nameOf(c)}</span>
                    </Link>
                  ) : (
                    // Stacked on phones: keeps this Remove on the same line as the other columns' Remove.
                    <span aria-hidden className="h-11 lg:hidden" />
                  )}
                  <button
                    type="button"
                    data-remove-id={c.id}
                    onClick={() => onRemove(c.id)}
                    className="inline-flex h-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 lg:flex-1"
                  >
                    <X aria-hidden className="size-4 shrink-0" />
                    Remove<span className="sr-only"> {nameOf(c)}</span>
                  </button>
                </div>
              </td>
            ))}
          </tr>
        </tbody>

        <tbody>
          {groupHead("Smoothness", <Gauge />, "calm")}
          {row("On this route", (c) => {
            const typical = routeTypical(c.flight);
            return <Value main={typical.main} sub={typical.sub} />;
          })}
          {anyForecast
            ? gatedRows(
                [
                  [
                    "Bumpy stretches",
                    (c) => {
                      const { windows } = c.flight.turbulence;
                      const minutes = windows.reduce((sum, w) => sum + w.durationMin, 0);
                      return windows.length === 0 ? (
                        <Value main="None expected" />
                      ) : (
                        <Value
                          main={formatOffset(minutes)}
                          sub={`${windows.length} ${windows.length === 1 ? "stretch" : "stretches"}`}
                        />
                      );
                    },
                  ],
                  ["Strongest bumps", (c) => <Value main={STRONGEST_BUMPS[c.flight.turbulence.maxIntensity]} />],
                  [
                    "Smooth air",
                    (c) => <Value main={`${c.flight.turbulence.smoothMinutesPct}%`} sub="of the time in the air" />,
                  ],
                ],
                (c) => c.avail.turbulence,
                "turbulence",
              )
            : null}
          {/* When the forecast starts is in the Score row above; here only its tier. */}
          {row("Forecast confidence", (c) => (
            <Value main={c.forecast.confidenceLabel} sub={forecastBasis(c.forecast)} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Turbulence timeline", <Wind />, "calm")}
          <tr>
            <td colSpan={n + 1} className="p-0">
              {/* Spans the whole table but stays the width of the visible area, so it never scrolls away sideways. */}
              <div className="sticky left-0 w-[100cqw] px-3 pb-4 pt-3 sm:px-4">
                {series.length > 0 ? <TimelineChart series={series} /> : null}
                {pendingTurbulence.length > 0 ? (
                  <PendingTimelines
                    flights={pendingTurbulence.map((c) => ({
                      id: c.id,
                      name: names.get(c.id) ?? c.flight.flightNumber,
                      style: SERIES[slotOf(c)]!,
                      date: c.item.date,
                    }))}
                    charted={series.length > 0}
                    className={series.length > 0 ? "mt-4" : undefined}
                  />
                ) : null}
              </div>
            </td>
          </tr>
        </tbody>

        <tbody>
          {groupHead("Schedule", <CalendarClock />, "breeze")}
          {row("Departs", (c) => (
            <Value main={formatTime12(c.flight.departTime)} sub={`${c.flight.origin.code} · ${shortDate(c.item.date)}`} />
          ))}
          {row("Arrives", (c) => (
            <Value
              main={<ArriveTime column={c} />}
              sub={`${c.flight.destination.code} · ${shortDate(addDays(c.item.date, c.flight.arriveDayOffset))}`}
            />
          ))}
          {row("Duration", (c) => (
            <Value main={formatDuration(c.flight.blockMin)} sub="Gate to gate" marker={fastest.has(c.id) ? "Fastest" : null} />
          ))}
          {row("Days away", (c) => (
            <Value main={daysAwayLabel(c.daysUntil)} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Aircraft", <Plane />, "breeze")}
          {row("Type", (c) => (
            <Value
              main={c.flight.aircraft.fullName}
              sub={c.avail.airframe ? "Assigned aircraft · can change" : "Scheduled aircraft"}
            />
          ))}
          {row("Body", (c) => (
            <Value
              main={c.flight.aircraft.bodyType === "wide" ? "Wide-body" : "Narrow-body"}
              sub={c.flight.aircraft.bodyType === "wide" ? "Twin-aisle cabin" : "Single-aisle cabin"}
            />
          ))}
          {row("Age", (c) => {
            const a = c.flight.aircraft;
            // This airframe's own age only once it is assigned (about a day ahead); the fleet's any time. Either
            // way the figure shown is the one set against the global fleet average.
            return c.avail.airframe ? (
              <Value
                main={yearsText(a.ageYears)}
                sub={
                  <>
                    This aircraft, <span className="whitespace-nowrap">{a.tailNumber}</span> · fleet average{" "}
                    {yearsText(a.fleetAvgAgeYears)}
                  </>
                }
                benchmark={<BenchmarkLine benchmark="fleetAgeYears" value={a.ageYears} />}
              />
            ) : (
              <Value
                main={`About ${yearsText(a.fleetAvgAgeYears)}`}
                sub={`Fleet average for this type · ${rangeText(a.fleetAgeRange)}`}
                benchmark={<BenchmarkLine benchmark="fleetAgeYears" value={a.fleetAvgAgeYears} />}
              />
            );
          })}
          {row("Seat layout", (c) => (
            <Value main={c.flight.aircraft.seatLayout} sub={`About ${c.flight.aircraft.typicalSeats} seats`} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Airline", <ShieldCheck />, "calm")}
          {row("On time", (c) => (
            <Value
              main={`${c.flight.airlineStats.onTimePct}%`}
              sub={`${c.flight.airlineStats.onTimeRoutePct}% on this route · last 12 months`}
              benchmark={<BenchmarkLine benchmark="onTimePct" value={c.flight.airlineStats.onTimePct} />}
            />
          ))}
          {row("Safety score", (c) => (
            <Value main={`${c.flight.airlineStats.safetyScore} / 100`} sub={c.flight.airlineStats.safetyLabel} />
          ))}
          {/* Comfort, each figure next to the typical economy cabin (shared/src/benchmarks.ts). */}
          {row("Legroom", (c) => (
            <Value
              main={`${c.flight.airlineStats.seatPitchIn} in`}
              sub="Seat pitch in economy"
              benchmark={<BenchmarkLine benchmark="seatPitchIn" value={c.flight.airlineStats.seatPitchIn} />}
            />
          ))}
          {row("Seat width", (c) => (
            <Value
              main={`${c.flight.airlineStats.seatWidthIn} in`}
              sub="Economy seats"
              benchmark={<BenchmarkLine benchmark="seatWidthIn" value={c.flight.airlineStats.seatWidthIn} />}
            />
          ))}
          {row("Cabin noise", (c) => {
            // A band with an approximate range, never one exact reading (docs/FEASIBILITY.md). The band's label is
            // already the comparison, so the typical cabin's figure sits in the sub line rather than a second verdict.
            const noise = cabinNoiseBand(c.flight.airlineStats.cabinNoiseDb);
            return (
              <Value
                main={noise.label}
                sub={`${noise.range[0]!.toUpperCase()}${noise.range.slice(1)} · ${BENCHMARKS.cabinNoiseDb.label} ${benchmarkValue("cabinNoiseDb")}`}
              />
            );
          })}
          {row("Comfort", (c) => (
            <Value
              main={`${c.flight.airlineStats.comfortScore.toFixed(1)} / 10`}
              sub="Seats, cabin and service, from passenger reviews"
              benchmark={<BenchmarkLine benchmark="comfortScore" value={c.flight.airlineStats.comfortScore} />}
            />
          ))}
        </tbody>

        <tbody>
          {groupHead("Who flies it", <UserRound />, "dusk")}
          {row("Pilots", (c) => {
            const line = crewLine(c.flight.crew, c.flight.aircraft.model);
            return <Value main={line.main} sub={line.sub} />;
          })}
          {row("Licence", (c) => {
            const { licence } = crewRules(c.flight.crew);
            return <Value main={licence.main} sub={licence.sub} />;
          })}
          {row("Checks", (c) => {
            const { checks } = crewRules(c.flight.crew);
            return <Value main={checks.main} sub={checks.sub} />;
          })}
        </tbody>

        <tbody>
          {groupHead("Weather", <CloudSun />, "breeze")}
          {anyWeather
            ? gatedRows(
                [
                  ["Departure", (c) => <WeatherValue report={c.flight.weather.origin} detail={c.avail.weatherDetail} />],
                  ["Arrival", (c) => <WeatherValue report={c.flight.weather.destination} detail={c.avail.weatherDetail} />],
                ],
                (c) => c.avail.weather,
                "weather",
              )
            : row("Forecast", (c) => <PendingCell item="weather" date={c.item.date} />)}
        </tbody>

        <tbody>
          {groupHead("Best seat", <Armchair />, "calm")}
          {row("Smoothest rows", (c) => {
            const zone = smoothestZone(c.flight);
            return <Value main={zone.main} sub={zone.sub} />;
          })}
          {row("Open seat there", (c) => {
            const seat = openSeat(c.flight);
            return seat ? (
              <Value main={`Seat ${seat.seat}`} sub={seat.detail} />
            ) : (
              <Value main="None open right now" sub="Seats change until check-in" />
            );
          })}
        </tbody>
      </table>

      {/* Opened from a score tile; the same sheet the result cards open, so one score has one explanation. */}
      {sheetColumn ? <ScoreSheet flight={sheetColumn.flight} daysUntil={sheetColumn.daysUntil} onClose={() => setSheetFor(null)} /> : null}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ColumnHead({ column, slot }: { column: Column; slot: number }) {
  if (!isFlightColumn(column)) {
    return (
      <>
        <span className="flex h-7 items-center">
          <AirlineMark code={column.item.key.slice(0, 2)} size="sm" className="opacity-50" />
        </span>
        <span className="mt-2 block text-[13px] font-bold leading-snug text-ink-700 tabular-nums">{column.item.key}</span>
        <span className="block text-xs leading-snug text-ink-500">{UNAVAILABLE_LABEL[column.reason]}</span>
      </>
    );
  }
  const f = column.flight;
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <AirlineMark code={f.airline.code} size="sm" />
        <LineKey style={SERIES[slot]!} className="shrink-0" />
      </span>
      <span className="mt-2 block text-[13px] font-bold leading-snug text-ink-900 [overflow-wrap:anywhere] sm:text-sm">
        {f.airline.name}
      </span>
      <span className="block text-xs font-semibold text-ink-500 tabular-nums">
        {f.flightNumber}
        <span className="sr-only"> on {shortDate(column.item.date)}</span>
      </span>
    </>
  );
}

function Value({
  main,
  sub,
  marker,
  benchmark,
}: {
  main: ReactNode;
  sub?: ReactNode;
  marker?: string | null;
  /** A BenchmarkLine setting the figure against its industry average. */
  benchmark?: ReactNode;
}) {
  return (
    <>
      <span className="block text-[13px] font-semibold leading-snug text-ink-900 tabular-nums [overflow-wrap:anywhere] sm:text-sm">
        {main}
      </span>
      {sub ? <span className="mt-0.5 block text-xs leading-snug text-ink-500 [overflow-wrap:anywhere]">{sub}</span> : null}
      {benchmark ? <span className="mt-1 block">{benchmark}</span> : null}
      {marker ? <Marker>{marker}</Marker> : null}
    </>
  );
}

/** Quiet fact marker — "Smoothest", "Cheapest", "Fastest". Never advice. */
function Marker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "mt-1.5 flex w-fit items-center rounded-full bg-calm-50 px-2 py-0.5 text-[11px] font-semibold leading-4 text-calm-700 ring-1 ring-inset ring-calm-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

function NotAvailable() {
  return (
    <>
      <span aria-hidden className="text-sm text-ink-300">
        —
      </span>
      <span className="sr-only">Not available</span>
    </>
  );
}

function Times({ column }: { column: FlightColumn }) {
  const f = column.flight;
  return (
    <>
      <span className="whitespace-nowrap">{formatTime12(f.departTime)}</span>
      <span aria-hidden> → </span>
      <span className="sr-only"> to </span>
      <span className="whitespace-nowrap">
        <ArriveTime column={column} />
      </span>
    </>
  );
}

function ArriveTime({ column }: { column: FlightColumn }) {
  const f = column.flight;
  const mark = dayOffsetMark(f.arriveDayOffset);
  return (
    <>
      {formatTime12(f.arriveTime)}
      {mark ? (
        <>
          <sup aria-hidden className="ml-0.5 text-[10px] font-semibold text-calm-700">
            {mark}
          </sup>
          <span className="sr-only"> ({dayOffsetWords(f.arriveDayOffset)})</span>
        </>
      ) : null}
    </>
  );
}

/** Condition and temperature (within WEATHER_FORECAST_DAYS); wind, gusts and visibility only within WEATHER_DETAIL_DAYS. */
function WeatherValue({ report, detail }: { report: WeatherReport; detail: boolean }) {
  const gusts = report.gustKts ? `, gusts ${report.gustKts} kt` : "";
  return (
    <Value
      main={
        <>
          {report.label} · {report.tempF}°F
        </>
      }
      sub={
        <>
          {report.city} at {formatTime12(report.localTime)}
          {detail ? (
            <span className="block">
              Wind {report.windKts} kt {report.windDir}
              {gusts} · {report.visibilityMi} mi visibility
            </span>
          ) : null}
        </>
      }
    />
  );
}

/** A table cell's marker: "Turbulence forecast from Tue, Nov 24" over "2 days before departure". */
function PendingCell({ item, date, subject, className }: { item: PendingItem; date: string; subject?: string; className?: string }) {
  const m = marker(item, date, subject);
  return (
    <span className={cn("block", className)}>
      <span className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-ink-700">
        <CalendarClock aria-hidden className="mt-0.5 hidden size-3.5 shrink-0 text-breeze-700 sm:block" />
        <span className="min-w-0 break-words">
          {m.subject} from <span className="whitespace-nowrap">{m.from}</span>
        </span>
      </span>
      <span className="sr-only">, </span>
      <span className="mt-0.5 block text-xs leading-snug text-ink-500 sm:pl-5">{m.lead}</span>
    </span>
  );
}
