"use client";

import { ChevronDown, Ear, Vibrate } from "lucide-react";
import { useId, useState } from "react";
import { formatDuration, formatOffset } from "@preflight/shared/dates";
import type {
  Flight,
  FlightPhase,
  PhaseForecast,
  SectionContext,
  SectionProps,
  SoundCue,
  SoundMoment,
} from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { SOUND_MOMENT_LABEL } from "@/lib/theme";
import { useTracker } from "@/lib/tracking";
import { Reveal } from "./env/Reveal";

const MOMENT_ORDER: readonly SoundMoment[] = ["boarding", "taxi", "takeoff", "climb", "cruise", "descent", "landing"];

type Filter = SoundMoment | "all";

interface CueGroup {
  moment: SoundMoment;
  /** Short timing hint for the group header, e.g. "Last 34 min". */
  hint: string | null;
  cues: SoundCue[];
}

/**
 * A timeline of the normal sounds and sensations of this flight, boarding to
 * landing, grouped by moment. Tapping a cue reveals why it's normal.
 */
export function SoundsSection({ flight }: SectionProps) {
  const tracker = useTracker();
  const baseId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const groups = groupCues(flight);
  const visible = filter === "all" ? groups : groups.filter((g) => g.moment === filter);
  const total = flight.sounds.length;

  const toggleCue = (id: string) => {
    const next = new Set(openIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      tracker?.event("sound_cue_opened", "sounds", id);
    }
    setOpenIds(next);
  };

  const pickFilter = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    tracker?.event("sound_filter", "sounds", next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm leading-snug text-ink-700">
          {total === 0
            ? "The normal sounds and sensations of a flight, in the order you'll notice them."
            : `${total} normal sounds and sensations, in the order you'll notice them. Tap one to see why it happens.`}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <LegendDot sense="hear" />
            You&apos;ll hear
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendDot sense="feel" />
            You&apos;ll feel
          </span>
        </div>
      </div>

      {groups.length > 1 ? (
        <FilterChips moments={groups.map((g) => g.moment)} filter={filter} onPick={pickFilter} />
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing to note for this part of the flight.</p>
      ) : (
        <ol className="relative">
          <span aria-hidden className="absolute top-4 bottom-4 left-[17px] w-px bg-line" />
          {visible.map((group) => (
            <li key={group.moment} className="pt-1">
              <div className="relative flex items-center gap-3 py-1.5">
                <span className="flex w-9 shrink-0 justify-center">
                  <span className="size-2.5 rounded-full bg-ink-300 shadow-[0_0_0_3px_var(--color-surface)]" />
                </span>
                <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  {SOUND_MOMENT_LABEL[group.moment] ?? group.moment}
                </span>
                {group.hint ? <span className="text-[11px] text-ink-400 tabular-nums">· {group.hint}</span> : null}
              </div>
              <ol>
                {group.cues.map((cue) => (
                  <CueRow
                    key={cue.id}
                    cue={cue}
                    open={openIds.has(cue.id)}
                    onToggle={() => toggleCue(cue.id)}
                    panelId={`${baseId}-${cue.id}`}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** "14 normal sounds and sensations, boarding to landing" */
export function soundsTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  const n = flight.sounds.length;
  if (n === 0) return "Normal sounds and sensations, boarding to landing";
  return `${n} normal sounds and sensations, boarding to landing`;
}

// ── Grouping ────────────────────────────────────────────────────────────────

function groupCues(flight: Flight): CueGroup[] {
  const byMoment = new Map<SoundMoment, SoundCue[]>();
  for (const cue of flight.sounds) {
    const list = byMoment.get(cue.moment);
    if (list) list.push(cue);
    else byMoment.set(cue.moment, [cue]);
  }
  const groups: CueGroup[] = [];
  for (const moment of MOMENT_ORDER) {
    const cues = byMoment.get(moment);
    if (cues && cues.length > 0) groups.push({ moment, hint: momentHint(moment, flight), cues });
  }
  // Defensive: a moment outside the known order still gets shown, at the end.
  for (const [moment, cues] of byMoment) {
    if (!MOMENT_ORDER.includes(moment)) groups.push({ moment, hint: null, cues });
  }
  return groups;
}

function phaseOf(flight: Flight, name: FlightPhase): PhaseForecast | undefined {
  return flight.turbulence.phases.find((p) => p.phase === name);
}

function momentHint(moment: SoundMoment, flight: Flight): string | null {
  switch (moment) {
    case "boarding":
      return "At the gate";
    case "taxi":
      return "Gate to runway";
    case "takeoff":
      return "Under a minute";
    case "climb": {
      const p = phaseOf(flight, "climb");
      return p && p.endMin > 0 ? `First ${formatOffset(p.endMin)}` : null;
    }
    case "cruise": {
      const p = phaseOf(flight, "cruise");
      return p && p.endMin > p.startMin ? `${formatDuration(p.endMin - p.startMin)} at altitude` : null;
    }
    case "descent": {
      const p = phaseOf(flight, "descent");
      const last = flight.airborneMin - (p?.startMin ?? flight.airborneMin);
      return last > 0 ? `Last ${formatOffset(last)}` : null;
    }
    case "landing":
      return "Touchdown and rollout";
    default:
      return null;
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const SENSE: Record<SoundCue["sense"], { label: string; classes: string }> = {
  hear: { label: "You'll hear", classes: "bg-breeze-50 text-breeze-700 ring-breeze-100" },
  feel: { label: "You'll feel", classes: "bg-dusk-50 text-dusk-700 ring-dusk-100" },
  both: { label: "You'll hear and feel", classes: "bg-calm-50 text-calm-700 ring-calm-100" },
};

function senseStyle(sense: SoundCue["sense"]) {
  return SENSE[sense] ?? SENSE.both;
}

function SenseBadge({ sense }: { sense: SoundCue["sense"] }) {
  const s = senseStyle(sense);
  return (
    <span
      role="img"
      aria-label={s.label}
      className={cn(
        "flex size-9 items-center justify-center gap-0.5 rounded-full shadow-[0_0_0_3px_var(--color-surface)] ring-1 ring-inset",
        s.classes,
      )}
    >
      {sense === "feel" ? (
        <Vibrate className="size-4" />
      ) : sense === "hear" ? (
        <Ear className="size-4" />
      ) : (
        <>
          <Ear className="size-3.5" />
          <Vibrate className="size-3.5" />
        </>
      )}
    </span>
  );
}

function LegendDot({ sense }: { sense: "hear" | "feel" }) {
  const s = senseStyle(sense);
  return (
    <span aria-hidden className={cn("flex size-5 items-center justify-center rounded-full ring-1 ring-inset", s.classes)}>
      {sense === "hear" ? <Ear className="size-3" /> : <Vibrate className="size-3" />}
    </span>
  );
}

function CueRow({
  cue,
  open,
  onToggle,
  panelId,
}: {
  cue: SoundCue;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  return (
    <li className="relative flex gap-3">
      <span className="flex w-9 shrink-0 justify-center pt-1.5">
        <SenseBadge sense={cue.sense} />
      </span>
      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            "-mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-canvas/70 active:bg-canvas",
            open && "bg-canvas/50",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-500 tabular-nums">{cue.when}</span>
            <span className="mt-0.5 block text-[15px] leading-snug font-bold text-ink-900">{cue.title}</span>
            <span className="mt-0.5 block text-sm leading-snug text-ink-700">{cue.detail}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn("mt-1 size-4 shrink-0 text-ink-400 transition-transform duration-300", open && "rotate-180")}
          />
        </button>
        <Reveal open={open} id={panelId}>
          <div className="mt-1.5 rounded-xl bg-calm-50/70 px-3 py-2.5 ring-1 ring-inset ring-calm-100">
            <div className="text-[11px] font-semibold tracking-wide text-calm-700 uppercase">Why it&apos;s normal</div>
            <p className="mt-1 text-sm leading-snug text-ink-700">{cue.why}</p>
          </div>
        </Reveal>
      </div>
    </li>
  );
}

function FilterChips({
  moments,
  filter,
  onPick,
}: {
  moments: SoundMoment[];
  filter: Filter;
  onPick: (next: Filter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show part of the flight"
    >
      <div className="flex flex-wrap gap-1.5 py-1">
        <FilterChip active={filter === "all"} onClick={() => onPick("all")}>
          All
        </FilterChip>
        {moments.map((m) => (
          <FilterChip key={m} active={filter === m} onClick={() => onPick(m)}>
            {SOUND_MOMENT_LABEL[m] ?? m}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      // The pseudo-element pads the hit area to 44px without changing the visual size.
      className={cn(
        "relative h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
        active ? "bg-night-900 text-white ring-night-900" : "bg-surface text-ink-700 ring-line hover:bg-canvas",
      )}
    >
      {children}
    </button>
  );
}
