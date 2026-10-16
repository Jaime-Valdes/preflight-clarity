import { PendingNote } from "../flight/PendingNote";
import { marker } from "../flight/availability";
import type { SeriesStyle } from "./facts";
import { LineKey } from "./TimelineChart";

interface PendingFlight {
  id: string;
  /** "DL 1423" (+ date / route when the compared flights differ in them). */
  name: string;
  style: SeriesStyle;
  /** Departure date ("YYYY-MM-DD"). */
  date: string;
}

interface PendingTimelinesProps {
  /** Compared flights whose turbulence forecast doesn't exist yet. */
  flights: readonly PendingFlight[];
  /** Whether the chart above shows the other flights. */
  charted: boolean;
  className?: string;
}

/**
 * Version C compare page: in place of (or under) the overlaid timeline, when
 * each of the other flights' turbulence forecasts starts — never a made-up
 * timeline (docs/FEASIBILITY.md).
 */
export function PendingTimelines({ flights, charted, className }: PendingTimelinesProps) {
  const dates = new Set(flights.map((f) => f.date));
  const first = flights[0];

  // Nothing to chart and one date for all: a single marker says it.
  if (!charted && dates.size === 1 && first) {
    return (
      <div className={className}>
        <PendingNote item="turbulence" date={first.date} subject="Turbulence timelines" variant="block" />
        <p className="mt-2.5 px-1 text-xs leading-snug text-ink-500">
          Each flight&rsquo;s timeline appears here once its forecast exists. Until then, the route&rsquo;s typical pattern is
          above.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-[13px] font-semibold leading-snug text-ink-900">
        {charted ? "Not on the chart yet" : "Timelines appear with each forecast"}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {flights.map((f) => {
          const m = marker("turbulence", f.date);
          return (
            <li key={f.id} className="flex gap-2.5 text-[13px] leading-snug">
              <LineKey style={f.style} className="mt-[3px] shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold text-ink-900">{f.name}</span>
                <span className="block text-ink-700">
                  {m.subject} from <span className="whitespace-nowrap">{m.from}</span>
                  <span className="text-ink-500"> · {m.lead}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
