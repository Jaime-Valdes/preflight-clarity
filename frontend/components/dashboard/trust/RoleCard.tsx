import { Check, Moon, PlaneTakeoff, UserRound } from "lucide-react";
import type { CrewRole, RoleFacts } from "./crew";

const ROLE_ICON: Record<CrewRole, typeof UserRound> = {
  captain: PlaneTakeoff,
  first_officer: UserRound,
  relief: Moon,
};

/**
 * One flight-deck role: what it does and the rules it meets. Deliberately no
 * name, photo, hours or rating — none of that is published for a flight.
 */
export function RoleCard({ facts }: { facts: RoleFacts }) {
  const Icon = ROLE_ICON[facts.role];
  return (
    <div className="rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-dusk-50 text-dusk-600 ring-1 ring-inset ring-dusk-100"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* Same level as the BlockLabel ("Every pilot on board") after the cards. */}
          <h3 className="text-[15px] font-bold leading-snug text-ink-900">{facts.title}</h3>
          <div className="mt-0.5 text-xs leading-snug text-ink-500">{facts.duty}</div>
        </div>
      </div>
      {facts.facts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {facts.facts.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-snug text-ink-700">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-calm-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
