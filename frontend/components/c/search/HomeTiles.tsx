import { CloudSun, Gauge, Info, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_CLASSES, type Tone } from "@/lib/theme";

const TILES: ReadonlyArray<{ title: string; text: string; icon: ReactNode; tone: Tone }> = [
  {
    title: "Smoothness score & turbulence timeline",
    text: "A score out of 100 for every flight, and a timeline of where light bumps are expected between takeoff and landing.",
    icon: <Gauge />,
    tone: "calm",
  },
  {
    title: "Crew & aircraft",
    text: "Who is flying — the captain’s and first officer’s hours — and the plane itself: model, age and seat layout.",
    icon: <UsersRound />,
    tone: "dusk",
  },
  {
    title: "Airline & weather",
    text: "How often the airline arrives on time, cabin comfort, and the expected weather at both ends of the trip.",
    icon: <CloudSun />,
    tone: "breeze",
  },
];

/** Home: three short tiles on what the comparison covers, and the illustrative-data note. */
export function HomeTiles() {
  return (
    <>
      <section aria-labelledby="c-home-compare" className="mt-10 sm:mt-12">
        <h2 id="c-home-compare" className="text-lg font-bold text-ink-900">
          What you can compare
        </h2>
        <p className="mt-1 text-sm text-ink-500">Every result carries the same pre-flight information, so two flights line up fact by fact.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {TILES.map((tile) => {
            const tone = TONE_CLASSES[tile.tone];
            return (
              <li key={tile.title} className="flex gap-4 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 sm:flex-col sm:gap-0">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset [&_svg]:size-5",
                    tone.bg,
                    tone.text,
                    tone.ring,
                  )}
                >
                  {tile.icon}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-snug text-ink-900 sm:mt-3.5">{tile.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{tile.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-8 flex items-start gap-2 rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-ink-500 ring-1 ring-inset ring-line">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-breeze-500" />
        <span>
          This is a prototype. Every flight, price and forecast here is illustrative, made up to look realistic, and
          nothing can be booked.
        </span>
      </p>
    </>
  );
}
