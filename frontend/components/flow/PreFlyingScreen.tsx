"use client";

import { ArrowRight } from "lucide-react";
import { useId, useRef } from "react";
import {
  ANXIETY_START_LABELS,
  ANXIETY_STARTS,
  TRAVEL_IMPACT_LABELS,
  TRAVEL_IMPACTS,
  WORRIES,
  WORRY_LABELS,
} from "@preflight/shared/stats";
import type { AnxietyStart, FlightsPerYear, PreSurvey, TravelImpact, WorryMost } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { flyingComplete } from "@/lib/session";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { fadeUp, StepHeader } from "./StepHeader";
import { TextArea } from "./TextArea";

export const FLIGHTS_PER_YEAR_OPTIONS: readonly ChoiceOption<FlightsPerYear>[] = [
  { value: "0to1", label: "Once or less" },
  { value: "2to3", label: "2–3" },
  { value: "4to6", label: "4–6" },
  { value: "7to12", label: "7–12" },
  { value: "13plus", label: "13+" },
];

/** Same labels as the results breakdown (shared/src/stats.ts), so the two never drift. */
export const WORRY_OPTIONS: readonly ChoiceOption<WorryMost>[] = WORRIES.map((value) => ({
  value,
  label: WORRY_LABELS[value],
}));

export const ANXIETY_START_OPTIONS: readonly ChoiceOption<AnxietyStart>[] = ANXIETY_STARTS.map((value) => ({
  value,
  label: ANXIETY_START_LABELS[value],
}));

/** Same labels as the results breakdown (shared/src/stats.ts); "No" clears the others. */
export const TRAVEL_IMPACT_OPTIONS: readonly ChoiceOption<TravelImpact>[] = TRAVEL_IMPACTS.map((value) => ({
  value,
  label: TRAVEL_IMPACT_LABELS[value],
}));

/** The four questions, in screen order. */
const QUESTIONS = ["flightsPerYear", "worriesMost", "anxietyStarts", "travelImpact"] as const;
type FlyingKey = (typeof QUESTIONS)[number];

/** Height kept clear for the pinned Continue bar when deciding whether a question is already in view. */
const FOOTER_ALLOWANCE_PX = 120;

interface PreFlyingScreenProps {
  pre: PreSurvey;
  /** Optional words for the travel-plans "Other" (stored as `post.travelImpactOtherText`). */
  travelOtherText: string;
  /**
   * The travel-plans answer. It moved here from the post-survey on 2026-10-24 and is still stored as
   * `post.travelImpact`, so the record, CSV column and results keep working for older sessions.
   */
  travelImpact: readonly TravelImpact[];
  onChange: (patch: Partial<PreSurvey>) => void;
  onTravelImpactChange: (values: TravelImpact[]) => void;
  onTravelOtherTextChange: (text: string) => void;
  onContinue: () => void;
}

/**
 * "About your flying": flights per year, what worries them most, when the
 * anxiety starts, and whether fear of flying changed their travel plans. All
 * four required (the last one is a multi-select with an exclusive "No"). After
 * a pick the next unanswered question is brought into view so nothing below
 * the fold is missed; focus stays where it is.
 */
export function PreFlyingScreen({
  pre,
  travelImpact,
  travelOtherText,
  onChange,
  onTravelImpactChange,
  onTravelOtherTextChange,
  onContinue,
}: PreFlyingScreenProps) {
  const otherId = useId();
  const travelOtherId = useId();
  const complete = flyingComplete(pre, travelImpact);
  const flightsLabel = useRef<HTMLParagraphElement>(null);
  const worriesLabel = useRef<HTMLParagraphElement>(null);
  const startsLabel = useRef<HTMLParagraphElement>(null);
  const travelLabel = useRef<HTMLParagraphElement>(null);
  const labels = { flightsPerYear: flightsLabel, worriesMost: worriesLabel, anxietyStarts: startsLabel, travelImpact: travelLabel };

  function revealNext(key: FlyingKey, answered: Record<FlyingKey, boolean>) {
    const i = QUESTIONS.indexOf(key);
    // The next unanswered question: the ones below this first, then back round to the top.
    const next = [...QUESTIONS.slice(i + 1), ...QUESTIONS.slice(0, i)].find((k) => !answered[k]);
    // The label's parent is the whole question with its options.
    const group = next ? labels[next].current?.parentElement : null;
    if (!group || fullyVisible(group)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    group.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  function answeredWith(nextPre: PreSurvey, nextTravel: readonly TravelImpact[]): Record<FlyingKey, boolean> {
    return {
      flightsPerYear: nextPre.flightsPerYear != null,
      worriesMost: nextPre.worriesMost != null,
      anxietyStarts: nextPre.anxietyStarts != null,
      travelImpact: nextTravel.length > 0,
    };
  }

  function pick(key: Exclude<FlyingKey, "travelImpact">, patch: Partial<PreSurvey>) {
    onChange(patch);
    revealNext(key, answeredWith({ ...pre, ...patch }, travelImpact));
  }

  function pickTravel(values: TravelImpact[]) {
    onTravelImpactChange(values);
    // A multi-select: only the first pick moves on (unpicking, or adding a second, shouldn't jump).
    // "Other" opens a text field right here instead.
    if (travelImpact.length === 0 && values.length > 0 && !values.includes("other")) revealNext("travelImpact", answeredWith(pre, values));
  }

  return (
    <Screen
      footer={
        <div>
          <Button
            block
            disabled={!complete}
            onClick={onContinue}
            icon={<ArrowRight aria-hidden className="size-4" />}
          >
            Continue
          </Button>
          <p className="mt-2 h-4 text-center text-xs text-ink-500" aria-live="polite">
            {complete ? "" : "Answer all four to continue"}
          </p>
        </div>
      }
    >
      <StepHeader stage={1} eyebrow="Before you start" title="About your flying" />
      <div className="flex flex-col gap-3">
        <Card className="animate-fade-up" style={fadeUp()}>
          <ChoiceGroup
            kind="single"
            labelRef={flightsLabel}
            label="How many flights do you take in a typical year?"
            options={FLIGHTS_PER_YEAR_OPTIONS}
            value={pre.flightsPerYear}
            onChange={(v) => pick("flightsPerYear", { flightsPerYear: v })}
            columns={2}
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(60)}>
          <ChoiceGroup
            kind="single"
            labelRef={worriesLabel}
            label="What worries you most about flying?"
            options={WORRY_OPTIONS}
            value={pre.worriesMost ?? null}
            // "Other" opens a text field right here, so it doesn't scroll on to the next question.
            onChange={(v) => (v === "other" ? onChange({ worriesMost: v }) : pick("worriesMost", { worriesMost: v }))}
          />
          {pre.worriesMost === "other" ? (
            <TextArea
              id={otherId}
              label="What is it? (optional)"
              value={pre.worriesOtherText ?? ""}
              onChange={(v) => onChange({ worriesOtherText: v })}
              placeholder="In your own words…"
              rows={2}
              maxLength={120}
              className="mt-4"
            />
          ) : null}
        </Card>
        <Card className="animate-fade-up" style={fadeUp(120)}>
          <ChoiceGroup
            kind="single"
            labelRef={startsLabel}
            label="When does the anxiety usually start before a flight?"
            options={ANXIETY_START_OPTIONS}
            value={pre.anxietyStarts ?? null}
            onChange={(v) => pick("anxietyStarts", { anxietyStarts: v })}
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(180)}>
          <ChoiceGroup
            kind="multi"
            labelRef={travelLabel}
            label="In the past year, has fear of flying changed your travel plans?"
            hint="Choose as many as apply."
            options={TRAVEL_IMPACT_OPTIONS}
            values={travelImpact}
            exclusive="no"
            onChange={pickTravel}
          />
          {travelImpact.includes("other") ? (
            <TextArea
              id={travelOtherId}
              label="What happened? (optional)"
              value={travelOtherText}
              onChange={onTravelOtherTextChange}
              placeholder="In your own words…"
              rows={2}
              maxLength={120}
              className="mt-4"
            />
          ) : null}
        </Card>
      </div>
    </Screen>
  );
}

/** Fully on screen, above the pinned footer. */
function fullyVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight - FOOTER_ALLOWANCE_PX;
}
