"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type ResultsTab = "study" | "d";

const TABS: ReadonlyArray<{ value: ResultsTab; label: string; hint: string }> = [
  { value: "study", label: "A/B study", hint: "Sessions, surveys, sign-ups" },
  { value: "d", label: "Version D", hint: "Flight Day Pack test" },
];

/** The tab named in the address's hash ("#d"); the study tab otherwise. */
function tabFromHash(): ResultsTab {
  if (typeof window === "undefined") return "study";
  return window.location.hash === "#d" ? "d" : "study";
}

/**
 * The selected tab, kept in the hash so "/results?key=…#d" opens on version D and a reload stays put.
 * Reads the hash after hydration (the dashboard renders only after it).
 */
export function useResultsTab(): [ResultsTab, (tab: ResultsTab) => void] {
  const [tab, setTab] = useState<ResultsTab>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const select = useCallback((next: ResultsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.hash = next === "d" ? "d" : "";
    window.history.replaceState(window.history.state, "", url.toString().replace(/#$/, ""));
  }, []);
  return [tab, select];
}

export function ResultsTabBar({ tab, onChange }: { tab: ResultsTab; onChange: (tab: ResultsTab) => void }) {
  return (
    <div role="tablist" aria-label="Results" className="flex gap-1 border-b border-line">
      {TABS.map((t) => {
        const selected = t.value === tab;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`results-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`results-panel-${t.value}`}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = TABS[(TABS.findIndex((x) => x.value === tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              onChange(next.value);
              document.getElementById(`results-tab-${next.value}`)?.focus();
            }}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "-mb-px flex min-h-12 flex-col items-start justify-center border-b-2 px-4 pb-2 pt-2 text-left transition-colors",
              selected ? "border-night-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
            )}
          >
            <span className="text-sm font-bold">{t.label}</span>
            <span className="text-xs font-normal text-ink-400">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
