"use client";

import { Armchair, ArrowLeftRight, Bell, CloudSun, Ear, Plane, ShieldCheck, UserRound, Wind } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { daysBetween } from "@preflight/shared/dates";
import { getForecastStatus } from "@preflight/shared/forecast";
import { VARIANT_SECTIONS, sectionMeta } from "@preflight/shared/sections";
import type { DashboardMetrics, Flight, SectionContext, SectionId, SectionProps, Variant } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { SectionCard } from "@/components/ui/SectionCard";
import { useTodayISO } from "@/lib/hooks";
import type { Tone } from "@/lib/theme";
import { DashboardTracker, TrackerContext } from "@/lib/tracking";
import { AircraftSection, aircraftTeaser } from "./AircraftSection";
import { AirlineSection, airlineTeaser } from "./AirlineSection";
import { AlertsSection, alertsTeaser } from "./AlertsSection";
import { CompareSection, compareTeaser } from "./CompareSection";
import { DashboardHeader } from "./DashboardHeader";
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
  const [tracker] = useState(() => new DashboardTracker(sectionIds, initialMetrics));
  // Starts from the sections that were open when the metrics were last saved (resume after a reload).
  const [openIds, setOpenIds] = useState<ReadonlySet<SectionId>>(() => new Set(tracker.openSections()));
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const checkpointRef = useRef(onCheckpoint);
  const sectionEls = useRef(new Map<SectionId, HTMLDivElement>());

  const daysUntil = daysBetween(today, flight.input.date);
  const history = flight.turbulence.history;
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
      setOpenIds((prev) => {
        if (prev.has(id) === next) return prev;
        const set = new Set(prev);
        if (next) set.add(id);
        else set.delete(id);
        return set;
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
    [tracker],
  );

  const handleDone = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    reportScroll();
    onDone(tracker.finish());
  };

  return (
    <TrackerContext.Provider value={tracker}>
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
        <DashboardHeader flight={flight} daysUntil={daysUntil} className="animate-fade-up" />
        <SummaryCard flight={flight} ctx={ctx} className="mt-4 animate-fade-up [animation-delay:60ms]" />

        <p className="mt-6 px-1 text-[13px] leading-snug text-ink-500 animate-fade-up [animation-delay:120ms]">
          Your flight briefing. Explore as much or as little as you like.
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
                  teaser={safeTeaser(ui, flight, ctx)}
                  open={openIds.has(id)}
                  onToggle={(next) => toggleSection(id, next)}
                >
                  <SectionBoundary>
                    <ui.Body flight={flight} ctx={ctx} />
                  </SectionBoundary>
                </SectionCard>
              </div>
            );
          })}
        </div>

        <p className="mt-7 text-center text-[11px] text-ink-500">Prototype · all flight data is illustrative</p>
      </Screen>
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
