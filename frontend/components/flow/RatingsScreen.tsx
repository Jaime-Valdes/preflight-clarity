"use client";

import { ArrowRight, Plane } from "lucide-react";
import type { Ratings } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { ratingsComplete } from "@/lib/session";
import { RatingScale } from "./RatingScale";
import { fadeUp, StepHeader } from "./StepHeader";

export interface RatingQuestion {
  key: keyof Ratings;
  question: string;
  minLabel: string;
  maxLabel: string;
}

/** Baseline wording (brief, verbatim). */
export const PRE_QUESTIONS: readonly RatingQuestion[] = [
  {
    key: "anxiety",
    question:
      "Think about your next upcoming flight (or imagine one you'd need to take). Right now, how anxious do you feel about it?",
    minLabel: "Not at all anxious",
    maxLabel: "Extremely anxious",
  },
  {
    key: "control",
    question: "How in control do you feel about that flight?",
    minLabel: "Not at all in control",
    maxLabel: "Completely in control",
  },
  {
    key: "predictability",
    question: "How predictable does the flight feel to you?",
    minLabel: "Not at all predictable",
    maxLabel: "Completely predictable",
  },
];

/** Same three questions after the dashboard, about the same flight. */
export const POST_QUESTIONS: readonly RatingQuestion[] = [
  {
    key: "anxiety",
    question: "Think about that same flight. Right now, how anxious do you feel about it?",
    minLabel: "Not at all anxious",
    maxLabel: "Extremely anxious",
  },
  PRE_QUESTIONS[1],
  PRE_QUESTIONS[2],
];

interface RatingsScreenProps {
  stage: number;
  eyebrow: string;
  title: string;
  sub?: string;
  /** Post-survey only: a quiet reminder of which flight the questions are about. */
  flightLabel?: string | null;
  questions: readonly RatingQuestion[];
  ratings: Ratings;
  onChange: (patch: Partial<Ratings>) => void;
  onContinue: () => void;
}

/**
 * Three 0–10 scales on one screen. All sliders start unset and all three are
 * required; the answers are never compared with or hinted from earlier ones.
 */
export function RatingsScreen({
  stage,
  eyebrow,
  title,
  sub,
  flightLabel,
  questions,
  ratings,
  onChange,
  onContinue,
}: RatingsScreenProps) {
  const complete = ratingsComplete(ratings);
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
      <StepHeader stage={stage} eyebrow={eyebrow} title={title} sub={sub} />
      {flightLabel ? <FlightChip label={flightLabel} /> : null}
      <div className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <Card key={q.key} className="animate-fade-up" style={fadeUp(i * 60)}>
            <RatingScale
              question={q.question}
              value={ratings[q.key]}
              onChange={(v) => onChange({ [q.key]: v })}
              minLabel={q.minLabel}
              maxLabel={q.maxLabel}
            />
          </Card>
        ))}
      </div>
    </Screen>
  );
}

/** "Your flight · LAX → JFK · Sat, Oct 31" — names the flight, nothing more. */
function FlightChip({ label }: { label: string }) {
  return (
    <p className="-mt-2 mb-4 flex animate-fade-up" style={fadeUp()}>
      <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-surface py-1.5 pl-2 pr-3.5 text-[13px] leading-snug text-ink-700 shadow-soft ring-1 ring-inset ring-line/80">
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-breeze-50 text-breeze-700">
          <Plane className="size-3" />
        </span>
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink-900">Your flight</span>
          <span className="tabular-nums"> · {label}</span>
        </span>
      </span>
    </p>
  );
}
