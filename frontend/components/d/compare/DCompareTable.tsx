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
import { dayOffsetMark, dayOffsetWords, daysAwayLabel, flightContext, routeText, shortDate } from "@/components/c/flight/copy";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { D_LINK, D_PILL_OUTLINE } from "@/components/d/brand/buttons";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { cloudReact } from "@/components/d/cloud/react";
import { ChooseButton } from "@/components/d/flight/ChooseButton";
import { animateOnce } from "@/components/d/motion/motion";
import { RatingButton } from "@/components/d/ratings/RatingSheet";
import { CATEGORY_SHORT } from "@/components/d/ratings/tone";
import { formatFare } from "@/lib/c/format";
import { usePriorities } from "@/lib/d/priorities";
import { priceDeltaText } from "@/lib/d/view";
import { useNowMs } from "@/lib/hooks";
import { cn } from "@/lib/cn";

/*
 * Version D's compare table (docs/ITERATION_2.md): 2–3 flights side by side —
 * a header per flight, the fare with its difference to the cheapest of them,
 * the four ratings in the visitor's order (each a tile that opens its detail
 * sheet), schedule, aircraft, airline, who flies it, the best seat, and "I'd
 * pick this flight" per column. No score ring and no timeline chart. On
 * phones two columns fit at 390 px; a third scrolls sideways inside the
 * table, never the page. Same props as version C's table, so ComparePage can
 * show either.
 *
 * Look (docs/ui-d-cinematic.md, "Compare and the small states"): one paper card.
 * Each group opens with a rounded sky band; the ratings are the focal group (a
 * sunlit badge on their band, a badge per category, full-width tier tiles); the
 * cloud lives in the label column's corner, which belongs to no flight. Every
 * flight column is built from the same cells with the same classes: nothing here
 * is styled by a flight's rating, price, airline or place in the list. The cells'
 * paddings, the bands, the hairlines and the arrival are in app/d/d-compare.css.
 */

/* Row labels stay put while the flight columns scroll sideways on phones (the cell must be opaque). */
const STICKY = "d-compare-sticky sticky left-0 z-10 bg-surface text-left";
const LABEL = `${STICKY} text-xs font-semibold leading-snug text-ink-mute sm:text-[13px]`;
const CELL = "d-compare-cell";
/* A label sits on the first line of its values, whatever their sizes. */
const BASE = "align-baseline";

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

/**
 * The cloud's "noted" for a removal, the same for every flight. One frame later, so the cloud that
 * answers is the one the page shows after the change: the corner cloud, or the empty state's.
 */
function nodAfterRemoval() {
  window.requestAnimationFrame(() => cloudReact("nod"));
}

/**
 * Where the table stands in its box: wider than it, more of it to the right of what is on screen, and
 * columns scrolled under the row labels.
 */
interface Edge {
  wider: boolean;
  more: boolean;
  under: boolean;
}

const NO_EDGE: Edge = { wider: false, more: false, under: false };

/** The state update for a scroller's current edges (the same object back when nothing changed). */
function edgeUpdate(el: HTMLElement): (prev: Edge) => Edge {
  const hidden = el.scrollWidth - el.clientWidth;
  const next: Edge = { wider: hidden > 1, more: hidden - el.scrollLeft > 8, under: el.scrollLeft > 1 };
  return (prev) => (prev.wider === next.wider && prev.more === next.more && prev.under === next.under ? prev : next);
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
  // a line above the table says so in words, and the row labels cast an edge on the columns under them.
  // Measured by a ResizeObserver (its first report comes right after observing, so nothing is set in the
  // effect itself) and on every scroll; the state only changes when one of the three answers does.
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
  // A small answer to the scroll: each badge in the label column stamps once as it comes fully into view
  // (the kit's preset: scale only, never opacity, nothing under reduced motion). The label column belongs to
  // no flight, so no flight's column moves and every row answers alike.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          animateOnce(entry.target, "stamp");
        }
      },
      { threshold: 1 },
    );
    for (const badge of el.querySelectorAll(".d-compare-badge")) observer.observe(badge);
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
    <tr className="d-compare-row d-compare-ruled">
      <th scope="row" className={cn(LABEL, BASE, "py-3.5")}>
        {label}
      </th>
      {columns.map((c) => (
        <td key={c.id} className={cn(CELL, BASE, "py-3.5")}>
          {isFlightColumn(c) ? render(c) : <NotAvailable />}
        </td>
      ))}
    </tr>
  );

  /**
   * A group's band: its title beside an outlined badge, and a small key per flight so a column stays
   * recognisable far below the header. `focal` is the ratings group, the table's focal point.
   */
  const groupHead = (title: string, icon: ReactNode, sub?: string, focal = false) => (
    <tr className={cn("d-compare-band", focal && "d-compare-band-focal")}>
      <th scope="rowgroup" className={STICKY}>
        <span className="d-compare-band-title">
          <span aria-hidden className="d-compare-badge">
            {icon}
          </span>
          <span className="d-compare-band-name">{title}</span>
          {sub ? <span className="d-compare-band-sub">{sub}</span> : null}
        </span>
      </th>
      {columns.map((c) => (
        <td key={c.id} className={CELL}>
          {isFlightColumn(c) ? (
            // Wraps rather than truncating: in a narrow column the date is what tells two of the same flight apart.
            <span aria-hidden className="block max-w-full text-[11px] font-bold leading-tight text-ink-mute tabular-nums [overflow-wrap:anywhere] sm:text-xs">
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
      {/* The whole table arrives as one piece: every column in the same frame, so no flight is first. */}
      <div className="d-compare-arrive relative">
        {/* `relative`: the sr-only text in the cells is absolutely positioned; without a positioned scroller its
            containing block lies outside, so it escapes the clip and widens the page by the hidden column. */}
        <div
          ref={scrollerRef}
          onFocus={revealFocused}
          onScroll={(event) => setEdge(edgeUpdate(event.currentTarget))}
          data-under={edge.under ? "" : undefined}
          className="d-compare-card relative overflow-x-auto overscroll-x-contain rounded-[24px] bg-surface shadow-soft [scrollbar-width:thin]"
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-left"
            style={{ minWidth: `calc(var(--d-compare-label) + ${n} * var(--d-compare-col))` }}
          >
            <caption className="sr-only">
              {flights.length} flights compared side by side, rated in plain words{" "}
              {priorities.chosen ? "for what matters to you" : "in the usual order"}. Prices are illustrative.
            </caption>
            <colgroup>
              <col style={{ width: "var(--d-compare-label)" }} />
              {columns.map((c) => (
                <col key={c.id} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {/* The label column's corner belongs to no flight: the cloud's place on this page. It looks
                    where the visitor points and nods when a flight is removed or picked; it never sits on a column. */}
                <td className={cn(STICKY, "pb-3.5 pt-4 align-top sm:pt-5")}>
                  <span className="block w-10 sm:w-11">
                    <CloudMascot data-cloud-home float={false} />
                  </span>
                  <span className="mt-2 block text-[11px] font-bold uppercase tracking-wide text-ink-mute max-[399px]:tracking-normal">
                    {flights.length} {flights.length === 1 ? "flight" : "flights"}
                  </span>
                </td>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={cn(CELL, "pb-3.5 pt-4 align-top font-normal sm:pt-5")}>
                    <ColumnHead column={c} forYou={forYou.has(c.id)} chosen={priorities.chosen} />
                  </th>
                ))}
              </tr>
            </thead>

            {/* The rest of each flight's header: where and when, the fare and its difference, the actions. */}
            <tbody>
              <tr className="d-compare-row d-compare-ruled">
                <th scope="row" className={cn(LABEL, BASE, "pb-2.5 pt-3.5")}>
                  Route
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, BASE, "pb-2.5 pt-3.5")}>
                    <Value main={routeText(c.item.origin, c.item.destination)} sub={shortDate(c.item.date)} />
                  </td>
                ))}
              </tr>
              <tr className="d-compare-row">
                <th scope="row" className={cn(LABEL, BASE, "pb-2.5")}>
                  Times
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, BASE, "pb-2.5")}>
                    {isFlightColumn(c) ? (
                      <Value main={<Times column={c} />} />
                    ) : (
                      <p className="text-xs leading-snug text-ink-mute">{unavailableNote(c)}</p>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="d-compare-row">
                <th scope="row" className={cn(LABEL, BASE, "pb-3")}>
                  Fare
                </th>
                {columns.map((c) => {
                  if (!isFlightColumn(c)) {
                    return (
                      <td key={c.id} className={cn(CELL, BASE, "pb-3")}>
                        <NotAvailable />
                      </td>
                    );
                  }
                  const fare = fareAt(c.option, c.daysUntil);
                  const delta = priceDeltaText(fare, cheapestFare);
                  return (
                    <td key={c.id} className={cn(CELL, BASE, "pb-3")}>
                      <span className="block text-2xl font-extrabold leading-tight tracking-[-0.01em] text-ink tabular-nums sm:text-[28px]">
                        {formatFare(fare)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-mute sm:text-xs">one way · illustrative</span>
                      {delta === "Cheapest" ? (
                        <Marker tone="fact">Cheapest</Marker>
                      ) : (
                        <span className="mt-1.5 block text-xs font-semibold leading-snug text-ink-soft tabular-nums">{delta}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="d-compare-row">
                <th scope="row" className={cn(LABEL, "pb-4 align-top")}>
                  <span className="sr-only">Actions</span>
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, "pb-4 align-top")}>
                    {/* Stacked on phones; side by side where the column has room, and Remove drops under Details where it has not. */}
                    <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-2 sm:gap-y-0">
                      {isFlightColumn(c) ? (
                        <Link href={hrefs.flight(c.item)} className={cn(D_PILL_OUTLINE, "h-11 w-full px-3 text-sm sm:w-auto sm:min-w-[7.5rem] sm:px-5")}>
                          Details<span className="sr-only"> for {nameOf(c)}</span>
                        </Link>
                      ) : (
                        // Stacked on phones: keeps this Remove on the same line as the other columns' Remove.
                        <span aria-hidden className="h-11 sm:hidden" />
                      )}
                      <button
                        type="button"
                        data-remove-id={c.id}
                        onClick={() => {
                          onRemove(c.id);
                          nodAfterRemoval();
                        }}
                        className={cn(D_LINK, "inline-flex h-11 items-center gap-1 rounded-full px-2 text-[13px] sm:text-sm")}
                      >
                        <X aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
                        Remove<span className="sr-only"> {nameOf(c)}</span>
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>

            {/* The four ratings in the visitor's order; a tile opens the rating's detail (numbers, how it is worked out).
                Every tile is the same size whatever its words and its tier, so no tier and no flight weighs more. */}
            <tbody className="d-compare-group">
              {groupHead(priorities.chosen ? "Rated for you" : "Ratings", <Sparkles />, priorities.chosen ? "In your order" : "In the usual order", true)}
              {order.map((category) => {
                const lead = rowLeaders(category);
                return (
                  <tr key={category} className="d-compare-row d-compare-ruled d-compare-rating">
                    <th scope="row" className={cn(STICKY, "align-top text-xs font-bold leading-snug text-ink sm:text-sm")}>
                      <span className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
                        <span aria-hidden className="d-compare-badge">
                          <CategoryIcon category={category} size="sm" />
                        </span>
                        {CATEGORY_SHORT[category]}
                      </span>
                    </th>
                    {columns.map((c) => {
                      const rating = isFlightColumn(c) ? ratingOf(c, category) : undefined;
                      return (
                        <td key={c.id} className={cn(CELL, "align-top")}>
                          {rating && isFlightColumn(c) ? (
                            <>
                              {/* The row names the category, so the tile carries the tier alone ("Smooth", "Large jet"). In a
                                  108 px phone column the words wrap between themselves, never inside one, and the chevron
                                  makes way for them below 400 px. */}
                              <RatingButton
                                rating={rating}
                                flightLabel={flightContext(c.flight, c.item)}
                                from="compare"
                                size="sm"
                                labelOnly
                                className="d-compare-tier max-[399px]:[&_svg]:hidden"
                              />
                              {lead.has(c.id) ? <Marker className="mt-2">{ROW_MARK[category]}</Marker> : null}
                            </>
                          ) : (
                            <span className="d-compare-none">
                              <NotAvailable />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            <tbody className="d-compare-group">
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
                <Value main={formatDuration(c.flight.blockMin)} sub="Gate to gate · nonstop" />
              ))}
              {row("Days away", (c) => (
                <Value main={daysAwayLabel(c.daysUntil)} />
              ))}
            </tbody>

            <tbody className="d-compare-group">
              {groupHead("Aircraft", <Plane />)}
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

            <tbody className="d-compare-group">
              {groupHead("Airline", <ShieldCheck />)}
              {row("On time", (c) => (
                <Value
                  main={`${c.flight.airlineStats.onTimePct}%`}
                  sub={`${c.flight.airlineStats.onTimeRoutePct}% on this route · last 12 months`}
                  benchmark={<BenchmarkLine benchmark="onTimePct" value={c.flight.airlineStats.onTimePct} />}
                />
              ))}
            </tbody>

            <tbody className="d-compare-group">
              {groupHead("Who flies it", <UserRound />)}
              {row("Pilots", (c) => {
                const line = crewLine(c.flight.crew, c.flight.aircraft.model);
                return <Value main={line.main} sub={line.sub} />;
              })}
            </tbody>

            <tbody className="d-compare-group">
              {groupHead("Best seat", <Armchair />)}
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
            <tbody className="d-compare-group">
              {groupHead("Your pick", <Heart />, "Nothing is booked")}
              <tr className="d-compare-row d-compare-ruled">
                <th scope="row" className={cn(LABEL, BASE, "pb-5 pt-3.5")}>
                  I&rsquo;d pick
                </th>
                {columns.map((c) => (
                  <td key={c.id} className={cn(CELL, BASE, "pb-5 pt-3.5")}>
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
                        className="d-compare-choose"
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
            "pointer-events-none absolute inset-y-0 right-0 w-14 rounded-r-[24px] bg-linear-to-l from-surface via-surface/75 to-surface/0 transition-opacity duration-200",
            edge.more ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A column's header: the airline's tile (the same ink tile for every airline), its name and the flight number. */
function ColumnHead({ column, forYou, chosen }: { column: Column; forYou: boolean; chosen: boolean }) {
  if (!isFlightColumn(column)) {
    return (
      <span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <AirlineMark code={column.item.key.slice(0, 2)} size="sm" className="d-compare-tile opacity-50" />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold leading-snug text-ink-soft tabular-nums min-[400px]:text-sm sm:text-base">{column.item.key}</span>
          <span className="block text-xs leading-snug text-ink-mute sm:text-[13px]">{UNAVAILABLE_LABEL[column.reason]}</span>
        </span>
      </span>
    );
  }
  const f = column.flight;
  return (
    <>
      <span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <AirlineMark code={f.airline.code} size="sm" className="d-compare-tile" />
        <span className="min-w-0">
          <span className="block text-[13px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere] min-[400px]:text-sm sm:text-base">{f.airline.name}</span>
          <span className="block text-xs font-semibold text-ink-mute tabular-nums sm:text-[13px]">
            {f.flightNumber}
            <span className="sr-only"> on {shortDate(column.item.date)}</span>
          </span>
        </span>
      </span>
      {/* "For you" only once the visitor has said what matters; before that the lead is in the usual order. */}
      {forYou ? <Marker className="mt-2.5">{chosen ? "Smoothest for you" : "Smoothest overall"}</Marker> : null}
    </>
  );
}

function Value({ main, sub, benchmark }: { main: ReactNode; sub?: ReactNode; benchmark?: ReactNode }) {
  return (
    <>
      <span className="block text-[13px] font-bold leading-snug text-ink tabular-nums [overflow-wrap:anywhere] sm:text-[15px]">{main}</span>
      {sub ? <span className="mt-0.5 block text-xs leading-snug text-ink-mute [overflow-wrap:anywhere] sm:text-[13px]">{sub}</span> : null}
      {benchmark ? <span className="d-compare-bench mt-1 block">{benchmark}</span> : null}
    </>
  );
}

/**
 * Quiet fact marker — "Smoothest for you", "Cheapest", "Smoothest". Never advice. A marker that compares
 * ratings wears the rating green; any other fact (the fare) is sky with ink: green only ever means a rating.
 */
function Marker({ children, tone = "rating", className }: { children: ReactNode; tone?: "rating" | "fact"; className?: string }) {
  return (
    <span
      className={cn(
        // 10 px corners: a one-line marker is a pill, and one that wraps in a narrow column stays a tidy tag.
        "mt-1.5 flex w-fit items-center rounded-[10px] px-2 py-0.5 text-[11px] font-bold leading-4",
        tone === "rating" ? "bg-leaf-100 text-leaf-ink" : "bg-sky text-ink",
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
      <span aria-hidden className="text-sm text-ink-mute">
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
          <sup aria-hidden className="ml-0.5 text-[10px] font-bold text-ink-mute">
            {mark}
          </sup>
          <span className="sr-only"> ({dayOffsetWords(f.arriveDayOffset)})</span>
        </>
      ) : null}
    </>
  );
}
