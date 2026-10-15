"use client";

import { Armchair, CalendarClock, CloudSun, Gauge, Plane, ShieldCheck, UserRound, Wind, X } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { addDays, formatDuration, formatOffset, formatTime12 } from "@preflight/shared/dates";
import type { Pilot, WeatherReport } from "@preflight/shared/types";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { ScoreBadge } from "@/components/c/common/ScoreBadge";
import { bumpyStretches } from "@/components/dashboard/explore/model";
import { ageValue, formatCount } from "@/components/dashboard/trust/format";
import { formatFare } from "@/lib/c/format";
import { flightHref } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import { LINK_BASE, LINK_TONE, daysAwayLabel, dayOffsetMark, dayOffsetWords, routeText, shortDate } from "../flight/copy";
import {
  FORECAST_BASIS,
  SERIES,
  STRONGEST_BUMPS,
  UNAVAILABLE_NOTE,
  bestSeat,
  flightTags,
  isFlightColumn,
  leaders,
  smoothestRows,
  spoken,
  timelineSummary,
  type Column,
  type FlightColumn,
} from "./facts";
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

/**
 * Version C compare page: 2–3 flights side by side — a header per flight, then
 * grouped rows (smoothness, the overlaid turbulence timelines, schedule,
 * aircraft, airline, crew, weather, best seat). On phones two columns fit at
 * 390 px; a third scrolls sideways inside the table, never the page.
 */
export function CompareTable({ columns, slots, names, onRemove }: CompareTableProps) {
  const flights = useMemo(() => columns.filter(isFlightColumn), [columns]);
  const n = columns.length;
  const cheapest = leaders(flights, (c) => c.option.fareUsd, "min");
  const smoothest = leaders(flights, (c) => c.flight.smoothness.score, "max");
  const fastest = leaders(flights, (c) => c.flight.blockMin, "min");
  const tags = useMemo(() => flightTags(flights, names), [flights, names]);

  const series = useMemo<TimelineSeries[]>(
    () =>
      flights.map((c) => ({
        id: c.id,
        name: names.get(c.id) ?? c.flight.flightNumber,
        detail: `${formatTime12(c.flight.departTime)} · ${c.flight.airline.name}`,
        style: SERIES[slots.get(c.id) ?? 0]!,
        points: c.flight.turbulence.points,
        airborneMin: c.flight.airborneMin,
        summary: timelineSummary(c.flight, c.forecast.mode),
      })),
    [flights, names, slots],
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

  /** Group title in the label column, and a small key per flight so a column stays recognisable far down the table. */
  const groupHead = (title: string, icon: ReactNode) => (
    <tr>
      <th scope="rowgroup" className={cn(STICKY, "border-t border-line bg-canvas pb-2.5 pt-4 align-top")}>
        <span className="flex items-center gap-1.5 text-xs font-bold leading-tight text-ink-900 sm:text-[13px] [&_svg]:hidden [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-400 sm:[&_svg]:block">
          {icon}
          {title}
        </span>
      </th>
      {columns.map((c) => (
        <td key={c.id} className={cn(CELL, "border-t border-line bg-canvas pb-2.5 pt-4")}>
          {isFlightColumn(c) ? (
            <span aria-hidden className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold leading-tight text-ink-500">
              <LineKey style={SERIES[slotOf(c)]!} className="shrink-0" />
              <span className="truncate tabular-nums">{tags.get(c.id) ?? c.flight.flightNumber}</span>
            </span>
          ) : null}
        </td>
      ))}
    </tr>
  );

  return (
    // `relative`: the sr-only text in the cells is absolutely positioned; without a positioned scroller its
    // containing block lies outside, so it escapes the clip and widens the page by the hidden column.
    <div className="@container relative overflow-x-auto overscroll-x-contain rounded-3xl bg-surface shadow-soft ring-1 ring-line/80 [scrollbar-width:thin]">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-left [--cmp-col:108px] [--cmp-label:92px] min-[400px]:[--cmp-col:124px] min-[400px]:[--cmp-label:100px] sm:[--cmp-col:11rem] sm:[--cmp-label:9.5rem] lg:[--cmp-col:13rem] lg:[--cmp-label:12rem]"
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
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 max-[399px]:tracking-normal">
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
                  <p className="text-xs leading-snug text-ink-500">{UNAVAILABLE_NOTE[c.reason]}</p>
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
                    <span className="block text-xl font-bold leading-tight text-ink-900 tabular-nums">{formatFare(c.option.fareUsd)}</span>
                    {cheapest.has(c.id) ? <Marker>Cheapest</Marker> : null}
                  </>
                ) : (
                  <NotAvailable />
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={cn(LABEL, "pb-3 text-xs font-semibold text-ink-500")}>
              Score
            </th>
            {columns.map((c) => (
              <td key={c.id} className={cn(CELL, "pb-3")}>
                {isFlightColumn(c) ? (
                  <>
                    <ScoreBadge
                      score={c.flight.smoothness.score}
                      label={c.flight.smoothness.label}
                      size="sm"
                      className="[&>span:last-child]:text-[13px]"
                    />
                    {smoothest.has(c.id) ? <Marker className="mt-2">Smoothest</Marker> : null}
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
                  ) : null}
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
          {groupHead("Smoothness", <Gauge />)}
          {row("Bumpy stretches", (c) => {
            const { count, minutes } = bumpyStretches(c.flight);
            return count === 0 ? (
              <Value main="None expected" />
            ) : (
              <Value main={formatOffset(minutes)} sub={`${count} ${count === 1 ? "stretch" : "stretches"}`} />
            );
          })}
          {row("Strongest bumps", (c) => (
            <Value main={STRONGEST_BUMPS[c.flight.turbulence.maxIntensity]} />
          ))}
          {row("Smooth air", (c) => (
            <Value main={`${c.flight.turbulence.smoothMinutesPct}%`} sub="of the time in the air" />
          ))}
          {row("Forecast confidence", (c) => (
            <Value main={c.forecast.confidenceLabel} sub={FORECAST_BASIS[c.forecast.mode]} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Turbulence timeline", <Wind />)}
          <tr>
            <td colSpan={n + 1} className="p-0">
              {/* Spans the whole table but stays the width of the visible area, so it never scrolls away sideways. */}
              <div className="sticky left-0 w-[100cqw] px-3 pb-4 pt-3 sm:px-4">
                <TimelineChart series={series} />
              </div>
            </td>
          </tr>
        </tbody>

        <tbody>
          {groupHead("Schedule", <CalendarClock />)}
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
          {groupHead("Aircraft", <Plane />)}
          {row("Model", (c) => (
            <Value main={c.flight.aircraft.fullName} />
          ))}
          {row("Body", (c) => (
            <Value
              main={c.flight.aircraft.bodyType === "wide" ? "Wide-body" : "Narrow-body"}
              sub={c.flight.aircraft.bodyType === "wide" ? "Twin-aisle cabin" : "Single-aisle cabin"}
            />
          ))}
          {row("Age", (c) => (
            <Value main={ageValue(c.flight.aircraft.ageYears)} sub={`Delivered in ${c.flight.aircraft.deliveredYear}`} />
          ))}
          {row("Seat layout", (c) => (
            <Value main={c.flight.aircraft.seatLayout} sub={`About ${c.flight.aircraft.typicalSeats} seats`} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Airline", <ShieldCheck />)}
          {row("On time", (c) => (
            <Value main={`${c.flight.airlineStats.onTimePct}%`} sub={`${c.flight.airlineStats.onTimeRoutePct}% on this route`} />
          ))}
          {row("Safety score", (c) => (
            <Value main={`${c.flight.airlineStats.safetyScore} / 100`} sub={c.flight.airlineStats.safetyLabel} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Crew", <UserRound />)}
          {row("Captain", (c) => (
            <PilotHours pilot={c.flight.crew.captain} model={c.flight.aircraft.model} />
          ))}
          {row("First officer", (c) => (
            <PilotHours pilot={c.flight.crew.firstOfficer} model={c.flight.aircraft.model} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Weather", <CloudSun />)}
          {row("Departure", (c) => (
            <WeatherValue report={c.flight.weather.origin} />
          ))}
          {row("Arrival", (c) => (
            <WeatherValue report={c.flight.weather.destination} />
          ))}
        </tbody>

        <tbody>
          {groupHead("Best seat", <Armchair />)}
          {row("Top pick", (c) => {
            const seat = bestSeat(c.flight);
            return seat ? <Value main={`Seat ${seat.seat}`} sub={seat.detail} /> : <Value main="Any free seat over the wing" />;
          })}
          {row("Smoothest rows", (c) => (
            <Value main={smoothestRows(c.flight)} />
          ))}
        </tbody>
      </table>
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
        <span className="block text-xs leading-snug text-ink-500">No longer available</span>
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

function Value({ main, sub, marker }: { main: ReactNode; sub?: ReactNode; marker?: string | null }) {
  return (
    <>
      <span className="block text-[13px] font-semibold leading-snug text-ink-900 tabular-nums [overflow-wrap:anywhere] sm:text-sm">
        {main}
      </span>
      {sub ? <span className="mt-0.5 block text-xs leading-snug text-ink-500 [overflow-wrap:anywhere]">{sub}</span> : null}
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

function PilotHours({ pilot, model }: { pilot: Pilot; model: string }) {
  return <Value main={`${formatCount(pilot.totalHours)} hours`} sub={`${formatCount(pilot.hoursOnType)} on the ${model}`} />;
}

function WeatherValue({ report }: { report: WeatherReport }) {
  return (
    <Value
      main={
        <>
          {report.label} · {report.tempF}°F
        </>
      }
      sub={`${report.city} at ${formatTime12(report.localTime)}`}
    />
  );
}
