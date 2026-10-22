"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { TRAVEL_IMPACT_LABELS, TRAVEL_IMPACTS } from "@preflight/shared/stats";
import type { CheckFrequency, PostSurvey, ReplaceOption, TravelImpact, Variant, WouldSwitch } from "@preflight/shared/types";
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

/** Same labels as the results breakdown (shared/src/stats.ts); "No" clears the others. */
export const TRAVEL_IMPACT_OPTIONS: readonly ChoiceOption<TravelImpact>[] = TRAVEL_IMPACTS.map((value) => ({
  value,
  label: TRAVEL_IMPACT_LABELS[value],
}));

export const WOULD_SWITCH_OPTIONS: readonly ChoiceOption<WouldSwitch>[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
  { value: "didnt_look", label: "I didn\u2019t look at other flights" },
];

interface PostHabitsScreenProps {
  variant: Variant;
  post: PostSurvey;
  onChange: (patch: Partial<PostSurvey>) => void;
  onFinish: () => void;
}

/** How they'd use it, what it might replace, what they'd still be scared of, whether the fear changed their plans. */
export function PostHabitsScreen({ variant, post, onChange, onFinish }: PostHabitsScreenProps) {
  const replaceTextId = useId();
  const scaredId = useId();
  const complete = post.checkFrequency !== null && post.wouldReplace.length > 0;
  // Variant A: the optional switch question sits last, below the fold. If Finish is tapped before it
  // was ever on screen, bring it into view once instead of finishing, so a blank answer means "skipped",
  // not "never seen". A second tap always finishes; no answer is required.
  const switchLabelRef = useRef<HTMLParagraphElement>(null);
  const switchSeen = useRef(false);
  /** performance.now() when Finish scrolled to the question: a tap within ~600 ms is the tail of a double tap. */
  const broughtIntoViewAt = useRef<number | null>(null);

  useEffect(() => {
    const el = switchLabelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // The question counts as seen once it is fully visible above the pinned Finish bar.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          switchSeen.current = true;
          io.disconnect();
        }
      },
      { threshold: 1, rootMargin: "0px 0px -120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function finish() {
    if (broughtIntoViewAt.current !== null && performance.now() - broughtIntoViewAt.current < 600) return;
    if (variant === "A" && post.wouldSwitch == null && !switchSeen.current) {
      switchSeen.current = true;
      broughtIntoViewAt.current = performance.now();
      const label = switchLabelRef.current;
      // The label's parent is the whole question with its options.
      label?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
      label?.focus({ preventScroll: true });
      return;
    }
    onFinish();
  }

  return (
    <Screen
      footer={
        <div>
          <Button block disabled={!complete} onClick={finish} icon={<Check aria-hidden className="size-4" />}>
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
        <Card className="animate-fade-up" style={fadeUp(180)}>
          <ChoiceGroup
            kind="multi"
            label="In the past year, has fear of flying changed your travel plans?"
            hint="Optional. Choose as many as apply."
            options={TRAVEL_IMPACT_OPTIONS}
            values={post.travelImpact ?? []}
            exclusive="no"
            onChange={(values) => onChange({ travelImpact: values })}
          />
        </Card>
        {variant === "A" ? (
          <Card className="animate-fade-up" style={fadeUp(240)}>
            <ChoiceGroup
              kind="single"
              labelRef={switchLabelRef}
              label="If you could, would you switch to one of the other flights you looked at?"
              hint="Optional."
              options={WOULD_SWITCH_OPTIONS}
              value={post.wouldSwitch ?? null}
              onChange={(v) => onChange({ wouldSwitch: v })}
            />
          </Card>
        ) : null}
      </div>
    </Screen>
  );
}
