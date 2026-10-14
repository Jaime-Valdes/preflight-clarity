import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalResults } from "@/components/results/LocalResults";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { ResultsSkeleton } from "@/components/results/ResultsSkeleton";
import { AccessCard, ErrorCard } from "@/components/results/StatusCards";
import { fetchResults } from "@/lib/api.server";

export const metadata: Metadata = {
  title: "Team results",
};

/**
 * /results?key=<ADMIN_KEY> — the team's view of every session.
 * The page itself is static; the part that reads the query string and the
 * backend streams in behind the Suspense boundary.
 */
export default function ResultsPage({ searchParams }: PageProps<"/results">) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/results">["searchParams"] }) {
  const params = await searchParams;
  const raw = params.key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  const data = await fetchResults(key);

  switch (data.status) {
    case "unauthorized":
      return <AccessCard />;
    case "ok":
      return <ResultsDashboard records={data.records} storage={data.storage} />;
    case "no_backend":
      return (
        <LocalResults
          banner={
            data.reason === "not_configured"
              ? "The backend has no storage configured yet — showing sessions saved in this browser only."
              : "No backend configured — showing sessions saved in this browser only."
          }
        />
      );
    case "error":
      return <ErrorCard message={data.message} />;
  }
}
