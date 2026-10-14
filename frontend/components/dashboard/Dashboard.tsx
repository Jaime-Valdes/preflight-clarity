"use client";

import { Armchair, ArrowLeftRight, Bell, CloudSun, Ear, Plane, ShieldCheck, UserRound, Wind } from "lucide-react";
import {
  Component,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { daysBetween } from "@preflight/shared/dates";
import { generateFlight, normalizePrefs } from "@preflight/shared/fakeFlight";
import { getForecastStatus, summarizeFlight } from "@preflight/shared/forecast";
import { VARIANT_SECTIONS, sectionMeta } from "@preflight/shared/sections";
import type {
  AddedVia,
  AlternativeFlight,
  DashboardMetrics,
  ExploredFlight,
  Flight,
  FlightInput,
  FlightPrefs,
  SectionContext,
  SectionId,
  SectionProps,
  Variant,
} from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { SectionCard } from "@/components/ui/SectionCard";
import { useTodayISO } from "@/lib/hooks";
import type { Tone } from "@/lib/theme";
import { DashboardTracker, MAX_EXPLORED_FLIGHTS, TrackerContext } from "@/lib/tracking";
import { AircraftSection, aircraftTeaser } from "./AircraftSection";
import { AirlineSection, airlineTeaser } from "./AirlineSection";
import { AlertsSection, alertsTeaser } from "./AlertsSection";
import { CompareSection, compareTeaser } from "./CompareSection";
import { DashboardHeader } from "./DashboardHeader";
import { CompareView } from "./explore/CompareView";
import { ExploreContext, type ExploreApi } from "./explore/context";
import { FlightStrip } from "./explore/FlightStrip";
import { chipDate, exploreLabel, routeLabel, type ExploredEntry } from "./explore/model";
import { WhatIfSheet, type WhatIfRequest } from "./explore/WhatIfSheet";
import { PilotSection, pilotTeaser } from "./PilotSection";
import { SeatSection, seatTeaser } from "./SeatSection";
import { SoundsSection, soundsTeaser } from "./SoundsSection";
import { SummaryCard } from "./SummaryCard";
import { TurbulenceSection, turbulenceTeaser } from "./TurbulenceSection";
import { WeatherSection, weatherTeaser } from "./WeatherSection";

export interface DashboardProps {
  flight: Flight;
  variant: Variant;
  /** Metrics from before a page reload, so tracking resumes instead of restarting. */
  initialMetrics?: DashboardMetrics | null;
  /** Called with a snapshot when the page is hidden and every ~20 s (for checkpoint saves). */
  onCheckpoint?: (metrics: DashboardMetrics) => void;
  /** Called once when the participant taps "I'm done exploring". */
  onDone: (metrics: DashboardMetrics) => void;
}

interface SectionUi {
  icon: ReactNode;
  tone: Tone;
  teaser: (flight: Flight, ctx: SectionContext) => string;
  Body: ComponentType<SectionProps>;
}

const SECTION_UI: Record<SectionId, SectionUi> = {
  turbulence: { icon: <Wind />, tone: "calm", teaser: turbulenceTeaser, Body: TurbulenceSection },
  pilot: { icon: <UserRound />, tone: "dusk", teaser: pilotTeaser, Body: PilotSection },
  aircraft: { icon: <Plane />, tone: "breeze", teaser: aircraftTeaser, Body: AircraftSection },
  airline: { icon: <ShieldCheck />, tone: "calm", teaser: airlineTeaser, Body: AirlineSection },
  weather: { icon: <CloudSun />, tone: "breeze", teaser: weatherTeaser, Body: WeatherSection },
  seat: { icon: <Armchair />, tone: "calm", teaser: seatTeaser, Body: SeatSection },
  sounds: { icon: <Ear />, tone: "dusk", teaser: soundsTeaser, Body: SoundsSection },
  compare: { icon: <ArrowLeftRight />, tone: "breeze", teaser: compareTeaser, Body: CompareSection },
  alerts: { icon: <Bell />, tone: "dusk", teaser: alertsTeaser, Body: AlertsSection },
};

const CHECKPOINT_EVERY_MS = 20_000;
/** A section whose header sits below this share of the viewport is scrolled up when opened. */
const SCROLL_WHEN_BELOW = 0.55;
/** Just past SectionCard's 300 ms expand transition. */
const SCROLL_AFTER_MS = 330;

const NO_SECTIONS: ReadonlySet<SectionId> = new Set();

type AddResult = "added" | "existing" | "full" | "error";

function exploredFor(flight: Flight, today: string, addedVia: AddedVia, prefs?: FlightPrefs): ExploredFlight {
  return {
    id: flight.id,
    input: { ...flight.input },
    prefs: normalizePrefs(flight.prefs ?? prefs),
    summary: summarizeFlight(flight, daysBetween(today, flight.input.date)),
    addedVia,
    addedAtMs: 0,
  };
}

/**
 * The strip after a reload: the reference flight from the `flight` prop, the
 * others regenerated from their saved input + prefs (deterministic). A flight
 * that can no longer be generated is left out rather than breaking the page.
 */
function restoreEntries(tracker: DashboardTracker, flight: Flight): ExploredEntry[] {
  const saved = tracker.explorationState();
  if (!saved) return [];
  const entries: ExploredEntry[] = [];
  for (const meta of saved.flights) {
    if (meta.id === flight.id) {
      entries.push({ meta, flight });
      continue;
    }
    try {
      entries.push({ meta, flight: generateFlight(meta.input, meta.prefs) });
    } catch {
      // Skip it; the record keeps it.
    }
  }
  if (!entries.some((e) => e.meta.id === flight.id)) {
    entries.unshift({ meta: saved.flights[0] ?? exploredFor(flight, "1970-01-01", "setup"), flight });
  }
  return entries;
}

/** A section's teaser must never take the whole dashboard down. */
function safeTeaser(ui: SectionUi, flight: Flight, ctx: SectionContext): string {
  try {
    return ui.teaser(flight, ctx);
  } catch {
    return "";
  }
}

/**
 * The participant's dashboard. Owns section open/closed state, the tracker
 * and the "done" button. Renders a calm skeleton until today's date is known
 * on the client (the clock is never read during render).
 */
export function Dashboard(props: DashboardProps) {
  const today = useTodayISO();
  if (!today) return <DashboardSkeleton variant={props.variant} />;
  return <LiveDashboard {...props} today={today} />;
}

function LiveDashboard({ flight, variant, initialMetrics, onCheckpoint, onDone, today }: DashboardProps & { today: string }) {
  const sectionIds = VARIANT_SECTIONS[variant];
  // Free exploration is variant A only; variant B stays one flight, exactly as before.
  const exploring = variant === "A";
  const [boot] = useState(() => {
    const t = new DashboardTracker(
      sectionIds,
      initialMetrics,
      exploring ? { reference: exploredFor(flight, today, "setup") } : null,
    );
    const entries = exploring ? restoreEntries(t, flight) : [];
    const saved = t.activeFlight();
    const active = saved && entries.some((e) => e.meta.id === saved) ? saved : flight.id;
    if (exploring && active !== saved) t.setActiveFlight(active, false);
    return {
      tracker: t,
      entries,
      active,
      preferred: t.explorationState()?.preferredFlightId ?? null,
      // Starts from the sections that were open when the metrics were last saved (resume after a reload).
      open: { [active]: new Set(t.openSections()) } as Record<string, ReadonlySet<SectionId>>,
    };
  });
  const tracker = boot.tracker;
  const [explored, setExplored] = useState<ExploredEntry[]>(boot.entries);
  const [activeId, setActiveId] = useState(boot.active);
  // Each explored flight keeps its own open/closed sections.
  const [openByFlight, setOpenByFlight] = useState<Record<string, ReadonlySet<SectionId>>>(boot.open);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [comparePair, setComparePair] = useState<readonly [string, string] | null>(null);
  const [preferredId, setPreferredId] = useState<string | null>(boot.preferred);
  const [announcement, setAnnouncement] = useState("");
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const checkpointRef = useRef(onCheckpoint);
  const sectionEls = useRef(new Map<SectionId, HTMLDivElement>());

  const activeIndex = exploring ? Math.max(0, explored.findIndex((e) => e.meta.id === activeId)) : 0;
  const shown = exploring ? (explored[activeIndex]?.flight ?? flight) : flight;
  const openIds = openByFlight[activeId] ?? NO_SECTIONS;

  const daysUntil = daysBetween(today, shown.input.date);
  const history = shown.turbulence.history;
  const ctx = useMemo<SectionContext>(
    () => ({ daysUntil, forecast: getForecastStatus(daysUntil, history), variant }),
    [daysUntil, history, variant],
  );
  useEffect(() => {
    checkpointRef.current = onCheckpoint;
  }, [onCheckpoint]);

  // Measure time on the dashboard (visible time only — the tracker handles visibility).
  useEffect(() => {
    tracker.start();
    return () => tracker.pause();
  }, [tracker]);

  // Scroll depth is kept in pixels and only turned into a percentage when a
  // snapshot is saved, so the page growing as sections open re-bases it instead
  // of latching a value measured against the collapsed page.
  const scrollPx = useRef({ maxTop: 0, scrollable: 0 });
  const measureScroll = useCallback(() => {
    const top = window.scrollY;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const s = scrollPx.current;
    if (Number.isFinite(top)) s.maxTop = Math.max(s.maxTop, top, 0);
    // The tallest layout seen: collapsing sections afterwards can't push the share up.
    if (Number.isFinite(scrollable)) s.scrollable = Math.max(s.scrollable, scrollable, 0);
  }, []);
  /** 0 = never scrolled (or nothing to scroll), 100 = reached the bottom of the tallest page laid out. */
  const reportScroll = useCallback(() => {
    measureScroll();
    const { maxTop, scrollable } = scrollPx.current;
    tracker.recordScroll(scrollable > 0 ? (Math.min(maxTop, scrollable) / scrollable) * 100 : 0);
  }, [measureScroll, tracker]);

  useEffect(() => {
    measureScroll();
    window.addEventListener("scroll", measureScroll, { passive: true });
    window.addEventListener("resize", measureScroll);
    // Catches the 300 ms expand transition and late chart layout without hooking each toggle.
    const observer = new ResizeObserver(measureScroll);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", measureScroll);
      window.removeEventListener("resize", measureScroll);
      observer.disconnect();
    };
  }, [measureScroll]);

  // Checkpoints: when the page is hidden or left, and every 20 s while visible.
  useEffect(() => {
    const send = () => {
      if (finishedRef.current) return;
      reportScroll();
      checkpointRef.current?.(tracker.snapshot());
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
    };
    const onTick = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    const timer = window.setInterval(onTick, CHECKPOINT_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      window.clearInterval(timer);
    };
  }, [reportScroll, tracker]);

  const toggleSection = useCallback(
    (id: SectionId, next: boolean) => {
      setOpenByFlight((prev) => {
        const current = prev[activeId] ?? NO_SECTIONS;
        if (current.has(id) === next) return prev;
        const set = new Set(current);
        if (next) set.add(id);
        else set.delete(id);
        return { ...prev, [activeId]: set };
      });
      tracker.setSectionOpen(id, next);
      if (!next) return;
      // If the header sits low on the screen, bring the opening section up gently —
      // once its body has expanded, so the page is tall enough to scroll to it.
      window.setTimeout(() => {
        const el = sectionEls.current.get(id);
        if (!el || el.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") !== "true") return;
        const top = el.getBoundingClientRect().top;
        if (top <= window.innerHeight * SCROLL_WHEN_BELOW) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollBy({ top: top - 16, behavior: reduceMotion ? "auto" : "smooth" });
      }, SCROLL_AFTER_MS);
    },
    [tracker, activeId],
  );

  // ── Free exploration (variant A) ──────────────────────────────────────────

  /**
   * Show another flight: the tracker's open sections follow what is on screen
   * (the leaving flight's sections close, the arriving flight's reopen), then
   * the page returns to the top.
   */
  const activate = (id: string, viaUser: boolean, entries: readonly ExploredEntry[]) => {
    if (id === activeId) return;
    const index = entries.findIndex((e) => e.meta.id === id);
    if (index < 0) return;
    const from = openByFlight[activeId] ?? NO_SECTIONS;
    const to = openByFlight[id] ?? NO_SECTIONS;
    for (const s of from) if (!to.has(s)) tracker.setSectionOpen(s, false);
    for (const s of to) if (!from.has(s)) tracker.setSectionOpen(s, true);
    tracker.setActiveFlight(id, viaUser);
    setActiveId(id);
    const f = entries[index].flight;
    setAnnouncement(`Showing ${exploreLabel(index)}: ${f.origin.city} to ${f.destination.city}, ${chipDate(f.input.date)}.`);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const addFlight = (input: FlightInput, prefs: FlightPrefs, addedVia: AddedVia): AddResult => {
    let generated: Flight;
    try {
      generated = generateFlight(input, prefs);
    } catch {
      return "error";
    }
    if (explored.some((e) => e.meta.id === generated.id)) {
      activate(generated.id, false, explored);
      return "existing";
    }
    if (explored.length >= MAX_EXPLORED_FLIGHTS) return "full";
    const meta = exploredFor(generated, today, addedVia, prefs);
    if (!tracker.addFlight(meta)) return "full";
    // The tracker stamps addedAtMs.
    const stored = tracker.explorationState()?.flights.find((f) => f.id === meta.id) ?? meta;
    const next = [...explored, { meta: stored, flight: generated }];
    setExplored(next);
    activate(generated.id, false, next);
    return "added";
  };

  const openCompare = () => {
    if (explored.length < 2) return;
    const a = explored[0].meta.id;
    const b = explored[explored.length - 1].meta.id;
    tracker.compareOpened(a, b);
    setComparePair([a, b]);
  };

  const explore: ExploreApi | null = exploring
    ? {
        openAlternative(alt: AlternativeFlight) {
          tracker.event("alternative_opened", "compare", alt.id);
          const input = alt.input ?? { ...shown.input, date: alt.date };
          const result = addFlight(input, alt.prefs ?? { airline: alt.airline.code }, "alternative");
          if (result === "full") setAnnouncement(`The strip holds up to ${MAX_EXPLORED_FLIGHTS} flights.`);
        },
        openWhatIf() {
          if (explored.length >= MAX_EXPLORED_FLIGHTS) return;
          tracker.event("whatif_opened");
          setWhatIfOpen(true);
        },
        switchTo(id: string) {
          activate(id, true, explored);
        },
        compare: openCompare,
        showingOwnFlight: activeIndex === 0,
      }
    : null;

  const submitWhatIf = (req: WhatIfRequest): AddResult => {
    const result = addFlight(req.input, req.prefs, req.addedVia);
    if (result === "added" || result === "existing") setWhatIfOpen(false);
    return result;
  };

  const handleDone = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    reportScroll();
    onDone(tracker.finish());
  };

  return (
    <TrackerContext.Provider value={tracker}>
      <ExploreContext.Provider value={explore}>
        <Screen
          footer={
            <Button block onClick={handleDone} disabled={done}>
              I&rsquo;m done exploring
            </Button>
          }
        >
          <h1 tabIndex={-1} data-focus-start className="sr-only outline-none">
            Your flight briefing
          </h1>
          {explore ? (
            <>
              <FlightStrip
                entries={explored}
                activeId={activeId}
                onSelect={explore.switchTo}
                onAdd={explore.openWhatIf}
                onCompare={explore.compare}
                className="-mt-2 mb-3 animate-fade-up"
              />
              <p role="status" className="sr-only">
                {announcement}
              </p>
            </>
          ) : null}
          <Fragment key={shown.id}>
            <DashboardHeader
              flight={shown}
              daysUntil={daysUntil}
              label={explore ? exploreLabel(activeIndex) : undefined}
              className="animate-fade-up"
            />
            <SummaryCard flight={shown} ctx={ctx} className="mt-4 animate-fade-up [animation-delay:60ms]" />

            <p className="mt-6 px-1 text-[13px] leading-snug text-ink-500 animate-fade-up [animation-delay:120ms]">
              {explore && activeIndex > 0
                ? `A flight you’re exploring: ${routeLabel(shown)}, ${chipDate(shown.input.date)}. Explore as much or as little as you like.`
                : "Your flight briefing. Explore as much or as little as you like."}
            </p>

            <div className="mt-3 flex flex-col gap-3 animate-fade-up [animation-delay:160ms]">
              {sectionIds.map((id) => {
                const ui = SECTION_UI[id];
                return (
                  <div
                    key={id}
                    ref={(el) => {
                      if (el) sectionEls.current.set(id, el);
                      else sectionEls.current.delete(id);
                    }}
                  >
                    <SectionCard
                      title={sectionMeta(id).title}
                      icon={ui.icon}
                      tone={ui.tone}
                      teaser={safeTeaser(ui, shown, ctx)}
                      open={openIds.has(id)}
                      onToggle={(next) => toggleSection(id, next)}
                    >
                      <SectionBoundary>
                        <ui.Body flight={shown} ctx={ctx} />
                      </SectionBoundary>
                    </SectionCard>
                  </div>
                );
              })}
            </div>
          </Fragment>

          <p className="mt-7 text-center text-[11px] text-ink-500">Prototype · all flight data is illustrative</p>
        </Screen>

        {explore && whatIfOpen ? (
          <WhatIfSheet current={shown} today={today} onSubmit={submitWhatIf} onClose={() => setWhatIfOpen(false)} />
        ) : null}
        {explore && comparePair ? (
          <CompareView
            entries={explored}
            pair={comparePair}
            onPairChange={(a, b) => {
              tracker.compareOpened(a, b);
              setComparePair([a, b]);
            }}
            preferredId={preferredId}
            onPrefer={(id) => {
              tracker.preferFlight(id);
              setPreferredId(id);
            }}
            today={today}
            onClose={() => {
              tracker.compareClosed();
              setComparePair(null);
            }}
          />
        ) : null}
      </ExploreContext.Provider>
    </TrackerContext.Provider>
  );
}

/** One broken section body must not take the whole dashboard (and its tracking) down. */
class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="text-sm text-ink-500">This part of the briefing isn&rsquo;t available right now.</p>;
    }
    return this.props.children;
  }
}

/** Calm placeholder with the dashboard's silhouette, shown until the client knows today's date. */
export function DashboardSkeleton({ variant }: { variant: Variant }) {
  const rows = VARIANT_SECTIONS[variant];
  return (
    <Screen footer={<div aria-hidden className="h-14 rounded-full bg-ink-300/40" />}>
      <div role="status" aria-label="Preparing your briefing" className="animate-pulse">
        <div className="h-[318px] rounded-3xl bg-night-900/90" />
        <div className="mt-4 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80">
          <div className="flex items-center gap-4">
            <div className="size-[104px] shrink-0 rounded-full border-[9px] border-calm-100" />
            <div className="flex-1">
              <div className="h-2.5 w-24 rounded-full bg-line" />
              <div className="mt-3 h-4 w-32 rounded-full bg-line" />
              <div className="mt-3 h-2.5 w-40 rounded-full bg-line/80" />
            </div>
          </div>
          <div className="mt-5 h-3 w-full rounded-full bg-line/80" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-line/80" />
        </div>
        <div className="mt-6 h-3 w-56 rounded-full bg-line/80" />
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((id) => (
            <div key={id} className="flex items-center gap-3.5 rounded-3xl bg-surface px-4 py-4 shadow-soft ring-1 ring-line/80">
              <div className="size-11 shrink-0 rounded-2xl bg-canvas" />
              <div className="flex-1">
                <div className="h-3 w-36 rounded-full bg-line" />
                <div className="mt-2 h-2.5 w-48 rounded-full bg-line/80" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
