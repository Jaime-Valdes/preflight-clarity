"use client";

import { Link2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TURBULENCE_FORECAST_DAYS, WEATHER_FORECAST_DAYS } from "@preflight/shared/forecast";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { useCompareList } from "@/lib/c/compare-store";
import { MAX_COMPARE, clampDate, itemId, parseCompareParam, type CompareItem, type Hrefs } from "@/lib/c/model";
import { useHrefs, useTool } from "@/components/c/shell/ToolContext";
import { useNowMs, useTodayISO } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { LINK_BUTTON } from "../flight/copy";
import { CompareEmpty } from "./CompareEmpty";
import { CompareSkeleton } from "./CompareSkeleton";
import { CompareTable } from "./CompareTable";
import { assignSlots, flightNames, isFlightColumn, resolveColumns, spoken } from "./facts";
import { track } from "@/lib/analytics";

const NO_IDS: ReadonlySet<string> = new Set();

function sameItems(a: readonly CompareItem[], b: readonly CompareItem[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map(itemId));
  return b.every((i) => ids.has(itemId(i)));
}

/** Where "Add a flight" goes: the results for the first flight's route and day (a date the tool can show). */
function addHrefFor(items: readonly CompareItem[], today: string, hrefs: Hrefs): string | null {
  const first = items[0];
  if (!first) return null;
  return hrefs.search({ origin: first.origin, destination: first.destination, date: clampDate(first.date, today) });
}

/**
 * /c/compare?f=JFK.LAX.2026-11-26.DL1423,… — 2–3 flights side by side (any
 * routes and dates). Without `f` it shows the visitor's compare list, live.
 * Removing a flight updates the URL (router.replace) and the compare list.
 */
export function ComparePage() {
  const params = useSearchParams();
  const router = useRouter();
  const today = useTodayISO();
  // Flights that left earlier today show as such, not as upcoming (updates every minute).
  const nowMs = useNowMs();
  const list = useCompareList();
  const tool = useTool();
  const hrefs = useHrefs();
  const url = useMemo(() => {
    const raw = params.get("f");
    return { fromUrl: raw !== null, raw: raw ?? "", items: parseCompareParam(raw) };
  }, [params]);

  // Flights removed while their new URL is on its way (router.replace is a transition). Forgotten as soon as
  // the URL changes, so going back to a link that includes them shows them again.
  const [pending, setPending] = useState<{ raw: string; ids: ReadonlySet<string> }>({ raw: url.raw, ids: NO_IDS });
  if (pending.raw !== url.raw) setPending({ raw: url.raw, ids: NO_IDS });
  const hiddenIds = pending.raw === url.raw ? pending.ids : NO_IDS;

  const items = url.fromUrl ? url.items : list.items;
  const visible = useMemo(() => items.filter((i) => !hiddenIds.has(itemId(i))), [items, hiddenIds]);
  const columns = useMemo(() => (today ? resolveColumns(visible, today, nowMs) : []), [visible, today, nowMs]);
  const shownCount = columns.filter(isFlightColumn).length;
  useEffect(() => {
    if (today) track(`${tool.events}_compare_view`, { flights: shownCount, from_link: url.fromUrl });
  }, [today, shownCount, url.fromUrl, tool.events]);
  const flights = useMemo(() => columns.filter(isFlightColumn), [columns]);
  const names = useMemo(() => flightNames(flights), [flights]);

  // Each flight keeps its colour and dash while others are removed (assignSlots).
  const slotKey = flights.map((c) => c.id).join(",");
  const [slotState, setSlotState] = useState<{ key: string; slots: ReadonlyMap<string, number> }>(() => ({
    key: "",
    slots: new Map(),
  }));
  let slots = slotState.slots;
  if (slotState.key !== slotKey) {
    slots = assignSlots(
      flights.map((c) => c.id),
      slotState.slots,
    );
    setSlotState({ key: slotKey, slots });
  }

  const [announcement, setAnnouncement] = useState("");
  /** Where focus goes after a change that removes the focused control: a Remove button, or the heading. */
  const [focusRequest, setFocusRequest] = useState<{ id: string | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.id
      ? document.querySelector<HTMLElement>(`[data-remove-id="${CSS.escape(focusRequest.id)}"]`)
      : null;
    if (target) target.focus({ preventScroll: true });
    else headingRef.current?.focus();
  }, [focusRequest]);

  const remove = (id: string) => {
    const index = columns.findIndex((c) => c.id === id);
    const removed = columns[index];
    if (!removed) return;
    const rest = visible.filter((i) => itemId(i) !== id);
    list.remove(id);
    if (url.fromUrl) {
      setPending((prev) => ({ raw: url.raw, ids: new Set([...(prev.raw === url.raw ? prev.ids : []), id]) }));
      // An emptied link stays a link ("?f="): without `f` the page would switch to the visitor's own list.
      router.replace(rest.length ? hrefs.compare(rest) : `${tool.base}/compare?f=`, { scroll: false });
    }
    const name = spoken(isFlightColumn(removed) ? (names.get(id) ?? removed.flight.flightNumber) : removed.item.key);
    const left = rest.length;
    setAnnouncement(`Removed ${name}. ${left === 0 ? "No flights left to compare." : left === 1 ? "One flight left." : `${left} flights left.`}`);
    // With two or more flights still side by side, focus the neighbouring column's Remove; otherwise the heading.
    const stillCompared = flights.filter((c) => c.id !== id).length >= 2;
    const neighbour = columns[index + 1] ?? columns[index - 1];
    setFocusRequest({ id: stillCompared && neighbour ? neighbour.id : null });
  };

  // A shared link's flights can become the visitor's own compare list (what the tray and results pages use) —
  // only the ones that can still be shown. Not offered when the link is the list (with or without those).
  const keepItems = flights.map((c) => c.item);
  const offerKeep =
    url.fromUrl && keepItems.length > 0 && !sameItems(url.items, list.items) && !sameItems(keepItems, list.items);
  const keep = () => {
    list.replace(keepItems);
    setAnnouncement(`Your compare list now has these ${keepItems.length} ${keepItems.length === 1 ? "flight" : "flights"}.`);
    setFocusRequest({ id: null });
  };

  if (!today || nowMs === null) return <CompareSkeleton />;

  const comparing = flights.length >= 2;
  const addHref = addHrefFor(visible, today, hrefs);
  // A flight whose date has passed doesn't take up one of the places.
  const canAdd = visible.filter((i) => i.date >= today).length < MAX_COMPARE;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[26px] font-bold leading-tight tracking-tight text-ink-900 outline-none sm:text-[30px]"
          >
            Compare flights
          </h1>
          <p className="mt-1 text-sm leading-snug text-ink-500">
            {comparing
              ? `${flights.length} flights side by side. Prices and forecasts are illustrative.`
              : "Up to three flights side by side, each with its pre-flight picture."}
          </p>
        </div>
        {comparing ? (
          canAdd && addHref ? (
            <Link href={addHref} className={cn(LINK_BUTTON.secondary, "shrink-0")}>
              <Plus aria-hidden className="size-4" strokeWidth={2.5} />
              Add a flight
            </Link>
          ) : (
            <p className="text-xs leading-snug text-ink-500">Up to {MAX_COMPARE} flights. Remove one to add another.</p>
          )
        ) : null}
      </div>

      {offerKeep ? (
        <div className="mt-4 flex flex-col items-start gap-x-3 rounded-2xl bg-breeze-50 py-2 pl-4 pr-1.5 text-[13px] leading-snug text-ink-700 ring-1 ring-inset ring-breeze-100 sm:flex-row sm:items-center sm:py-1.5">
          <p className="flex min-w-0 flex-1 gap-2 pr-2.5 pt-1 sm:py-1.5">
            <Link2 aria-hidden className="mt-px size-4 shrink-0 text-breeze-700" />
            {list.items.length === 0
              ? "These flights came from a link."
              : `These flights came from a link. Your compare list has ${list.items.length} ${list.items.length === 1 ? "other flight" : "other flights"}.`}
          </p>
          <button
            type="button"
            onClick={keep}
            className="-ml-3.5 h-11 shrink-0 rounded-full px-3.5 text-sm font-semibold text-breeze-700 transition-colors hover:bg-surface sm:ml-0"
          >
            {list.items.length === 0 ? "Keep them in my compare list" : "Use these as my compare list"}
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        {comparing ? (
          <CompareTable columns={columns} slots={slots} names={names} onRemove={remove} />
        ) : (
          <CompareEmpty
            columns={columns}
            badLink={url.fromUrl && url.raw.trim() !== "" && url.items.length === 0}
            addHref={addHref}
            onRemove={remove}
          />
        )}
      </div>

      {comparing ? (
        <p className="mt-3 px-1 text-xs leading-relaxed text-ink-500">
          Each flight&rsquo;s turbulence forecast starts {TURBULENCE_FORECAST_DAYS} days before departure and its weather
          forecast {WEATHER_FORECAST_DAYS} days before; until then the table says when. Safety scores reflect IOSA audit
          status, regulator oversight, accident record and fleet age. Airlines don&rsquo;t publish who will fly a given
          flight, so &ldquo;Who flies it&rdquo; lists the rules every airline pilot meets. Open seats are as of today and
          change until check-in. All flights, prices and forecasts are illustrative — nothing can be booked here.
        </p>
      ) : null}

      {/* After the table or the empty state (docs/INTEREST.md): interest peaks right after comparing. */}
      <InterestCard
        placement="c_compare"
        context={comparing ? `${flights.length} flights compared` : flights.length === 1 ? "1 flight picked" : ""}
        className={cn("mt-6", !comparing && "mx-auto max-w-[640px]")}
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
