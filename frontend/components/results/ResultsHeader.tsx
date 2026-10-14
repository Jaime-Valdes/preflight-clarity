"use client";

import { Check, Database, Download, Globe, HardDrive, type LucideIcon } from "lucide-react";
import {
  alertStats,
  dashboardTime,
  formatCount,
  formatMs,
  formatPct,
  type SessionCounts,
  type StatsFilters,
} from "@preflight/shared/stats";
import type { SessionRecord } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/theme";
import { Kpi } from "./bits";
import type { ResultsSource } from "./ResultsDashboard";

const SOURCE_PILL: Record<ResultsSource, { label: string; tone: Tone; icon: LucideIcon }> = {
  supabase: { label: "Supabase", tone: "calm", icon: Database },
  file: { label: "Local file store", tone: "sand", icon: HardDrive },
  none: { label: "No storage", tone: "neutral", icon: HardDrive },
  browser: { label: "This browser only", tone: "neutral", icon: Globe },
};

interface ResultsHeaderProps {
  total: number;
  shown: number;
  storage: ResultsSource;
  filters: StatsFilters;
  onFiltersChange: (next: StatsFilters) => void;
  onDownload: (scope: "filtered" | "all") => void;
}

function FilterChip({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors sm:h-10",
        on ? "bg-night-900 text-white ring-night-900 hover:bg-night-800" : "bg-surface text-ink-700 ring-line-strong hover:bg-canvas",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-full ring-1 ring-inset",
          on ? "bg-white/15 ring-white/30" : "ring-line-strong",
        )}
      >
        {on ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {label}
    </button>
  );
}

export function ResultsHeader({ total, shown, storage, filters, onFiltersChange, onDownload }: ResultsHeaderProps) {
  const source = SOURCE_PILL[storage];
  const SourceIcon = source.icon;
  const toggle = (key: keyof StatsFilters) => onFiltersChange({ ...filters, [key]: !filters[key] });

  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Pre-Flight Clarity · Team</p>
          <h1 className="mt-1 text-[28px] font-bold leading-none text-ink-900 sm:text-[32px]">Results</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <span className="tabular-nums">
              {formatCount(total)} {total === 1 ? "session" : "sessions"} recorded
            </span>
            <span aria-hidden className="text-ink-300">
              ·
            </span>
            <Pill tone={source.tone} icon={<SourceIcon aria-hidden className="size-3.5" />}>
              {source.label}
            </Pill>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Download aria-hidden className="size-4" />}
            onClick={() => onDownload("filtered")}
            disabled={shown === 0}
          >
            Download CSV
          </Button>
          <Button variant="secondary" size="md" onClick={() => onDownload("all")} disabled={total === 0}>
            All sessions
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip on={filters.completedOnly} label="Completed only" onToggle={() => toggle("completedOnly")} />
        <FilterChip on={filters.includeTest} label="Include test sessions" onToggle={() => toggle("includeTest")} />
        <FilterChip on={filters.includeForced} label="Include forced variants" onToggle={() => toggle("includeForced")} />
        <p className="w-full text-sm text-ink-500 tabular-nums sm:ml-auto sm:w-auto">
          Showing {formatCount(shown)} of {formatCount(total)}
        </p>
      </div>
    </header>
  );
}

/** The six headline tiles. Counts use the test/forced filters only; time and alerts use the full filter set. */
export function KpiRow({ counts, filtered }: { counts: SessionCounts; filtered: SessionRecord[] }) {
  const time = dashboardTime(filtered).overall;
  const alerts = alertStats(filtered).overall;
  const { byDevice } = counts;
  const devicesTotal = byDevice.mobile + byDevice.tablet + byDevice.desktop;
  const phoneShare = devicesTotal > 0 ? byDevice.mobile / devicesTotal : null;

  return (
    <div id="kpis" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Sessions started"
        value={formatCount(counts.started)}
        hint={`${formatCount(counts.completed)} completed${counts.test ? ` · ${counts.test} test` : ""}`}
      />
      <Kpi
        label="Completion rate"
        value={formatPct(counts.completionRate)}
        hint={counts.started > 0 ? `${counts.completed} of ${counts.started} finished the post-survey` : "No sessions yet"}
      />
      <Kpi
        label="Variant A · full"
        value={formatCount(counts.byVariant.A.completed)}
        hint={`${counts.byVariant.A.started} started · ${formatPct(counts.byVariant.A.completionRate)} completed`}
      />
      <Kpi
        label="Variant B · minimal"
        value={formatCount(counts.byVariant.B.completed)}
        hint={`${counts.byVariant.B.started} started · ${formatPct(counts.byVariant.B.completionRate)} completed`}
      />
      <Kpi
        label="On a phone"
        value={formatPct(phoneShare)}
        hint={`${byDevice.mobile} phone · ${byDevice.tablet} tablet · ${byDevice.desktop} desktop`}
      />
      <Kpi
        label="Dashboard time"
        value={formatMs(time.medianActiveMs)}
        hint={
          time.n > 0
            ? `median active · mean ${formatMs(time.meanActiveMs)} · alerts tapped ${formatPct(alerts.tapRate)}`
            : "Nobody reached the dashboard yet"
        }
      />
    </div>
  );
}
