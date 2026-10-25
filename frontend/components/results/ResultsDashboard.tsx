"use client";

import { HardDrive, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { recordsToCsv } from "@preflight/shared/csv";
import { SIGNUP_PLACEMENTS, SIGNUP_SOURCES, signupStats } from "@preflight/shared/signup";
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
import type { SessionRecord, Signup, StorageKind } from "@preflight/shared/types";
import { useHydrated } from "@/lib/hooks";
import { ChangeBlock } from "./ChangeBlock";
import { ChangeByAnswerBlock } from "./ChangeByAnswerBlock";
import { DistributionsBlock } from "./DistributionsBlock";
import { EngagementBlock } from "./EngagementBlock";
import { ExplorationBlock } from "./ExplorationBlock";
import { InterestBlock } from "./InterestBlock";
import { InterpretationNote } from "./InterpretationNote";
import { KpiRow, ResultsHeader } from "./ResultsHeader";
import { OpenTextBlock } from "./OpenTextBlock";
import { PartsBlock } from "./PartsBlock";
import { PrePostBlock } from "./PrePostBlock";
import { ResponsesTable } from "./ResponsesTable";
import { ResultsSkeleton } from "./ResultsSkeleton";
import { SignupsTable } from "./SignupsTable";
import { Notice } from "./bits";
import { downloadCsv } from "./download";

/** Where the records on screen came from. "browser" = this browser's localStorage. */
export type ResultsSource = StorageKind | "browser";

export interface ResultsDashboardProps {
  records: SessionRecord[];
  /** Product-interest sign-ups (docs/INTEREST.md) from the same store as the records. */
  signups: Signup[];
  /** Why the sign-ups may be incomplete (e.g. the backend has no sign-ups endpoint yet). */
  signupsNote?: string;
  storage: ResultsSource;
  /** Extra note shown under the header (e.g. "No backend configured — …"). */
  banner?: string;
}

const FILE_BANNER =
  "The backend is storing sessions in a local file — set up Supabase before running the real study.";

/**
 * Cheap shape check for sign-ups (an old localStorage entry, a hand-edited
 * file store) so one malformed row cannot crash the Interest block.
 */
function isPlausibleSignup(value: unknown): value is Signup {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<Signup>;
  return (
    typeof s.id === "string" &&
    typeof s.email === "string" &&
    typeof s.createdAt === "string" &&
    SIGNUP_SOURCES.includes(s.source as Signup["source"]) &&
    SIGNUP_PLACEMENTS.includes(s.placement as Signup["placement"])
  );
}

/**
 * The team results page body. Everything below the header is computed from
 * one filtered slice, so every chart, list and the table agree.
 */
export function ResultsDashboard({ records, signups, signupsNote, storage, banner }: ResultsDashboardProps) {
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

  /**
   * Sign-ups follow the test/forced filters (a study sign-up is "forced" when
   * its session was), never "completed only": a debrief sign-up implies a
   * completed session, and version C has no sessions at all.
   */
  const shownSignups = useMemo(() => {
    const forced = new Set(all.filter((r) => r.variantSource === "forced").map((r) => r.sessionId));
    return signups.filter(isPlausibleSignup).filter((s) => {
      if (!filters.includeTest && s.isTest) return false;
      if (!filters.includeForced && s.sessionId && forced.has(s.sessionId)) return false;
      return true;
    });
  }, [all, signups, filters.includeTest, filters.includeForced]);
  /** The rate's denominator comes from the same slice as the KPI counts (test/forced filters only). */
  const interest = useMemo(() => signupStats(shownSignups, base), [shownSignups, base]);

  if (!hydrated) return <ResultsSkeleton />;

  // ph-no-capture: PostHog starts on every route (root layout). This page shows
  // names, emails and answers, so the whole subtree is blanked in replays and
  // left out of autocapture (docs/ANALYTICS.md).
  return (
    <div className="ph-no-capture mx-auto w-full max-w-6xl animate-fade-up px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:px-8">
      <ResultsHeader
        total={all.length}
        shown={filtered.length}
        storage={storage}
        filters={filters}
        onFiltersChange={setFilters}
        onDownload={(scope) => downloadCsv(recordsToCsv(scope === "all" ? all : filtered), `preflight-clarity-sessions-${scope}`)}
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

      {/*
        Dense flow so the full-width breakdown can follow "Anxiety change" in
        reading order while "Which parts" still fills the half-column beside it
        on desktop (no empty cell).
      */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-flow-row-dense lg:grid-cols-2">
        <PrePostBlock reports={measures} className="lg:col-span-2" />
        <ChangeBlock records={filtered} />
        <ChangeByAnswerBlock records={filtered} className="lg:col-span-2" />
        <PartsBlock feedback={feedback} />
        <EngagementBlock records={filtered} />
        <DistributionsBlock records={filtered} />
        <ExplorationBlock records={filtered} className="lg:col-span-2" />
        <OpenTextBlock answers={texts} className="lg:col-span-2" />
        <InterestBlock stats={interest} records={base} note={signupsNote} className="lg:col-span-2" />
        <SignupsTable signups={shownSignups} className="lg:col-span-2" />
        <ResponsesTable records={filtered} className="lg:col-span-2" />
        <InterpretationNote className="lg:col-span-2" />
      </div>
    </div>
  );
}
