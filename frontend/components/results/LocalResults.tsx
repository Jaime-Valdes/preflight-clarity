"use client";

import { useState } from "react";
import { useHydrated } from "@/lib/hooks";
import { loadLocalResponses } from "@/lib/storage";
import { ResultsDashboard } from "./ResultsDashboard";
import { ResultsSkeleton } from "./ResultsSkeleton";

/**
 * No backend (or a backend without storage): show the sessions saved in this
 * browser. localStorage is read once, after hydration, with a lazy initializer.
 */
export function LocalResults({ banner }: { banner: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <ResultsSkeleton />;
  return <LocalResultsInner banner={banner} />;
}

function LocalResultsInner({ banner }: { banner: string }) {
  const [records] = useState(() => loadLocalResponses());
  return <ResultsDashboard records={records} storage="browser" banner={banner} />;
}
