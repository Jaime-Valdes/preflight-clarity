"use client";

import { Armchair, ChevronDown, ChevronLeft, Layers, Plane, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { compareToBenchmark, type Comparison } from "@preflight/shared/benchmarks";
import { availabilityFor, getForecastStatus } from "@preflight/shared/forecast";
import { orderByPriorities, rateFlight } from "@preflight/shared/ratings";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import type { BodyType, Flight, SectionContext } from "@preflight/shared/types";
import { daysToDeparture, hasLeft } from "@/components/c/common/availability";
import { crewLine, crewRules, openSeat, smoothestZone, yearsText } from "@/components/c/compare/facts";
import { BenchmarkLine } from "@/components/c/flight/BenchmarkLine";
import { flightContext, monthDay, routeText } from "@/components/c/flight/copy";
import { FareCard } from "@/components/c/flight/FareCard";
import type { FlightDetailProps } from "@/components/c/flight/FlightPage";
import { FlightSections, type CSectionId, type SectionOverride } from "@/components/c/flight/FlightSections";
import { OtherFlights } from "@/components/c/flight/OtherFlights";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { ExploreContext, type ExploreApi } from "@/components/dashboard/explore/context";
import { possessive } from "@/components/dashboard/trust/format";
import { D_LINK } from "@/components/d/brand/buttons";
import { cloudReact } from "@/components/d/cloud/react";
import { flyFromTray, flyToTray } from "@/components/d/motion/tray";
import { RatingPill } from "@/components/d/ratings/RatingPill";
import { RatingRows } from "@/components/d/ratings/RatingRows";
import { track } from "@/lib/analytics";
import { useCompareList } from "@/lib/c/compare-store";
import { formatFare } from "@/lib/c/format";
import { itemId, type CompareItem } from "@/lib/c/model";
import { usePriorities } from "@/lib/d/priorities";
import { priceDeltaText, ratingsByKey } from "@/lib/d/view";
import { useNowMs } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { ChooseButton, priceStanding, tierProps } from "./ChooseButton";
import { DFlightHeader } from "./DFlightHeader";

/*
 * Version D's flight page (docs/ITERATION_2.md): reassurance first — who
 * flies the plane, the aircraft in plain words, the best seat, the airline's
 * record against the industry average — then the four ratings in the
 * visitor's order, "I'd pick this flight", the fare with "Add to compare",
 * the sign-up ask, "More detail" (the dashboard sections, collapsed) and the
 * day's other flights. No smoothness score and no timeline above the detail
 * layer. Same props as version C's FlightDetail, so FlightPage can show either.
 * Look: docs/ui-d-cinematic.md ("Flight"); the page's own CSS is app/d/d-flight.css.
 */

const OTHERS_ID = "other-flights";

/** The flight page's concrete ask (docs/INTEREST.md, version D). */
export const D_FLIGHT_INTEREST = {
  title: "Get smoothness ratings for your real trip",
  body: "Cloud9 is a prototype today. Leave your email and we’ll let you know when it can rate a real flight — one email, no spam.",
  button: "Notify me when it’s live",
} as const;

/** The one question the pick answers (the same words on phones and in the sticky column). */
const PICK_QUESTION = "Would you take this flight, at this price, for how it is rated? Tell us with one tap.";

/** What the body type means for a passenger, in one sentence (the ratings model treats a wide-body as never bumpier). */
const BODY_SENTENCE: Record<BodyType, string> = {
  narrow: "Narrow-body means a single-aisle cabin — the everyday airliner on routes like this one.",
  wide: "Wide-body means two aisles and a bigger, heavier jet, which rides through bumps a little more steadily.",
};

/** The airline's comfort index in words (shared/src/benchmarks.ts): the verdict leads, the figure follows in small print. */
const COMFORT_VERDICT: Record<Comparison["verdict"], string> = {
  better: "Comfort above average",
  "about average": "Comfort about average",
  worse: "Comfort a little below average",
};

/**
 * Under "More detail", the airline section is named plainly and its collapsed line gives the on-time
 * figure only: no score for a named airline at the surface of the detail layer (the score stays inside).
 */
const SECTION_OVERRIDES: Partial<Record<CSectionId, SectionOverride>> = {
  airline: { title: "Airline", teaser: (flight) => `${flight.airlineStats.onTimePct}% on time, last 12 months` },
};

/** "regulator oversight (FAA)"; a generic regulator name reads as is — the AirlineSection's wording. */
function oversightLabel(regulator: string): string {
  const name = regulator.trim();
  if (!name || /^the /i.test(name)) return `oversight by ${name || "the national aviation authority"}`;
  return `regulator oversight (${name})`;
}

/**
 * The soft tint behind a reassurance card's outlined icon. Cream or sky, never leaf, sun or amber:
 * those three only ever mean a rating (docs/ui-d-cinematic.md, house rule 2).
 */
type Tint = "cream" | "sky";
const CARD_TINT: Record<Tint, string> = {
  cream: "bg-cream",
  sky: "bg-sky",
};

/** A white card in the D look. */
const CARD = "rounded-[24px] bg-surface shadow-soft";

/** Version D has no exploration strip either: the sections only need neutral copy and somewhere to keep their state. */
function noop(): void {}

export function DFlightDetail({ day, option, options, today, position }: FlightDetailProps) {
  const hrefs = useHrefs();
  const priorities = usePriorities();
  const { flight } = option;
  const { aircraft, airlineStats: stats } = flight;
  // The flight's own airports: a search from LGA can list JFK's long-haul flights, and one flight is one compare item.
  const item: CompareItem = { origin: flight.origin.code, destination: flight.destination.code, date: day.date, key: option.key };
  // The real distance from today: the sections show only what exists by then (docs/FEASIBILITY.md).
  const daysUntil = daysToDeparture(today, flight.input.date);
  const availability = availabilityFor(daysUntil);
  const history = flight.turbulence.history;
  const ctx = useMemo<SectionContext>(
    () => ({ daysUntil, forecast: getForecastStatus(daysUntil, history), variant: "A", preview: false }),
    [daysUntil, history],
  );

  // Every flight's ratings that day (this one's among them): the rows, the pick's tiers and the other flights' pills.
  const allRatings = useMemo(() => ratingsByKey(options, today), [options, today]);
  const ratings = useMemo(() => allRatings.get(option.key) ?? rateFlight({ option, today }), [allRatings, option, today]);
  const ordered = useMemo(() => orderByPriorities(ratings, priorities.order), [ratings, priorities.order]);
  const aircraftRating = ratings.find((r) => r.category === "aircraft");
  const label = flightContext(flight, day);

  // Where this flight stands among the day's flights still to leave (the "vs cheapest" line and analytics):
  // its fare at this lead time, its rank and the dollars over the cheapest. Flights that left earlier today
  // are out of it, as on the results page, so a flight the results called cheapest is cheapest here too.
  const nowMs = useNowMs();
  const mayHaveLeft = daysUntil <= 1;
  const live = useMemo(
    () => (mayHaveLeft ? options.filter((o) => !hasLeft(o.flight, nowMs)) : options),
    [options, mayHaveLeft, nowMs],
  );
  const price = fareAt(option, daysUntil);
  const fares = useMemo(() => live.map((o) => fareAt(o, daysUntil)), [live, daysUntil]);
  const standing = priceStanding(price, fares);
  const isCheapest = standing.dollars_over_cheapest === 0;
  const delta = priceDeltaText(price, fares.length ? Math.min(...fares) : null);
  const tiers = tierProps(ratings);
  useEffect(() => {
    track("d_flight_view", {
      key: option.key,
      origin: flight.origin.code,
      destination: flight.destination.code,
      days_until: daysUntil,
      has_scores: availability.turbulence,
      price,
      is_cheapest: isCheapest,
      position,
      cruise_tier: tiers.cruise_tier,
      takeoff_landing_tier: tiers.takeoff_landing_tier,
      aircraft_tier: tiers.aircraft_tier,
      space_tier: tiers.space_tier,
      price_rank: standing.price_rank,
      dollars_over_cheapest: standing.dollars_over_cheapest,
    });
  }, [
    option.key,
    flight.origin.code,
    flight.destination.code,
    daysUntil,
    availability.turbulence,
    price,
    isCheapest,
    position,
    tiers.cruise_tier,
    tiers.takeoff_landing_tier,
    tiers.aircraft_tier,
    tiers.space_tier,
    standing.price_rank,
    standing.dollars_over_cheapest,
  ]);

  // What the section bodies keep for this flight (the chosen seat…); see useFlightState.
  const [bodyState, setBodyState] = useState<Readonly<Record<string, unknown>>>({});
  const explore = useMemo<ExploreApi>(
    () => ({
      openAlternative: noop,
      canOpen: () => false,
      openWhatIf: noop,
      switchTo: noop,
      compare: noop,
      // Neutral copy everywhere: "this flight", never "your flight".
      showingOwnFlight: false,
      flightState: (key: string) => bodyState[key],
      setFlightState: (key: string, value: unknown) => setBodyState((prev) => ({ ...prev, [key]: value })),
    }),
    [bodyState],
  );

  const crew = crewLine(flight.crew, aircraft.model);
  const rules = crewRules(flight.crew);
  const zone = smoothestZone(flight);
  const seat = openSeat(flight);
  const comfort = compareToBenchmark("comfortScore", stats.comfortScore);
  const reassureId = useId();
  const ratedId = useId();

  // The visitor's compare list in the order the tray shows it (the tray leaves out flights whose day has passed).
  const compare = useCompareList();
  const trayIds = compare.items.filter((i) => i.date >= today).map(itemId);

  /**
   * "Add to compare" and "Remove" in the fare card, and "Compare" beside each of the day's other flights, are
   * shared components: they cannot call D's motion kit. Their clicks pass through this handler on the way up,
   * after the component has changed the list and before the page is drawn again, and each is acknowledged as
   * D's own compare buttons are (docs/ui-d-cinematic.md, "Small interactions"): a small plane from the control
   * to the tray for an add, from the tray's chip back to the control for a removal, and the same nod for both.
   * It reads which control was pressed and that flight's place in the visitor's own list: nothing about the
   * flight itself. A control that is switched off (the list is full) changes nothing and gets nothing.
   */
  const acknowledgeCompare = (event: MouseEvent<HTMLDivElement>) => {
    const control = event.target instanceof Element ? event.target.closest("button") : null;
    if (!control || control.getAttribute("aria-disabled") === "true") return;
    if (control.closest(".d-flight-fare")) {
      // The fare card holds one button at a time: "Remove" (it says so in its label), or "Add to compare".
      if (control.getAttribute("aria-label") === "Remove from compare") flyFromTray(trayIds.indexOf(itemId(item)), control);
      // The pressed button is about to be replaced by its counterpart; the box around the two stays.
      else flyToTray(control.parentElement);
    } else if (control.hasAttribute("aria-pressed") && control.closest(`#${OTHERS_ID}`)) {
      if (control.getAttribute("aria-pressed") === "true") {
        // Which flight the row is, from the "Details" link beside the toggle.
        const query = control.parentElement?.querySelector("a[href]")?.getAttribute("href")?.split("?")[1];
        const link = new URLSearchParams(query ?? "");
        flyFromTray(trayIds.indexOf(`${link.get("from")}.${link.get("to")}.${link.get("date")}.${link.get("f")}`), control);
      } else {
        flyToTray(control);
      }
    } else {
      return;
    }
    cloudReact("nod");
  };

  /** The pick, with everything the event needs (one on phones under the header, one in the sticky column). */
  const chooseButton = (className: string) => (
    <ChooseButton
      item={item}
      option={option}
      options={live}
      daysUntil={daysUntil}
      ratings={ratings}
      order={priorities.order}
      position={position}
      from="flight"
      className={className}
    />
  );

  /** The other flights' top rating in the visitor's order, as a plain pill where version C shows the score. */
  const badge = (o: FlightOption) => {
    const top = orderByPriorities(allRatings.get(o.key) ?? [], priorities.order)[0];
    return top ? <RatingPill rating={top} size="sm" /> : null;
  };

  return (
    <div className="mx-auto w-full max-w-[640px] lg:max-w-none">
      <Link href={hrefs.search(day)} className={cn(D_LINK, "-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm")}>
        <ChevronLeft aria-hidden className="size-4 shrink-0" />
        <span>
          All flights {routeText(day.origin, day.destination)}, {monthDay(day.date)}
        </span>
      </Link>

      <ExploreContext.Provider value={explore}>
        {/* Phones: one column in reading order. Laptops: the pick and the fare in a sticky column on the right.
            The gap above (30 px, 32 px from 640 px) is the companion's: perched on the pass it rises 24 to 26 px
            over the pass's top edge, and it must not reach the back link or its focus ring. */}
        <div onClick={acknowledgeCompare} className="mt-[30px] grid grid-cols-1 gap-4 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8">
          {/* Focus lands here when another flight is opened from this page (see FlightPage). */}
          <div data-flight-top tabIndex={-1} className="min-w-0 rounded-[24px] outline-none lg:col-start-1">
            <DFlightHeader flight={flight} daysUntil={daysUntil} className="animate-d-rise" />
          </div>

          {/* Phones: the fare and the one question within reach of the first screen, not three screens down
              (at lg the sticky column does this). The ratings follow; the pick can be changed any time. */}
          <div className={cn(CARD, "animate-d-rise p-5 [animation-delay:60ms] lg:hidden")}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute">Your pick</h2>
                <p className="mt-1 text-[14px] leading-snug text-ink-soft">{PICK_QUESTION}</p>
              </div>
              <p className="shrink-0 text-right">
                <span className="block text-[26px] font-extrabold leading-none tracking-[-0.01em] text-ink tabular-nums">{formatFare(price)}</span>
                <span className="mt-1 block text-[11px] leading-snug text-ink-mute">one way · illustrative</span>
                {isCheapest ? (
                  // A price fact, not a rating: sky with ink text, never a tier colour.
                  <span className="mt-1.5 inline-flex rounded-full bg-sky px-2 py-0.5 text-[11px] font-bold leading-4 text-ink">Cheapest</span>
                ) : (
                  <span className="mt-1 block text-xs font-bold leading-snug text-ink-soft tabular-nums">{delta}</span>
                )}
              </p>
            </div>
            {chooseButton("mt-4")}
          </div>

          {/* Reassurance first: four plain cards, each a glance. */}
          <section aria-labelledby={reassureId} className="min-w-0 animate-d-rise [animation-delay:120ms] lg:col-start-1">
            <h2 id={reassureId} className="sr-only">
              Good to know
            </h2>
            {/* Two columns from 640 px, filled column by column: the two short cards share the top row and the
                two long ones the bottom row, so no card is stretched far past its own content. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[auto_auto]">
              <ReassureCard
                icon={<UserRound />}
                tint="cream"
                title="Who flies this plane"
                foot="Airlines don’t publish who will fly a given flight — these are the rules every airline pilot meets."
              >
                <Facts>
                  <Fact main={crew.main} sub={crew.sub} />
                  <Fact main={rules.licence.main} sub={rules.licence.sub} />
                  <Fact main={rules.checks.main} sub={rules.checks.sub} />
                </Facts>
              </ReassureCard>

              <ReassureCard icon={<Plane />} tint="sky" title="Your aircraft in plain words">
                {aircraftRating ? (
                  <>
                    <RatingPill rating={aircraftRating} />
                    <p className="mt-2.5 text-[14px] leading-relaxed text-ink-soft">{aircraftRating.meaning}</p>
                  </>
                ) : null}
                <p className="mt-2 text-[13px] leading-snug text-ink-mute">{BODY_SENTENCE[aircraft.bodyType]}</p>
                <Facts className="mt-3">
                  {availability.airframe ? (
                    <Fact
                      main={
                        <>
                          {aircraft.fullName} · <span className="whitespace-nowrap">{aircraft.tailNumber}</span>
                        </>
                      }
                      sub={`Assigned aircraft · ${yearsText(aircraft.ageYears)} old, delivered ${aircraft.deliveredYear} · can change before departure`}
                      benchmark={<BenchmarkLine benchmark="fleetAgeYears" value={aircraft.ageYears} />}
                    />
                  ) : (
                    <Fact
                      main={aircraft.fullName}
                      sub={`Scheduled aircraft · ${possessive(flight.airline.name)} ${aircraft.model}s average ${yearsText(aircraft.fleetAvgAgeYears)} old`}
                      benchmark={<BenchmarkLine benchmark="fleetAgeYears" value={aircraft.fleetAvgAgeYears} />}
                    />
                  )}
                </Facts>
              </ReassureCard>

              <ReassureCard
                icon={<Armchair />}
                tint="sky"
                title="Best seat"
                foot="As of today — seats change until check-in. The seat map is under More detail."
              >
                <Facts>
                  <Fact main={zone.main} sub={zone.sub} />
                  {seat ? (
                    <Fact main={`Seat ${seat.seat}`} sub={seat.detail} />
                  ) : (
                    <Fact main="None open right now in that zone" sub="Seats change until check-in" />
                  )}
                </Facts>
              </ReassureCard>

              <ReassureCard
                icon={<ShieldCheck />}
                tint="cream"
                title="Airline record"
                // The airline's safety basis, worded as the airline section does — a footnote, never a rating or a figure here.
                foot={`On time means arriving within 15 minutes of schedule. The airline section under More detail also covers the airline’s IOSA safety-audit status, ${oversightLabel(flight.crew.regulator)}, accident record and fleet age.`}
              >
                <Facts>
                  <Fact
                    main={`${stats.onTimePct}% on time`}
                    sub={`Across the airline, last 12 months · ${stats.onTimeRoutePct}% on this route`}
                    benchmark={<BenchmarkLine benchmark="onTimePct" value={stats.onTimePct} />}
                  />
                  <Fact
                    main={COMFORT_VERDICT[comfort.verdict]}
                    sub={`Legroom, seat width, cabin noise and what’s on board · ${stats.comfortScore.toFixed(1)} / 10`}
                    benchmark={<BenchmarkLine benchmark="comfortScore" value={stats.comfortScore} />}
                  />
                </Facts>
              </ReassureCard>
            </div>
          </section>

          {/* The four ratings, in the visitor's order; each opens its detail sheet. */}
          <section aria-labelledby={ratedId} className="min-w-0 animate-d-rise [animation-delay:180ms] lg:col-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              <h2 id={ratedId} className="text-[22px] font-extrabold leading-tight tracking-tight text-ink">
                Rated for you
              </h2>
              <Link href={hrefs.home} className={cn(D_LINK, "-mr-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm")}>
                Change what matters
              </Link>
            </div>
            <p className="mt-0.5 px-1 text-[14px] leading-snug text-ink-mute">
              {priorities.chosen ? "In your order." : "In the usual order."} Tap a rating for how it is worked out.
            </p>
            <RatingRows ratings={ordered} flightLabel={label} from="flight" className="mt-3" />
          </section>

          {/* The fare (and, on laptops, the pick) after the ratings on phones; a sticky column on laptops. */}
          <div className="min-w-0 lg:col-start-2 lg:row-span-6 lg:row-start-1">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6">
              {/* Phones have the pick under the header instead (one control, in sync through the choice store). */}
              <div className={cn(CARD, "hidden animate-d-rise p-5 [animation-delay:60ms] lg:block")}>
                <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute">Your pick</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{PICK_QUESTION}</p>
                {chooseButton("mt-4")}
              </div>
              {/* The on-time and fleet-age facts are left out: the reassurance cards above already state them. The compare
                  controls take the outline look, so the pick stays the column's one royal pill. d-flight-fare is the
                  hook acknowledgeCompare finds this card's controls by; d-reveal gives it the kit's scroll reveal (on
                  laptops it is on screen in the sticky column when first seen, so it never moves there). */}
              <FareCard
                option={option}
                item={item}
                daysUntil={daysUntil}
                othersHref={`#${OTHERS_ID}`}
                showFacts={false}
                compareTone="outline"
                className="d-flight-fare d-reveal animate-d-rise [animation-delay:120ms]"
              />
            </div>
          </div>

          <InterestCard
            placement="d_flight"
            context={label}
            title={D_FLIGHT_INTEREST.title}
            body={D_FLIGHT_INTEREST.body}
            button={D_FLIGHT_INTEREST.button}
            className="min-w-0 lg:col-start-1"
          />

          <MoreDetail flight={flight} ctx={ctx} className="min-w-0 lg:col-start-1" />

          <OtherFlights
            id={OTHERS_ID}
            day={day}
            options={options}
            currentKey={option.key}
            turbulence={availability.turbulence}
            daysUntil={daysUntil}
            showScores={false}
            badge={badge}
            className="mt-2 min-w-0 lg:col-start-1"
          />
        </div>
      </ExploreContext.Provider>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One reassurance card: a tinted icon, a title, the facts, a quiet footnote. It rises its last 16 px as it
 * scrolls into view (d-reveal). Where a row-mate is taller, the spare room goes above the footnote, which
 * stays on the card's bottom edge.
 */
function ReassureCard({
  icon,
  tint,
  title,
  foot,
  children,
}: {
  icon: ReactNode;
  tint: Tint;
  title: string;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn(CARD, "d-reveal flex flex-col p-4 sm:p-5")}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-ink ring-2 ring-ink [&_svg]:size-5", CARD_TINT[tint])}
        >
          {icon}
        </span>
        <h3 id={id} className="text-[17px] font-extrabold leading-snug tracking-tight text-ink">
          {title}
        </h3>
      </div>
      <div className="mt-3">{children}</div>
      {foot ? <p className="mt-auto pt-3 text-xs leading-snug text-ink-mute">{foot}</p> : null}
    </section>
  );
}

function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col gap-2.5", className)}>{children}</ul>;
}

/** One fact: the plain line, what it rests on, and (where one exists) the figure against its industry benchmark. */
function Fact({ main, sub, benchmark }: { main: ReactNode; sub?: ReactNode; benchmark?: ReactNode }) {
  return (
    <li>
      <span className="block text-[15px] font-bold leading-snug text-ink tabular-nums [overflow-wrap:anywhere]">{main}</span>
      {sub ? <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{sub}</span> : null}
      {benchmark ? <span className="mt-1 block">{benchmark}</span> : null}
    </li>
  );
}

/**
 * "More detail": the dashboard sections version C shows (turbulence, who
 * flies this plane, aircraft, airline, weather, seat map, sounds), behind one
 * collapsed disclosure — the deep detail, never the headline. Mounted on first
 * open and kept, so a section's state survives closing the block again.
 */
function MoreDetail({ flight, ctx, className }: { flight: Flight; ctx: SectionContext; className?: string }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const bodyId = useId();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) setOpened(true);
  };

  return (
    <section className={className}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className={cn(CARD, "d-row d-reveal d-flight-more flex w-full items-center gap-3.5 px-4 py-4 text-left")}
        >
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky text-ink ring-2 ring-ink [&_svg]:size-5"
          >
            <Layers strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold leading-snug tracking-tight text-ink">More detail</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-ink-mute">
              Turbulence, who flies this plane, aircraft, airline, weather, the seat map, what you&rsquo;ll hear and feel
            </span>
          </span>
          <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-ink", open && "rotate-180")} />
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="mt-3">
        {opened ? (
          <>
            <p className="mb-3 px-1 text-[13px] leading-snug text-ink-mute">
              The full sections for this flight. Open as much or as little as you like.
            </p>
            <FlightSections flight={flight} ctx={ctx} overrides={SECTION_OVERRIDES} />
          </>
        ) : null}
      </div>
    </section>
  );
}
