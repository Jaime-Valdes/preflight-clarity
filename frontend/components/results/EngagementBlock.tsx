"use client";

import { useMemo, useState } from "react";
import {
  alertStats,
  dashboardTime,
  formatMs,
  formatPct,
  sectionEngagement,
  type SectionEngagement,
} from "@preflight/shared/stats";
import type { SessionRecord, Variant } from "@preflight/shared/types";
import { BarRow, Block, EmptyNote, SERIES, Segmented, Tile } from "./bits";

type Scope = "all" | Variant;

const SCOPE_OPTIONS: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: "all", label: "All" },
  { value: "A", label: "A · Full" },
  { value: "B", label: "B · Minimal" },
];

function SectionRows({ rows }: { rows: SectionEngagement[] }) {
  const shown = rows.filter((r) => r.shown > 0);
  if (shown.length === 0) return <EmptyNote>No dashboard sessions in this slice yet.</EmptyNote>;
  return (
    <div className="divide-y divide-line/60">
      {shown.map((row) => (
        <BarRow
          key={row.id}
          label={row.title}
          hint={`median open ${formatMs(row.medianOpenMs)} · first opened after ${formatMs(row.medianFirstOpenMs)}`}
          pct={row.openRate}
          color={SERIES.magnitude}
          value={
            <>
              <span className="font-semibold">{formatPct(row.openRate)}</span>
              <span className="text-ink-500">
                {" "}
                · {row.opened} of {row.shown}
              </span>
            </>
          }
        />
      ))}
    </div>
  );
}

/** Time on the dashboard, the alert toggle, and per-section open rates and open times. */
export function EngagementBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const [scope, setScope] = useState<Scope>("all");
  const engagement = useMemo(() => sectionEngagement(records), [records]);
  const time = useMemo(() => dashboardTime(records), [records]);
  const alerts = useMemo(() => alertStats(records), [records]);

  const rows = scope === "all" ? engagement.overall : engagement.byVariant[scope];
  const t = scope === "all" ? time.overall : time.byVariant[scope];
  const a = scope === "all" ? alerts.overall : alerts.byVariant[scope];

  return (
    <Block
      id="engagement"
      className={className}
      title="Engagement"
      subtitle="Time only counts while the page was visible. Open rate = sessions that expanded the section at least once."
      aside={<Segmented options={SCOPE_OPTIONS} value={scope} onChange={setScope} label="Variant" />}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Active time" value={formatMs(t.medianActiveMs)} hint={`median · mean ${formatMs(t.meanActiveMs)}`} />
        <Tile label="Wall-clock time" value={formatMs(t.medianTotalMs)} hint={`median · ${t.n} reached the dashboard`} />
        <Tile label="Scroll depth" value={t.medianScrollPct === null ? "—" : `${Math.round(t.medianScrollPct)}%`} hint="median of the deepest scroll position as a share of the page" />
        <Tile
          label="Alert toggle"
          value={formatPct(a.tapRate)}
          hint={a.shown > 0 ? `${a.tapped} of ${a.shown} tapped it · ${a.leftOn} left it on` : "not shown in this slice"}
        />
      </div>
      <SectionRows rows={rows} />
    </Block>
  );
}
