"use client";

import { Armchair, CloudSun, Ear, Plane, ShieldCheck, UserRound, Wind } from "lucide-react";
import { Component, useState, type ComponentType, type ReactNode } from "react";
import type { Flight, SectionContext, SectionId, SectionProps } from "@preflight/shared/types";
import { AircraftSection, aircraftTeaser } from "@/components/dashboard/AircraftSection";
import { AirlineSection, airlineTeaser } from "@/components/dashboard/AirlineSection";
import { PilotSection, pilotTeaser } from "@/components/dashboard/PilotSection";
import { SeatSection, seatTeaser } from "@/components/dashboard/SeatSection";
import { SoundsSection, soundsTeaser } from "@/components/dashboard/SoundsSection";
import { TurbulenceSection, turbulenceTeaser } from "@/components/dashboard/TurbulenceSection";
import { WeatherSection, weatherTeaser } from "@/components/dashboard/WeatherSection";
import { SectionCard } from "@/components/ui/SectionCard";
import type { Tone } from "@/lib/theme";

/** The dashboard sections version C shows — not "Compare smoother options" or "Forecast alerts" (A/B only). */
type CSectionId = Exclude<SectionId, "compare" | "alerts">;

interface CSection {
  id: CSectionId;
  /** Neutral titles: the A/B ones say "Your pilots" / "Your aircraft". */
  title: string;
  icon: ReactNode;
  tone: Tone;
  teaser: (flight: Flight, ctx: SectionContext) => string;
  Body: ComponentType<SectionProps>;
}

const C_SECTIONS: readonly CSection[] = [
  { id: "turbulence", title: "Turbulence forecast", icon: <Wind />, tone: "calm", teaser: turbulenceTeaser, Body: TurbulenceSection },
  { id: "pilot", title: "Pilots", icon: <UserRound />, tone: "dusk", teaser: pilotTeaser, Body: PilotSection },
  { id: "aircraft", title: "Aircraft", icon: <Plane />, tone: "breeze", teaser: aircraftTeaser, Body: AircraftSection },
  { id: "airline", title: "Airline safety & comfort", icon: <ShieldCheck />, tone: "calm", teaser: airlineTeaser, Body: AirlineSection },
  { id: "weather", title: "Weather", icon: <CloudSun />, tone: "breeze", teaser: weatherTeaser, Body: WeatherSection },
  { id: "seat", title: "Best seat for smoothness", icon: <Armchair />, tone: "calm", teaser: seatTeaser, Body: SeatSection },
  { id: "sounds", title: "What you’ll hear & feel", icon: <Ear />, tone: "dusk", teaser: soundsTeaser, Body: SoundsSection },
];

/** Laptop and up opens the turbulence forecast to start with; phones start with everything collapsed. */
const DESKTOP_QUERY = "(min-width: 1024px)";
/** A section whose header sits below this share of the viewport is scrolled up when opened. */
const SCROLL_WHEN_BELOW = 0.55;
/** Just past SectionCard's 300 ms expand transition. */
const SCROLL_AFTER_MS = 330;

/** Only ever runs on the client: the flight page renders its sections after hydration (see FlightPage). */
function initialOpen(): ReadonlySet<CSectionId> {
  const desktop = typeof window !== "undefined" && window.matchMedia?.(DESKTOP_QUERY).matches;
  return new Set<CSectionId>(desktop ? ["turbulence"] : []);
}

/** A section's teaser must never take the page down. */
function safeTeaser(section: CSection, flight: Flight, ctx: SectionContext): string {
  try {
    return section.teaser(flight, ctx);
  } catch {
    return "";
  }
}

interface FlightSectionsProps {
  flight: Flight;
  ctx: SectionContext;
}

/**
 * Version C flight page: the dashboard's section bodies, reused as-is, each in
 * a collapsible SectionCard. Open state is local (several may be open); nothing
 * is tracked. Must sit inside the page's ExploreContext provider (neutral
 * "this flight" copy, per-flight body state).
 */
export function FlightSections({ flight, ctx }: FlightSectionsProps) {
  const [open, setOpen] = useState<ReadonlySet<CSectionId>>(initialOpen);

  const toggle = (id: CSectionId, next: boolean) => {
    setOpen((prev) => {
      if (prev.has(id) === next) return prev;
      const set = new Set(prev);
      if (next) set.add(id);
      else set.delete(id);
      return set;
    });
    if (!next) return;
    // If the header sits low on the screen, bring the opening section up gently once its body has expanded.
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-c-section="${id}"]`);
      if (!el || el.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") !== "true") return;
      if (el.getBoundingClientRect().top <= window.innerHeight * SCROLL_WHEN_BELOW) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }, SCROLL_AFTER_MS);
  };

  return (
    <div className="flex flex-col gap-3">
      {C_SECTIONS.map((section) => (
        <div key={section.id} data-c-section={section.id} className="scroll-mt-4">
          <SectionCard
            title={section.title}
            icon={section.icon}
            tone={section.tone}
            teaser={safeTeaser(section, flight, ctx)}
            open={open.has(section.id)}
            onToggle={(next) => toggle(section.id, next)}
          >
            <SectionBoundary>
              <section.Body flight={flight} ctx={ctx} />
            </SectionBoundary>
          </SectionCard>
        </div>
      ))}
    </div>
  );
}

/** One broken section body must not take the whole page down. */
class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="text-sm text-ink-500">This part of the flight details isn&rsquo;t available right now.</p>;
    }
    return this.props.children;
  }
}
