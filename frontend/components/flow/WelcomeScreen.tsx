import { ArrowRight, Clock3, Sparkles, DoorOpen, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Wordmark } from "./StepHeader";

interface WelcomeScreenProps {
  onAgree: () => void;
}

const POINTS: Array<{ icon: ReactNode; title: string; detail: string }> = [
  { icon: <UserRound />, title: "Anonymous", detail: "No account, no name. We keep your answers, the flight you enter and basic device and browser info (for example phone or desktop, screen size)." },
  { icon: <Clock3 />, title: "About 5–10 minutes", detail: "A few questions, one screen to explore, a few more questions." },
  {
    icon: <Sparkles />,
    title: "Illustrative data",
    detail:
      "You'll see an example flight on a route you choose, shown as its briefing would look the day before departure. The details are made up for this study. They are not a real forecast.",
  },
  { icon: <DoorOpen />, title: "Stop anytime", detail: "Just close the page. Answers you've already given are kept." },
];

export function WelcomeScreen({ onAgree }: WelcomeScreenProps) {
  return (
    <Screen
      footer={
        <Button block onClick={onAgree} icon={<ArrowRight aria-hidden className="size-4" />}>
          I agree — let&rsquo;s start
        </Button>
      }
    >
      <Wordmark className="animate-fade-up" />

      <div className="mt-9 animate-fade-up [animation-delay:60ms]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-calm-700">A short study</p>
        <h1 tabIndex={-1} className="mt-1.5 text-[28px] font-bold leading-[1.12] tracking-[-0.01em] text-ink-900 outline-none">
          A closer look at an upcoming flight
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
          We&rsquo;re testing a prototype for nervous flyers. It takes about 5–10 minutes. All data shown is
          illustrative.
        </p>
      </div>

      <ul className="mt-7 flex flex-col gap-2.5 animate-fade-up [animation-delay:120ms]">
        {POINTS.map((p) => (
          <li
            key={p.title}
            className="flex items-start gap-3.5 rounded-2xl bg-surface px-4 py-3.5 shadow-soft ring-1 ring-line/80"
          >
            <span
              aria-hidden
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100 [&_svg]:size-[18px]"
            >
              {p.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-snug text-ink-900">{p.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-500">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-500 animate-fade-up [animation-delay:180ms]">
        Run by a student team: Allen, Arshad, Jaime &amp; Krish. By continuing, you agree to take part.
      </p>
    </Screen>
  );
}
