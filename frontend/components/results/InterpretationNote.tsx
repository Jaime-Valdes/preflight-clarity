import { Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const POINTS = [
  "Small samples. With a handful of sessions per variant, a one-point difference can be noise. Read everything here as directional, not as a result.",
  "No significance testing. The page shows means, medians and shares only — nothing is adjusted or modelled.",
  "Variant assignment is random unless the link forced it (?v=A or ?v=B). Forced sessions are flagged and can be excluded with the filter; test sessions (?test=1) are hidden by default.",
  "Each participant chose their own route and date, so the flight they saw — and its smoothness score — varies between sessions. The score is kept per session so you can check whether reactions follow the forecast rather than the variant.",
  "Two self-reported 0–10 ratings taken minutes apart can move for reasons unrelated to the dashboard (settling in, wanting to be helpful). A drop is not proof the dashboard works; a rise is not proof it hurts.",
  "Sign-ups measure interest in a launch email, not use or willingness to pay. The study's sign-up rate counts real sessions that reached the debrief, where the form is identical in A and B; version C sign-ups have no session and no rate.",
];

/** Short, honest reading guide for the numbers above. */
export function InterpretationNote({ className }: { className?: string }) {
  return (
    <Card className={cn("bg-breeze-50/60 ring-breeze-100", className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-breeze-700 ring-1 ring-inset ring-breeze-100"
        >
          <Info className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-900">How to read these numbers</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-ink-700">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
