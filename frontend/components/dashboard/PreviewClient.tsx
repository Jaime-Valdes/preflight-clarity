"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, isISODate } from "@preflight/shared/dates";
import { generateFlight, normalizeInput } from "@preflight/shared/fakeFlight";
import { SCHEDULE_DAYS } from "@preflight/shared/forecast";
import { sectionMeta } from "@preflight/shared/sections";
import type { DashboardMetrics, Flight, Variant } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { useQueryParam, useTodayISO } from "@/lib/hooks";
import { Dashboard, DashboardSkeleton } from "./Dashboard";

const DEFAULT_ORIGIN = "JFK";
const DEFAULT_DESTINATION = "LAX";
const DEFAULT_DAYS_AHEAD = 47;

type Generated = { ok: true; flight: Flight } | { ok: false; message: string };

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * /preview?origin=JFK&destination=LAX&date=2026-11-26&v=A — the team's demo
 * of the dashboard alone, exactly as the study shows it: the day-before
 * briefing of an example flight on the route (Dashboard does that). Reads the
 * query string on the client, generates the flight, saves nothing.
 */
export function PreviewClient() {
  const today = useTodayISO();
  const originParam = useQueryParam("origin");
  const destinationParam = useQueryParam("destination");
  const dateParam = useQueryParam("date");
  const variantParam = useQueryParam("v");
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<DashboardMetrics | null>(null);

  const variant: Variant = variantParam?.trim().toUpperCase() === "B" ? "B" : "A";
  const origin = originParam?.trim() || DEFAULT_ORIGIN;
  const destination = destinationParam?.trim() || DEFAULT_DESTINATION;
  const requestedDate = dateParam?.trim() ?? "";
  // A malformed, past or not-yet-scheduled date (> SCHEDULE_DAYS ahead) is ignored (the study flow validates
  // dates; this is the team's demo link).
  const dateUsable =
    isISODate(requestedDate) && (!today || (requestedDate >= today && requestedDate <= addDays(today, SCHEDULE_DAYS)));
  const date = dateUsable ? requestedDate : today ? addDays(today, DEFAULT_DAYS_AHEAD) : null;
  const dateIgnored = requestedDate !== "" && !dateUsable && date !== null;

  const generated = useMemo<Generated | null>(() => {
    if (!date) return null;
    try {
      return { ok: true, flight: generateFlight(normalizeInput({ origin, destination, date })) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [origin, destination, date]);

  const otherVariant: Variant = variant === "A" ? "B" : "A";
  const switchParams = new URLSearchParams();
  if (originParam) switchParams.set("origin", originParam);
  if (destinationParam) switchParams.set("destination", destinationParam);
  if (dateParam) switchParams.set("date", dateParam);
  switchParams.set("v", otherVariant);

  return (
    <>
      <div className="bg-night-950 text-white">
        <div className="mx-auto flex max-w-[440px] items-center justify-between gap-3 px-5 py-2 text-xs">
          <span className="min-w-0 truncate">
            <span className="font-semibold">Preview</span>
            <span className="text-white/70">
              {dateIgnored ? ` — date ignored, using ${date}` : " — nothing is saved"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-white/80">
            <span>Variant {variant}</span>
            <span aria-hidden className="text-white/30">·</span>
            {/* A full navigation on purpose: the client reads the query string on load. */}
            <a href={`/preview?${switchParams.toString()}`} className="font-semibold text-calm-200 underline-offset-2 hover:underline">
              Try {otherVariant}
            </a>
          </span>
        </div>
      </div>

      {!today || !generated ? (
        <DashboardSkeleton variant={variant} />
      ) : !generated.ok ? (
        <Screen>
          <Card className="mt-2">
            <p className="text-base font-bold text-ink-900">That flight couldn&rsquo;t be generated</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{generated.message}</p>
            <p className="mt-3 text-xs text-ink-500">
              Try <span className="font-mono">/preview?origin=JFK&amp;destination=LAX&amp;date=2026-11-26&amp;v=A</span>
            </p>
          </Card>
        </Screen>
      ) : result ? (
        <PreviewDone
          metrics={result}
          flight={generated.flight}
          onAgain={() => {
            setResult(null);
            setRun((n) => n + 1);
          }}
        />
      ) : (
        <Dashboard
          key={`${generated.flight.id}-${variant}-${run}`}
          flight={generated.flight}
          variant={variant}
          onDone={setResult}
        />
      )}
    </>
  );
}

function PreviewDone({ metrics, flight, onAgain }: { metrics: DashboardMetrics; flight: Flight; onAgain: () => void }) {
  const opened = metrics.sectionOrder.filter((id) => (metrics.sections[id]?.opens ?? 0) > 0);
  return (
    <Screen
      footer={
        <Button block variant="secondary" onClick={onAgain} icon={<RotateCcw aria-hidden className="size-4" />}>
          Explore again
        </Button>
      }
    >
      <Card className="mt-2 animate-fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-calm-700">Preview finished</p>
        <p className="mt-1.5 text-lg font-bold leading-tight text-ink-900">That&rsquo;s the end of the dashboard</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          In the study, the post-survey comes next. Nothing from this preview was saved.
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-500">Flight</dt>
          <dd className="text-ink-900 tabular-nums">
            {flight.flightNumber} · {flight.origin.code} → {flight.destination.code}
          </dd>
          <dt className="text-ink-500">Time</dt>
          <dd className="text-ink-900 tabular-nums">
            {formatMs(metrics.totalMs)} ({formatMs(metrics.activeMs)} visible)
          </dd>
          <dt className="text-ink-500">Opened</dt>
          <dd className="text-ink-900">{opened.length ? opened.map((id) => sectionMeta(id).title).join(", ") : "No sections"}</dd>
          <dt className="text-ink-500">Scrolled</dt>
          <dd className="text-ink-900 tabular-nums">{metrics.maxScrollPct}% of the page</dd>
          {metrics.exploration ? (
            <>
              <dt className="text-ink-500">Explored</dt>
              <dd className="text-ink-900 tabular-nums">
                {metrics.exploration.flights.length} flight{metrics.exploration.flights.length === 1 ? "" : "s"} ·{" "}
                {metrics.exploration.switches} switch{metrics.exploration.switches === 1 ? "" : "es"} ·{" "}
                {metrics.exploration.compares} compare{metrics.exploration.compares === 1 ? "" : "s"}
              </dd>
            </>
          ) : null}
          <dt className="text-ink-500">Events</dt>
          <dd className="text-ink-900 tabular-nums">{metrics.events.length}</dd>
        </dl>
      </Card>
    </Screen>
  );
}
