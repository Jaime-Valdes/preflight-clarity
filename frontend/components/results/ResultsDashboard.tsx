"use client";

import { HardDrive, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { recordsToCsv } from "@preflight/shared/csv";
import {
  DEFAULT_FILTERS,
  applyFilters,
  countSessions,
  isCompleted,
  isPlausibleRecord,
  openTextAnswers,
  partFeedback,
  sortNewestFirst,
  summarizeMeasures,
  type StatsFilters,
} from "@preflight/shared/stats";
import type { SessionRecord, StorageKind } from "@preflight/shared/types";
import { useHydrated } from "@/lib/hooks";
import { ChangeBlock } from "./ChangeBlock";
import { DistributionsBlock } from "./DistributionsBlock";
import { EngagementBlock } from "./EngagementBlock";
import { InterpretationNote } from "./InterpretationNote";
import { KpiRow, ResultsHeader } from "./ResultsHeader";
import { OpenTextBlock } from "./OpenTextBlock";
import { PartsBlock } from "./PartsBlock";
import { PrePostBlock } from "./PrePostBlock";
import { ResponsesTable } from "./ResponsesTable";
import { ResultsSkeleton } from "./ResultsSkeleton";
import { Notice } from "./bits";

/** Where the records on screen came from. "browser" = this browser's localStorage. */
export type ResultsSource = StorageKind | "browser";

export interface ResultsDashboardProps {
  records: SessionRecord[];
  storage: ResultsSource;
  /** Extra note shown under the header (e.g. "No backend configured — …"). */
  banner?: string;
}

const FILE_BANNER =
  "The backend is storing sessions in a local file — set up Supabase before running the real study.";

function downloadCsv(records: SessionRecord[], scope: "filtered" | "all"): void {
  const csv = recordsToCsv(records);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `preflight-clarity-sessions-${scope}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * The team results page body. Everything below the header is computed from
 * one filtered slice, so every chart, list and the table agree.
 */
export function ResultsDashboard({ records, storage, banner }: ResultsDashboardProps) {
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<StatsFilters>(DEFAULT_FILTERS);

  const all = useMemo(() => sortNewestFirst(records.filter(isPlausibleRecord)), [records]);
  /** Test/forced filters only — the completion rate needs the incomplete sessions. */
  const base = useMemo(() => applyFilters(all, { ...filters, completedOnly: false }), [all, filters]);
  const filtered = useMemo(() => (filters.completedOnly ? base.filter(isCompleted) : base), [base, filters.completedOnly]);

  const counts = useMemo(() => countSessions(base), [base]);
  const measures = useMemo(() => summarizeMeasures(filtered), [filtered]);
  const feedback = useMemo(() => partFeedback(filtered), [filtered]);
  const texts = useMemo(() => openTextAnswers(filtered), [filtered]);

  if (!hydrated) return <ResultsSkeleton />;

  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-up px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:px-8">
      <ResultsHeader
        total={all.length}
        shown={filtered.length}
        storage={storage}
        filters={filters}
        onFiltersChange={setFilters}
        onDownload={(scope) => downloadCsv(scope === "all" ? all : filtered, scope)}
      />

      {banner || storage === "file" ? (
        <div className="mt-5 flex flex-col gap-2">
          {banner ? <Notice icon={<Info aria-hidden />}>{banner}</Notice> : null}
          {storage === "file" ? (
            <Notice tone="sand" icon={<HardDrive aria-hidden />}>
              {FILE_BANNER}
            </Notice>
          ) : null}
        </div>
      ) : null}

      <KpiRow counts={counts} filtered={filtered} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PrePostBlock reports={measures} className="lg:col-span-2" />
        <ChangeBlock records={filtered} />
        <PartsBlock feedback={feedback} />
        <EngagementBlock records={filtered} />
        <DistributionsBlock records={filtered} />
        <OpenTextBlock answers={texts} className="lg:col-span-2" />
        <ResponsesTable records={filtered} className="lg:col-span-2" />
        <InterpretationNote className="lg:col-span-2" />
      </div>
    </div>
  );
}
