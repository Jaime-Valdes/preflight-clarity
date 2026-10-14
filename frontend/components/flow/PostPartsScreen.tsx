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

/** Which parts helped, which (if any) made things worse. */
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
      <StepHeader stage={4} eyebrow="After the briefing" title="What stood out" sub="Choose as many as apply." />
      <div className="flex flex-col gap-3">
        <Card className="animate-fade-up" style={fadeUp()}>
          <ChoiceGroup
            kind="multi"
            label="Which part of the briefing, if any, made you feel better?"
            options={partOptions(variant, "None of these")}
            values={post.feltBetter}
            exclusive="none"
            onChange={(values) => onChange({ feltBetter: values })}
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(60)}>
          <ChoiceGroup
            kind="multi"
            label="Did anything make you feel more anxious?"
            options={partOptions(variant, "Nothing")}
            values={post.feltWorse}
            exclusive="none"
            onChange={(values) => onChange({ feltWorse: values })}
          />
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
