"use client";

import { ArrowRight } from "lucide-react";
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
