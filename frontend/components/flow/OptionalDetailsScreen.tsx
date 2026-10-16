"use client";

import { ArrowRight } from "lucide-react";
import type { FlightsPerYear, PreSurvey, Timeframe } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { AirportField } from "./AirportField";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { fadeUp, StepHeader } from "./StepHeader";

export const TIMEFRAME_OPTIONS: readonly ChoiceOption<Timeframe>[] = [
  { value: "lt1w", label: "Less than a week" },
  { value: "1to4w", label: "1–4 weeks" },
  { value: "1to3m", label: "1–3 months" },
  { value: "3mplus", label: "3+ months" },
];

export const FLIGHTS_PER_YEAR_OPTIONS: readonly ChoiceOption<FlightsPerYear>[] = [
  { value: "0to1", label: "Once or less" },
  { value: "2to3", label: "2–3" },
  { value: "4to6", label: "4–6" },
  { value: "7to12", label: "7–12" },
  { value: "13plus", label: "13+" },
];

interface OptionalDetailsScreenProps {
  pre: PreSurvey;
  onChange: (patch: Partial<PreSurvey>) => void;
  onContinue: () => void;
}

/**
 * Route, how far away the flight is, flights per year — every field optional.
 * The route here is a survey answer, not flight data, so free text is kept;
 * the flight setup only prefills from it when it is a catalogue airport.
 */
export function OptionalDetailsScreen({ pre, onChange, onContinue }: OptionalDetailsScreenProps) {
  const touched = !!(pre.routeOrigin || pre.routeDestination || pre.timeframe || pre.flightsPerYear);
  return (
    <Screen
      footer={
        <Button block onClick={onContinue} icon={<ArrowRight aria-hidden className="size-4" />}>
          {touched ? "Continue" : "Skip"}
        </Button>
      }
    >
      <StepHeader
        stage={1}
        eyebrow="Before you start"
        title="A few optional details"
        sub="Skip anything you'd rather not answer."
      />
      <div className="flex flex-col gap-3">
        <Card className="animate-fade-up" style={fadeUp()}>
          <p className="text-[15px] font-semibold leading-snug text-ink-900">
            The flight you just rated, if you know the route
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <AirportField
              id="pre-origin"
              label="From"
              value={pre.routeOrigin}
              onChange={(v) => onChange({ routeOrigin: v })}
              quickPicks={false}
              allowFreeText
            />
            <AirportField
              id="pre-destination"
              label="To"
              value={pre.routeDestination}
              onChange={(v) => onChange({ routeDestination: v })}
              quickPicks={false}
              allowFreeText
            />
          </div>
        </Card>
        <Card className="animate-fade-up" style={fadeUp(60)}>
          <ChoiceGroup
            kind="single"
            label="How far away is that flight?"
            options={TIMEFRAME_OPTIONS}
            value={pre.timeframe}
            onChange={(v) => onChange({ timeframe: v })}
            columns={2}
          />
        </Card>
        <Card className="animate-fade-up" style={fadeUp(120)}>
          <ChoiceGroup
            kind="single"
            label="How many flights do you take in a typical year?"
            options={FLIGHTS_PER_YEAR_OPTIONS}
            value={pre.flightsPerYear}
            onChange={(v) => onChange({ flightsPerYear: v })}
            columns={2}
          />
        </Card>
      </div>
    </Screen>
  );
}
