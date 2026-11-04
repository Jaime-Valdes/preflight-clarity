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
import { D_PILL_OUTLINE, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { RatingPill } from "@/components/d/ratings/RatingPill";
import { formatFare } from "@/lib/c/format";
import { usePriorities } from "@/lib/d/priorities";
import { cn } from "@/lib/cn";

/**
 * Version D's compare page with fewer than two flights to show: what the page
 * does, the one flight already picked (with its top rating as a pill, never a
 * score) and a way back to the results. Same props as version C's CompareEmpty.
 * Look: docs/ui-d-theme.md.
 */

/** The one primary action: a full-width black pill on phones. */
const PRIMARY = cn(D_PILL_PRIMARY, "h-14 w-full px-6 text-[17px] sm:w-auto sm:min-w-[14rem]");
export function DCompareEmpty({ columns, badLink, addHref, onRemove }: CompareEmptyProps) {
  const hrefs = useHrefs();
  const flight = columns.find(isFlightColumn);
  const unavailable = columns.filter((c): c is UnavailableColumn => !isFlightColumn(c));

  return (
    <section className="mx-auto max-w-[640px] animate-d-rise rounded-[24px] bg-surface p-5 shadow-soft sm:p-7">
      <CloudMascot className="w-24" />
      <h2 className="mt-4 text-balance text-[24px] font-extrabold leading-tight tracking-tight text-ink">
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
    <div className="rounded-2xl bg-canvas/70 p-3.5">
      <div className="flex items-start gap-3">
        <AirlineMark code={f.airline.code} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-ink">
            {f.airline.name} · <span className="whitespace-nowrap tabular-nums">{f.flightNumber}</span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-ink-mute tabular-nums">
            {routeText(column.item.origin, column.item.destination)} · {shortDate(column.item.date)} · {formatTime12(f.departTime)}
          </p>
          {top ? (
            <div className="mt-2">
              <RatingPill rating={top} size="sm" />
            </div>
          ) : null}
        </div>
        <p className="shrink-0 text-base font-extrabold text-ink tabular-nums">{formatFare(fareFor(column.option, column.daysUntil))}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={hrefs.flight(column.item)} className={cn(D_PILL_OUTLINE, "h-11 px-3 text-sm")}>
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
    <div className="flex items-center gap-3 rounded-2xl bg-canvas/70 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-ink-700 tabular-nums">
          {column.item.key} · {routeText(column.item.origin, column.item.destination)} · {shortDate(column.item.date)}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-ink-500">{unavailableNote(column)}</p>
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
      onClick={() => onRemove(id)}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-bold text-ink-mute transition-colors hover:bg-surface hover:text-ink"
    >
      <X aria-hidden className="size-4 shrink-0" />
      Remove<span className="sr-only"> {label}</span>
    </button>
  );
}
