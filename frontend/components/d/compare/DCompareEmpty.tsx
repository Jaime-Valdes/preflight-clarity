"use client";

import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { addDays, formatTime12 } from "@preflight/shared/dates";
import { orderByPriorities, rateFlight } from "@preflight/shared/ratings";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import type { CompareEmptyProps } from "@/components/c/compare/ComparePage";
import { isFlightColumn, unavailableNote, type FlightColumn, type UnavailableColumn } from "@/components/c/compare/facts";
import { fareFor, routeText, shortDate } from "@/components/c/flight/copy";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { D_LINK, D_PILL_OUTLINE, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { cloudReact } from "@/components/d/cloud/react";
import { RatingPill } from "@/components/d/ratings/RatingPill";
import { formatFare } from "@/lib/c/format";
import { usePriorities } from "@/lib/d/priorities";
import { cn } from "@/lib/cn";

/**
 * Version D's compare page with fewer than two flights to show: what the page
 * does, the one flight already picked (with its top rating as a pill, never a
 * score) and a way back to the results. Same props as version C's CompareEmpty.
 * Look (docs/ui-d-cinematic.md, "Compare and the small states"): a paper card with
 * the cloud on its stage, one bold line, one quiet line and one royal pill, under
 * the golden afternoon; the card settles in without ever being invisible.
 */

/** The one primary action: a full-width royal pill on phones. */
const PRIMARY = cn(D_PILL_PRIMARY, "h-14 w-full px-6 text-[17px] sm:w-auto sm:min-w-[14rem]");
export function DCompareEmpty({ columns, badLink, addHref, onRemove }: CompareEmptyProps) {
  const hrefs = useHrefs();
  const flight = columns.find(isFlightColumn);
  const unavailable = columns.filter((c): c is UnavailableColumn => !isFlightColumn(c));

  return (
    <section className="d-compare-rise mx-auto max-w-[640px] rounded-[24px] bg-surface p-5 shadow-soft sm:p-7">
      <CloudMascot data-cloud-stage className="w-24" />
      {/* The drawing leaves room under the cloud for its float: the heading sits close. */}
      <h2 className="mt-1.5 text-balance text-[24px] font-extrabold leading-tight tracking-tight text-ink">
        {flight ? "Add one more flight" : "Nothing to compare yet"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {flight
          ? "Pick another flight to see the two side by side — from the same day, another date or another route."
          : "Tap Compare on two or three flights in the results and they’ll appear here side by side: their ratings in your order, the price and its difference, schedule, aircraft, who flies it and the best seat."}
      </p>
      {badLink ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-mute">The compare link doesn&rsquo;t include any flights we recognise.</p>
      ) : null}

      {flight || unavailable.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2.5">
          {flight ? (
            <li>
              <PickedFlight column={flight} onRemove={onRemove} />
            </li>
          ) : null}
          {unavailable.map((c) => (
            <li key={c.id}>
              <UnavailableFlight column={c} onRemove={onRemove} />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        {addHref ? (
          <Link href={addHref} className={PRIMARY}>
            <Plus aria-hidden className="size-5" strokeWidth={2.5} />
            Add a flight
          </Link>
        ) : (
          <Link href={hrefs.home} className={PRIMARY}>
            <Search aria-hidden className="size-5" />
            Search flights
          </Link>
        )}
      </div>
    </section>
  );
}

function PickedFlight({ column, onRemove }: { column: FlightColumn; onRemove: (id: string) => void }) {
  const hrefs = useHrefs();
  const priorities = usePriorities();
  const f = column.flight;
  const label = `${f.flightNumber}, ${shortDate(column.item.date)}`;
  // Today from the column: its date minus its (never negative) distance in days.
  const top = orderByPriorities(rateFlight({ option: column.option, today: addDays(column.item.date, -column.daysUntil) }), priorities.order)[0];
  return (
    <div className="rounded-[18px] bg-sky/60 p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        {/* The same ink tile for every airline (app/d/d-compare.css). */}
        <AirlineMark code={f.airline.code} className="d-compare-tile" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-snug text-ink sm:text-[15px]">
            {f.airline.name} · <span className="whitespace-nowrap tabular-nums">{f.flightNumber}</span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-ink-mute tabular-nums sm:text-[13px]">
            {routeText(column.item.origin, column.item.destination)} · <span className="whitespace-nowrap">{shortDate(column.item.date)}</span> ·{" "}
            <span className="whitespace-nowrap">{formatTime12(f.departTime)}</span>
          </p>
          {top ? (
            <div className="mt-2">
              <RatingPill rating={top} size="sm" />
            </div>
          ) : null}
        </div>
        <p className="shrink-0 text-lg font-extrabold leading-snug text-ink tabular-nums">{formatFare(fareFor(column.option, column.daysUntil))}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link href={hrefs.flight(column.item)} className={cn(D_PILL_OUTLINE, "h-11 min-w-0 flex-1 px-3 text-sm sm:max-w-[11rem]")}>
          Details<span className="sr-only"> for {label}</span>
        </Link>
        <RemoveButton id={column.id} label={label} onRemove={onRemove} />
      </div>
    </div>
  );
}

function UnavailableFlight({ column, onRemove }: { column: UnavailableColumn; onRemove: (id: string) => void }) {
  const label = `${column.item.key}, ${shortDate(column.item.date)}`;
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-sky/60 p-3.5 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-ink-soft tabular-nums">
          {column.item.key} · {routeText(column.item.origin, column.item.destination)} ·{" "}
          <span className="whitespace-nowrap">{shortDate(column.item.date)}</span>
        </p>
        <p className="mt-0.5 text-xs leading-snug text-ink-mute">{unavailableNote(column)}</p>
      </div>
      <RemoveButton id={column.id} label={label} onRemove={onRemove} />
    </div>
  );
}

function RemoveButton({ id, label, onRemove }: { id: string; label: string; onRemove: (id: string) => void }) {
  return (
    <button
      type="button"
      data-remove-id={id}
      onClick={() => {
        onRemove(id);
        // The cloud's "noted", the same for every flight; a frame later, when the card shows what is left.
        window.requestAnimationFrame(() => cloudReact("nod"));
      }}
      className={cn(D_LINK, "inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm")}
    >
      <X aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
      Remove<span className="sr-only"> {label}</span>
    </button>
  );
}
