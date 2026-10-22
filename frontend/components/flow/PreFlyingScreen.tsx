"use client";

import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { ANXIETY_START_LABELS, ANXIETY_STARTS, WORRIES, WORRY_LABELS } from "@preflight/shared/stats";
import type { AnxietyStart, FlightsPerYear, PreSurvey, WorryMost } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { flyingComplete } from "@/lib/session";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { fadeUp, StepHeader } from "./StepHeader";

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

/** The three questions, in screen order. */
const QUESTIONS = ["flightsPerYear", "worriesMost", "anxietyStarts"] as const;
type FlyingKey = (typeof QUESTIONS)[number];

/** Height kept clear for the pinned Continue bar when deciding whether a question is already in view. */
const FOOTER_ALLOWANCE_PX = 120;

interface PreFlyingScreenProps {
  pre: PreSurvey;
  onChange: (patch: Partial<PreSurvey>) => void;
  onContinue: () => void;
}

/**
 * "About your flying": flights per year, what worries them most, when the
 * anxiety starts. Tap-only single picks, all three required. After a pick the
 * next unanswered question is brought into view so nothing below the fold is
 * missed; focus stays where it is.
 */
export function PreFlyingScreen({ pre, onChange, onContinue }: PreFlyingScreenProps) {
  const complete = flyingComplete(pre);
  const flightsLabel = useRef<HTMLParagraphElement>(null);
  const worriesLabel = useRef<HTMLParagraphElement>(null);
  const startsLabel = useRef<HTMLParagraphElement>(null);
  const labels = { flightsPerYear: flightsLabel, worriesMost: worriesLabel, anxietyStarts: startsLabel };

  function pick(key: FlyingKey, patch: Partial<PreSurvey>) {
    onChange(patch);
    const answers = { ...pre, ...patch };
    const i = QUESTIONS.indexOf(key);
    // The next unanswered question: the ones below this first, then back round to the top.
    const next = [...QUESTIONS.slice(i + 1), ...QUESTIONS.slice(0, i)].find((k) => answers[k] == null);
    // The label's parent is the whole question with its options.
    const group = next ? labels[next].current?.parentElement : null;
    if (!group || fullyVisible(group)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    group.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
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
            {complete ? "" : "Answer all three to continue"}
          </p>
        </div>
      }
    >
      <StepHeader stage={1} eyebrow="Before you start" title="About your flying" sub="One answer each — whichever fits best." />
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
            onChange={(v) => pick("worriesMost", { worriesMost: v })}
          />
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
      </div>
    </Screen>
  );
}

/** Fully on screen, above the pinned footer. */
function fullyVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight - FOOTER_ALLOWANCE_PX;
}
