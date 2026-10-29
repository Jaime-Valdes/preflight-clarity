"use client";

import { ArrowRight, Armchair, CalendarClock, Heart, Plane, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { addDays, formatDuration, formatTime12 } from "@preflight/shared/dates";
import { forYouScore, rateFlight, type Rating, type RatingCategory } from "@preflight/shared/ratings";
import { fareAt, searchFlights, type FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { hasLeft } from "@/components/c/common/availability";
import type { CompareTableProps } from "@/components/c/compare/ComparePage";
import {
  UNAVAILABLE_LABEL,
  crewLine,
  flightTags,
  isFlightColumn,
  leaders,
  openSeat,
  smoothestZone,
  spoken,
  unavailableNote,
  type Column,
  type FlightColumn,
} from "@/components/c/compare/facts";
import { BenchmarkLine } from "@/components/c/flight/BenchmarkLine";
import { LINK_BASE, LINK_TONE, dayOffsetMark, dayOffsetWords, daysAwayLabel, flightContext, routeText, shortDate } from "@/components/c/flight/copy";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { ChooseButton } from "@/components/d/flight/ChooseButton";
import { RatingButton } from "@/components/d/ratings/RatingSheet";
import { CATEGORY_SHORT } from "@/components/d/ratings/tone";
import { formatFare } from "@/lib/c/format";
import { usePriorities } from "@/lib/d/priorities";
import { priceDeltaText } from "@/lib/d/view";
import { useNowMs } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { TONE_CLASSES, type Tone } from "@/lib/theme";

/*
 * Version D's compare table (docs/ITERATION_2.md): 2–3 flights side by side —
 * a header per flight, the fare with its difference to the cheapest of them,
 * the four ratings in the visitor's order (each a pill that opens its detail
 * sheet), schedule, aircraft, airline, who flies it, the best seat, and "I'd
 * pick this flight" per column. No score ring and no timeline chart. On
 * phones two columns fit at 390 px; a third scrolls sideways inside the
 * table, never the page. Same props as version C's table, so ComparePage can
 * show either.
 */

/* Row labels stay put while the flight columns scroll sideways on phones (the cell must be opaque). */
const STICKY =
  "sticky left-0 z-10 px-2 text-left shadow-[inset_-1px_0_0_var(--color-line)] min-[400px]:px-2.5 sm:px-4";
const LABEL = `${STICKY} bg-surface align-top`;
const CELL = "px-2.5 align-top min-[400px]:px-3 sm:px-4";
const ROW_LINE = "border-t border-line/70";

/** The quiet marker on the flight that leads a rating row (every tied one; none when they are all equal). */
const ROW_MARK: Record<RatingCategory, string> = {
  cruise: "Smoothest",
  takeoff_landing: "Smoothest",
  aircraft: "Largest",
  space: "Roomiest",
};

/**
 * When a control inside the sideways-scrolling table gets keyboard focus, bring all of it into view: the
 * browser leaves a partly visible one cut off at the edge, or under the sticky row labels.
 */
function revealFocused(event: FocusEvent<HTMLDivElement>) {
  const target = event.target;
  if (target === event.currentTarget || !(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** "YYYY-MM-DD" today, from a column: its date minus its (never negative) distance in days. */
function todayFor(column: FlightColumn): string {
  return addDays(column.item.date, -column.daysUntil);
}

/** Every flight on the column's day (cached by the generator), for the pick's price rank. */
function optionsOn(column: FlightColumn): readonly FlightOption[] {
  try {
    return searchFlights({ origin: column.item.origin, destination: column.item.destination, date: column.item.date }).options;
  } catch {
    return [column.option];
  }
}

/** Whether the table is wider than its box, and whether more of it lies to the right of what is on screen. */
interface Edge {
  wider: boolean;
  more: boolean;
}

const NO_EDGE: Edge = { wider: false, more: false };

/** The state update for a scroller's current edges (the same object back when nothing changed). */
function edgeUpdate(el: HTMLElement): (prev: Edge) => Edge {
  const hidden = el.scrollWidth - el.clientWidth;
  const next: Edge = { wider: hidden > 1, more: hidden - el.scrollLeft > 8 };
  return (prev) => (prev.wider === next.wider && prev.more === next.more ? prev : next);
}

export function DCompareTable({ columns, names, onRemove }: CompareTableProps) {
  const hrefs = useHrefs();
  const priorities = usePriorities();
  const order = priorities.order;
  const flights = useMemo(() => columns.filter(isFlightColumn), [columns]);
  const n = columns.length;
  // Deterministic and cheap: the ratings and the day's flights, once per set of columns.
  const ratings = useMemo(
    () => new Map(flights.map((c) => [c.id, rateFlight({ option: c.option, today: todayFor(c) })])),
    [flights],
  );
  // The flights still to leave that day: the pick's price rank is against the same set the results page prices against.
  const nowMs = useNowMs();
  const dayOptions = useMemo(
    () => new Map(flights.map((c) => [c.id, optionsOn(c).filter((o) => !hasLeft(o.flight, nowMs))])),
    [flights, nowMs],
  );

  // On phones a third column sits off-screen: a fade at the right edge says there is more while there is,
  // and a line above the table says so in words. Measured by a ResizeObserver (its first report comes
  // right after observing, so nothing is set in the effect itself) and on every scroll.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge>(NO_EDGE);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setEdge(edgeUpdate(el)));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  const tags = useMemo(() => flightTags(flights, names), [flights, names]);
  // Fares as shown: the base fare moved by each flight's own lead time (they can be on different dates).
  const fares = flights.map((c) => fareAt(c.option, c.daysUntil));
  const cheapestFare = fares.length ? Math.min(...fares) : null;
  const forYou = leaders(flights, (c) => forYouScore(ratings.get(c.id) ?? [], order), "max");

  const ratingOf = (c: FlightColumn, category: RatingCategory): Rating | undefined =>
    ratings.get(c.id)?.find((r) => r.category === category);
  const rowLeaders = (category: RatingCategory) => leaders(flights, (c) => ratingOf(c, category)?.value ?? 0, "max");

  /** For screen readers: "DL 843, Nov 26, JFK to LAX". */
  const nameOf = (c: Column) =>
    spoken(isFlightColumn(c) ? (names.get(c.id) ?? c.flight.flightNumber) : `${c.item.key} · ${shortDate(c.item.date)}`);

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

  /** Group title in the label column (a tinted icon from sm up), and a small key per flight so a column stays recognisable. */
  const groupHead = (title: string, icon: ReactNode, tone: Tone, sub?: string) => (
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
        {sub ? <span className="mt-0.5 block text-[11px] font-normal leading-snug text-ink-500">{sub}</span> : null}
      </th>
      {columns.map((c) => (
        <td key={c.id} className={cn(CELL, "border-t border-line bg-canvas pb-2.5 pt-4")}>
          {isFlightColumn(c) ? (
            // Wraps rather than truncating: in a narrow column the date is what tells two of the same flight apart.
            <span aria-hidden className="block max-w-full text-[11px] font-semibold leading-tight text-ink-500 tabular-nums [overflow-wrap:anywhere]">
              {tags.get(c.id) ?? c.flight.flightNumber}
            </span>
          ) : null}
        </td>
      ))}
    </tr>
  );

  return (
    <>
      {edge.wider ? (
        <p className="mb-2 flex items-center gap-1.5 px-1 text-xs leading-snug text-ink-500">
          <ArrowRight aria-hidden className="size-3.5 shrink-0" />
          {n === 3 ? "Scroll the table sideways for the third flight." : "Scroll the table sideways for the rest."}
        </p>
      ) : null}
      <div className="relative">
        {/* `relative`: the sr-only text in the cells is absolutely positioned; without a positioned scroller its
            containing block lies outside, so it escapes the clip and widens the page by the hidden column. */}
        <div
          ref={scrollerRef}
          onFocus={revealFocused}
          onScroll={(event) => setEdge(edgeUpdate(event.currentTarget))}
          className="relative overflow-x-auto overscroll-x-contain rounded-3xl bg-surface shadow-soft ring-1 ring-line/80 [--cmp-col:108px] [--cmp-label:92px] [scroll-padding-inline-start:var(--cmp-label)] [scrollbar-width:thin] min-[400px]:[--cmp-col:124px] min-[400px]:[--cmp-label:100px] sm:[--cmp-col:11rem] sm:[--cmp-label:9.5rem] lg:[--cmp-col:13rem] lg:[--cmp-label:12rem]"
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-left"
            style={{ minWidth: `calc(var(--cmp-label) + ${n} * var(--cmp-col))` }}
          >
            <caption className="sr-only">
              {flights.length} flights compared side by side, rated in plain words{" "}
              {priorities.chosen ? "for what matters to you" : "in the usual order"}. Prices are illustrative.
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
                    <ColumnHead column={c} forYou={forYou.has(c.id)} chosen={priorities.chosen} />
                  </th>
                ))}
              </tr>
            </thead>

            {/* The rest of each flight's header: where and when, the fare and its difference, the actions. */}
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
              <tr>
                <th scope="row" className={cn(LABEL, "pb-3 text-xs font-semibold text-ink-500")}>
                  Fare
                </th>
                {columns.map((c) => {
                  if (!isFlightColumn(c)) {
                    return (
                      <td key={c.id} className={cn(CELL, "pb-3")}>
                        <NotAvailable />
                      </td>
                    );
                  }
                  const fare = fareAt(c.option, c.daysUntil);
                  const delta = priceDeltaText(fare, cheapestFare);
                  return (
                    <td key={c.id} className={cn(CELL, "pb-3")}>
                      <span className="block text-2xl font-bold leading-tight tracking-tight text-ink-900 tabular-nums">{formatFare(fare)}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">one way · illustrative</span>
                      {delta === "Cheapest" ? (
                        <Marker>Cheapest</Marker>
                      ) : (
                        <span className="mt-1.5 block text-xs font-semibold leading-snug text-ink-700 tabular-nums">{delta}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row" className={cn(LABEL, "pb-4")}>
                  <span className="sr-only">Actions</span>
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, "pb-4")}>
                    <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap">
                      {isFlightColumn(c) ? (
                        <Link href={hrefs.flight(c.item)} className={cn(LINK_BASE, LINK_TONE.secondary, "h-11 px-3 lg:flex-1")}>
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

            {/* The four ratings in the visitor's order; a pill opens the rating's detail (numbers, how it is worked out). */}
            <tbody>
              {groupHead(priorities.chosen ? "Rated for you" : "Ratings", <Sparkles />, "calm", priorities.chosen ? "In your order" : "In the usual order")}
              {order.map((category) => {
                const lead = rowLeaders(category);
                return (
                  <tr key={category}>
                    <th scope="row" className={cn(LABEL, ROW_LINE, "py-3 text-xs font-semibold leading-snug text-ink-500")}>
                      {CATEGORY_SHORT[category]}
                    </th>
                    {columns.map((c) => {
                      const rating = isFlightColumn(c) ? ratingOf(c, category) : undefined;
                      return (
                        <td key={c.id} className={cn(CELL, ROW_LINE, "py-3")}>
                          {rating && isFlightColumn(c) ? (
                            <>
                              {/* The row names the category, so the pill carries the tier alone ("Smooth", "Large jet"). In a
                                  108 px phone column the words wrap between themselves, never inside one, and the chevron
                                  makes way for them below 400 px. */}
                              <RatingButton
                                rating={rating}
                                flightLabel={flightContext(c.flight, c.item)}
                                from="compare"
                                size="sm"
                                labelOnly
                                className="max-w-full py-1 text-left [&_span]:whitespace-normal [&_span]:break-words max-[399px]:[&_svg]:hidden"
                              />
                              {lead.has(c.id) ? <Marker className="mt-2">{ROW_MARK[category]}</Marker> : null}
                            </>
                          ) : (
                            <NotAvailable />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
                <Value main={formatDuration(c.flight.blockMin)} sub="Gate to gate · nonstop" />
              ))}
              {row("Days away", (c) => (
                <Value main={daysAwayLabel(c.daysUntil)} />
              ))}
            </tbody>

            <tbody>
              {groupHead("Aircraft", <Plane />, "breeze")}
              {row("Type", (c) => (
                <Value main={c.flight.aircraft.fullName} sub={c.avail.airframe ? "Assigned aircraft · can change" : "Scheduled aircraft"} />
              ))}
              {row("Size", (c) => (
                <Value
                  main={ratingOf(c, "aircraft")?.label ?? (c.flight.aircraft.bodyType === "wide" ? "Large jet" : "Jet")}
                  sub={`${c.flight.aircraft.bodyType === "wide" ? "Wide-body · two aisles" : "Narrow-body · one aisle"} · about ${c.flight.aircraft.typicalSeats} seats`}
                />
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
            </tbody>

            <tbody>
              {groupHead("Who flies it", <UserRound />, "dusk")}
              {row("Pilots", (c) => {
                const line = crewLine(c.flight.crew, c.flight.aircraft.model);
                return <Value main={line.main} sub={line.sub} />;
              })}
            </tbody>

            <tbody>
              {groupHead("Best seat", <Armchair />, "calm")}
              {row("Smoothest rows", (c) => {
                const zone = smoothestZone(c.flight);
                return <Value main={zone.main} sub={zone.sub} />;
              })}
              {row("Open seat there", (c) => {
                const seat = openSeat(c.flight);
                return seat ? <Value main={`Seat ${seat.seat}`} sub={seat.detail} /> : <Value main="None open right now" sub="Seats change until check-in" />;
              })}
            </tbody>

            {/* The choice signal, per column. Recorded only — nothing is booked. */}
            <tbody>
              {groupHead("Your pick", <Heart />, "dusk", "Nothing is booked")}
              <tr>
                <th scope="row" className={cn(LABEL, ROW_LINE, "py-3 text-xs font-semibold leading-snug text-ink-500")}>
                  I&rsquo;d pick
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, ROW_LINE, "py-3 pb-4")}>
                    {isFlightColumn(c) ? (
                      <ChooseButton
                        item={c.item}
                        option={c.option}
                        options={dayOptions.get(c.id) ?? [c.option]}
                        daysUntil={c.daysUntil}
                        ratings={ratings.get(c.id) ?? []}
                        order={order}
                        position={null}
                        from="compare"
                        size="sm"
                      />
                    ) : (
                      <NotAvailable />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {/* The fade: there is more table to the right. Gone once the end is on screen. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-14 rounded-r-3xl bg-linear-to-l from-surface via-surface/75 to-surface/0 transition-opacity duration-200",
            edge.more ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ColumnHead({ column, forYou, chosen }: { column: Column; forYou: boolean; chosen: boolean }) {
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
      <span className="flex h-7 items-center">
        <AirlineMark code={f.airline.code} size="sm" />
      </span>
      <span className="mt-2 block text-[13px] font-bold leading-snug text-ink-900 [overflow-wrap:anywhere] sm:text-sm">{f.airline.name}</span>
      <span className="block text-xs font-semibold text-ink-500 tabular-nums">
        {f.flightNumber}
        <span className="sr-only"> on {shortDate(column.item.date)}</span>
      </span>
      {/* "For you" only once the visitor has said what matters; before that the lead is in the usual order. */}
      {forYou ? <Marker className="mt-2">{chosen ? "Smoothest for you" : "Smoothest overall"}</Marker> : null}
    </>
  );
}

function Value({ main, sub, benchmark }: { main: ReactNode; sub?: ReactNode; benchmark?: ReactNode }) {
  return (
    <>
      <span className="block text-[13px] font-semibold leading-snug text-ink-900 tabular-nums [overflow-wrap:anywhere] sm:text-sm">{main}</span>
      {sub ? <span className="mt-0.5 block text-xs leading-snug text-ink-500 [overflow-wrap:anywhere]">{sub}</span> : null}
      {benchmark ? <span className="mt-1 block">{benchmark}</span> : null}
    </>
  );
}

/** Quiet fact marker — "Smoothest for you", "Cheapest", "Smoothest". Never advice. */
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
