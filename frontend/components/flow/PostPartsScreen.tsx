"use client";

import { ArrowRight } from "lucide-react";
import { useId } from "react";
import { PART_LABELS, partsForVariant } from "@preflight/shared/sections";
import type { DashboardPart, PostSurvey, Variant } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { fadeUp, StepHeader } from "./StepHeader";
import { TextArea } from "./TextArea";

type PartChoice = DashboardPart | "none";

/** At most this many parts per question (team decision 2026-10-24: a top 3, not "everything"). */
export const MAX_PARTS = 3;

function partOptions(variant: Variant, noneLabel: string): ChoiceOption<PartChoice>[] {
  return [
    ...partsForVariant(variant).map((part): ChoiceOption<PartChoice> => ({ value: part, label: PART_LABELS[part] })),
    { value: "none", label: noneLabel },
  ];
}

interface PostPartsScreenProps {
  variant: Variant;
  post: PostSurvey;
  onChange: (patch: Partial<PostSurvey>) => void;
  onContinue: () => void;
}

/** Which parts helped or were worth most, which (if any) made things worse or were worth least — up to three each. */
export function PostPartsScreen({ variant, post, onChange, onContinue }: PostPartsScreenProps) {
  const worseTextId = useId();
  const complete = post.feltBetter.length > 0 && post.feltWorse.length > 0;
  return (
    <Screen
      footer={
        <div>
          <Button block disabled={!complete} onClick={onContinue} icon={<ArrowRight aria-hidden className="size-4" />}>
            Continue
          </Button>
          <p className="mt-2 h-4 text-center text-xs text-ink-500" aria-live="polite">
            {complete ? "" : "Pick at least one answer for each question"}
          </p>
        </div>
      }
    >
      <StepHeader stage={4} eyebrow="After the briefing" title="What stood out" />
      <div className="flex flex-col gap-3">
        {/* The two lists sit side by side (team decision 2026-10-25), so dense rows keep them readable on a phone. */}
        <Card className="animate-fade-up" style={fadeUp()}>
          {/* A hairline between the two columns keeps the matching rows apart. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*+*]:border-l [&>*+*]:border-line-strong [&>*+*]:pl-3 sm:[&>*+*]:pl-4">
            <ChoiceGroup
              kind="multi"
              dense
              label="Which parts made you feel better or did you find the most value in?"
              hint={`Pick up to ${MAX_PARTS}.`}
              options={partOptions(variant, "None of these")}
              values={post.feltBetter}
              exclusive="none"
              max={MAX_PARTS}
              onChange={(values) => onChange({ feltBetter: values })}
            />
            <ChoiceGroup
              kind="multi"
              dense
              label="Which parts made you more anxious or did you find least valuable?"
              hint={`Pick up to ${MAX_PARTS}.`}
              options={partOptions(variant, "Nothing")}
              values={post.feltWorse}
              exclusive="none"
              max={MAX_PARTS}
              onChange={(values) => onChange({ feltWorse: values })}
            />
          </div>
          <TextArea
            id={worseTextId}
            label="Anything you'd like to add? (optional)"
            value={post.feltWorseText}
            onChange={(v) => onChange({ feltWorseText: v })}
            placeholder="In your own words…"
            rows={2}
            className="mt-4"
          />
        </Card>
      </div>
    </Screen>
  );
}
