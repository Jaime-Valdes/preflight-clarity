"use client";

import { ArrowLeftRight, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { formatTime12 } from "@preflight/shared/dates";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { ScoreBadge } from "@/components/c/common/ScoreBadge";
import { Card } from "@/components/ui/Card";
import { formatFare } from "@/lib/c/format";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { cn } from "@/lib/cn";
import { LINK_BASE, LINK_BUTTON, LINK_TONE, fareFor, routeText, shortDate } from "../flight/copy";
import { PendingNote } from "../flight/PendingNote";
import { isFlightColumn, unavailableNote, type Column, type FlightColumn, type UnavailableColumn } from "./facts";

interface CompareEmptyProps {
  /** At most one flight that can be shown, plus any that no longer can. */
  columns: readonly Column[];
  /** The page had a compare link, but nothing in it could be read. */
  badLink: boolean;
  /** Results to add a flight from (the picked flight's route and day), or null to start a search. */
  addHref: string | null;
  onRemove: (id: string) => void;
}

/**
 * Version C compare page with fewer than two flights to show: what the page
 * does, the one flight already picked (if any) and a way back to the results.
 */
export function CompareEmpty({ columns, badLink, addHref, onRemove }: CompareEmptyProps) {
  const hrefs = useHrefs();
  const flight = columns.find(isFlightColumn);
  const unavailable = columns.filter((c): c is UnavailableColumn => !isFlightColumn(c));

  return (
    <Card className="mx-auto max-w-[640px] animate-fade-up p-5 sm:p-7">
      <div
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
      >
        <ArrowLeftRight className="size-5" />
      </div>
      <h2 className="mt-4 text-xl font-bold leading-tight text-ink-900">
        {flight ? "Add one more flight" : "Nothing to compare yet"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
        {flight
          ? "Pick another flight to see the two side by side — from the same day, another date or another route."
          : "Tap Compare on two or three flights in the search results and they’ll appear here side by side: schedule, aircraft, who flies it, weather and — close to departure — smoothness and the turbulence timeline."}
      </p>
      {badLink ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-500">The compare link doesn&rsquo;t include any flights we recognise.</p>
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
          <Link href={addHref} className={LINK_BUTTON.primary}>
            <Plus aria-hidden className="size-4" strokeWidth={2.5} />
            Add a flight
          </Link>
        ) : (
          <Link href={hrefs.home} className={LINK_BUTTON.primary}>
            <Search aria-hidden className="size-4" />
            Search flights
          </Link>
        )}
      </div>
    </Card>
  );
}

function PickedFlight({ column, onRemove }: { column: FlightColumn; onRemove: (id: string) => void }) {
  const hrefs = useHrefs();
  const f = column.flight;
  const label = `${f.flightNumber}, ${shortDate(column.item.date)}`;
  return (
    <div className="rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
      <div className="flex items-start gap-3">
        <AirlineMark code={f.airline.code} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-ink-900">
            {f.airline.name} · <span className="whitespace-nowrap tabular-nums">{f.flightNumber}</span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-ink-500 tabular-nums">
            {routeText(column.item.origin, column.item.destination)} · {shortDate(column.item.date)} ·{" "}
            {formatTime12(f.departTime)}
          </p>
          <div className="mt-2">
            {column.avail.turbulence ? (
              <ScoreBadge score={f.smoothness.score} label={f.smoothness.label} size="sm" />
            ) : (
              <PendingNote item="turbulence" date={column.item.date} subject="Smoothness score" />
            )}
          </div>
        </div>
        <p className="shrink-0 text-base font-bold text-ink-900 tabular-nums">{formatFare(fareFor(column.option, column.daysUntil))}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={hrefs.flight(column.item)} className={cn(LINK_BASE, LINK_TONE.secondary, "h-11 px-3")}>
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
    <div className="flex items-center gap-3 rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
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
      className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold text-ink-500 transition-colors hover:bg-surface hover:text-ink-900"
    >
      <X aria-hidden className="size-4 shrink-0" />
      Remove<span className="sr-only"> {label}</span>
    </button>
  );
}
