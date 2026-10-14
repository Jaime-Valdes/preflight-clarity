"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import type { CheckFrequency, PostSurvey, ReplaceOption } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { fadeUp, StepHeader } from "./StepHeader";
import { TextArea } from "./TextArea";

export const CHECK_FREQUENCY_OPTIONS: readonly ChoiceOption<CheckFrequency>[] = [
  { value: "never", label: "Never" },
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "multiple_daily", label: "Multiple times a day" },
];

export const REPLACE_OPTIONS: readonly ChoiceOption<ReplaceOption>[] = [
  { value: "medication", label: "Medication" },
  { value: "videos", label: "Educational videos" },
  { value: "turbulence_apps", label: "Turbulence apps (like Turbli)" },
  { value: "choosing_flights", label: "Choosing flights carefully" },
  { value: "nothing", label: "Nothing" },
];

interface PostHabitsScreenProps {
  post: PostSurvey;
  onChange: (patch: Partial<PostSurvey>) => void;
  onFinish: () => void;
}

/** How they'd use it, what it might replace, what they'd still be scared of. */
export function PostHabitsScreen({ post, onChange, onFinish }: PostHabitsScreenProps) {
  const replaceTextId = useId();
  const scaredId = useId();
  const complete = post.checkFrequency !== null && post.wouldReplace.length > 0;
  return (
    <Screen
      footer={
        <div>
          <Button block disabled={!complete} onClick={onFinish} icon={<Check aria-hidden className="size-4" />}>
            Finish
          </Button>
          <p className="mt-2 h-4 text-center text-xs text-ink-500" aria-live="polite">
            {complete ? "" : "The first two questions are needed to finish"}
          </p>
        </div>
      }
    >
      <StepHeader stage={4} eyebrow="After the briefing" title="Last few questions" />
      <div className="flex flex-col gap-3">
        <Card className="animate-fade-up" style={fadeUp()}>
          <ChoiceGroup
            kind="single"
            label="If this existed for your real flights, how often would you check it in the weeks before?"
            options={CHECK_FREQUENCY_OPTIONS}
            value={post.checkFrequency}
            onChange={(v) => onChange({ checkFrequency: v })}
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(60)}>
          <ChoiceGroup
            kind="multi"
            label="Would this replace anything you do today?"
            hint="Choose as many as apply."
            options={REPLACE_OPTIONS}
            values={post.wouldReplace}
            exclusive="nothing"
            onChange={(values) => onChange({ wouldReplace: values })}
          />
          <TextArea
            id={replaceTextId}
            label="Anything else it might replace? (optional)"
            value={post.wouldReplaceText}
            onChange={(v) => onChange({ wouldReplaceText: v })}
            placeholder="In your own words…"
            rows={2}
            className="mt-4"
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(120)}>
          <TextArea
            id={scaredId}
            label="What would you still be scared of?"
            hint="Optional. Anything at all."
            value={post.stillScaredOf}
            onChange={(v) => onChange({ stillScaredOf: v })}
            placeholder="In your own words…"
            rows={3}
          />
        </Card>
      </div>
    </Screen>
  );
}
