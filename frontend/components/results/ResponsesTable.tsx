"use client";

import { ChevronDown, Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { PART_LABELS, SECTIONS } from "@preflight/shared/sections";
import {
  ANXIETY_START_LABELS,
  BOOK_LIKELIHOOD_LABELS,
  CHECK_FREQUENCY_LABELS,
  DEVICE_LABELS,
  FLIGHTS_PER_YEAR_LABELS,
  MEASURES,
  REPLACE_LABELS,
  STEP_LABELS,
  TIMEFRAME_LABELS,
  TRAVEL_IMPACT_LABELS,
  FEEDBACK_PART_LABELS,
  WORRY_LABELS,
  WOULD_SWITCH_LABELS,
  flightsExplored,
  formatMs,
  formatSigned,
  isCompleted,
  ratingChange,
  sectionsOpened,
  sectionsShown,
  sortNewestFirst,
} from "@preflight/shared/stats";
import type { DeviceType, SessionRecord } from "@preflight/shared/types";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { Block, EmptyNote, Field, deltaClass, formatDateTime } from "./bits";

const PAGE = 30;

const DEVICE_ICON: Record<DeviceType, LucideIcon> = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

const COLUMNS = [
  "Date",
  "Participant",
  "Variant",
  "Device",
  "Status",
  "Anxiety",
  "Control",
  "Predictability",
  "Δ anxiety",
  "Dashboard",
  "Sections",
  "Flights",
  "Alert",
  "Score",
] as const;

function prePost(record: SessionRecord, measure: (typeof MEASURES)[number]): string {
  const pre = record.pre[measure];
  const post = record.post[measure];
  return `${pre ?? "—"} → ${post ?? "—"}`;
}

function alertCell(record: SessionRecord): string {
  const d = record.dashboard;
  if (!d || !sectionsShown(record).includes("alerts")) return "—";
  return d.alert.tapped ? (d.alert.finalOn ? "On" : "Tapped") : "No";
}

const ADDED_VIA_LABEL: Record<string, string> = {
  setup: "own flight",
  alternative: "alternative",
  whatif_day: "another day",
  whatif_time: "another time",
  whatif_wide: "larger plane",
  whatif_route: "another route",
};

/**
 * The optional route and timeframe questions, asked until 2026-10-24. Since
 * then the flight set up (the Flight field) is the route and its date says how
 * far away it is, so this is "" for new sessions and the line is left out.
 */
function oldRouteLine(record: SessionRecord): string {
  const { routeOrigin, routeDestination, timeframe } = record.pre;
  const route = routeOrigin || routeDestination ? `${routeOrigin || "?"} → ${routeDestination || "?"}` : "";
  return [route, timeframe ? TIMEFRAME_LABELS[timeframe] : ""].filter(Boolean).join(" · ");
}

function Details({ record }: { record: SessionRecord }) {
  const { pre, post, flight, dashboard, device } = record;
  const exploration = dashboard?.exploration ?? null;
  const shown = dashboard ? sectionsShown(record) : [];
  const travel = Array.isArray(post.travelImpact) ? post.travelImpact : [];
  const chips = (values: ReadonlyArray<string>, tone: "calm" | "sand") =>
    values.length === 0 ? (
      <span className="text-ink-400">—</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Pill key={v} tone={v === "none" ? "neutral" : tone}>
            {v in FEEDBACK_PART_LABELS ? FEEDBACK_PART_LABELS[v as keyof typeof FEEDBACK_PART_LABELS] : v}
          </Pill>
        ))}
      </span>
    );

  return (
    <div className="grid gap-5 rounded-2xl bg-canvas/70 px-4 py-4 ring-1 ring-inset ring-line/70 max-md:sticky max-md:left-5 max-md:w-[calc(100vw-4.5rem)] md:grid-cols-3">
      <dl className="flex flex-col gap-3">
        <Field label="Session">
          <span className="font-mono text-xs text-ink-700">{record.sessionId}</span>
          <span className="block text-xs text-ink-500">
            seq {record.seq} · created {formatDateTime(record.createdAt)} · updated {formatDateTime(record.updatedAt)}
            {record.completedAt ? ` · completed ${formatDateTime(record.completedAt)}` : ""}
          </span>
        </Field>
        <Field label="Flight">
          {flight ? (
            <>
              {flight.route} · {flight.flightNumber} · {flight.airline}
              <span className="block text-xs text-ink-500">
                {flight.aircraft} ({flight.bodyType}-body) · {formatMs(flight.airborneMin * 60_000)} airborne · {flight.daysUntil} days
                out · {flight.forecastMode} · smoothness {flight.smoothnessScore} · max {flight.maxIntensity}
              </span>
            </>
          ) : (
            <span className="text-ink-400">Not set up</span>
          )}
        </Field>
        <Field label="Flies">
          {pre.flightsPerYear ? FLIGHTS_PER_YEAR_LABELS[pre.flightsPerYear] : "—"}
          {oldRouteLine(record) ? <span className="block text-xs text-ink-500">Pre-survey route · {oldRouteLine(record)}</span> : null}
        </Field>
        <Field label="Worries most">
          {pre.worriesMost ? (WORRY_LABELS[pre.worriesMost] ?? pre.worriesMost) : "—"}
          {pre.worriesOtherText ? ` — “${pre.worriesOtherText}”` : ""}
        </Field>
        <Field label="Anxiety starts">{pre.anxietyStarts ? (ANXIETY_START_LABELS[pre.anxietyStarts] ?? pre.anxietyStarts) : "—"}</Field>
        <Field label="Device">
          {device ? `${DEVICE_LABELS[device.type]} · ${device.viewportW}×${device.viewportH}${device.touch ? " · touch" : ""}` : "—"}
          {device?.userAgent ? <span className="line-clamp-1 break-all text-xs text-ink-400" title={device.userAgent}>{device.userAgent}</span> : null}
        </Field>
      </dl>

      <dl className="flex flex-col gap-3">
        <Field label="Felt better">{chips(post.feltBetter, "calm")}</Field>
        <Field label="More anxious">{chips(post.feltWorse, "sand")}</Field>
        {post.feltWorseText ? <Field label="More anxious — in their words">“{post.feltWorseText}”</Field> : null}
        <Field label="Would check it">{post.checkFrequency ? CHECK_FREQUENCY_LABELS[post.checkFrequency] : "—"}</Field>
        <Field label="Would replace">
          {post.wouldReplace.length ? post.wouldReplace.map((o) => REPLACE_LABELS[o]).join(", ") : "—"}
          {post.wouldReplaceText ? <span className="block text-xs text-ink-500">“{post.wouldReplaceText}”</span> : null}
        </Field>
        <Field label="Still anxious about">{post.stillScaredOf ? `“${post.stillScaredOf}”` : "—"}</Field>
        <Field label="More likely to book">
          {post.bookLikelihood ? (BOOK_LIKELIHOOD_LABELS[post.bookLikelihood] ?? post.bookLikelihood) : "—"}
        </Field>
        <Field label="Travel plans">
          {travel.length > 0 ? travel.map((o) => TRAVEL_IMPACT_LABELS[o] ?? o).join(", ") : "—"}
          {post.travelImpactOtherText ? ` — “${post.travelImpactOtherText}”` : ""}
        </Field>
        {/* Asked in variant A until 2026-10-24; only sessions that answered still show it. */}
        {post.wouldSwitch ? <Field label="Would switch">{WOULD_SWITCH_LABELS[post.wouldSwitch] ?? post.wouldSwitch}</Field> : null}
        <Field label="First name">{record.firstName || "—"}</Field>
        <Field label="Email">{record.email || "—"}</Field>
      </dl>

      <dl className="flex flex-col gap-3">
        <Field label="Dashboard">
          {dashboard ? (
            <>
              {formatMs(dashboard.activeMs)} active · {formatMs(dashboard.totalMs)} wall-clock
              <span className="block text-xs text-ink-500">
                scrolled to {dashboard.maxScrollPct}% · {dashboard.events.length} events
                {dashboard.resumed ? " · resumed after a reload" : ""} · alert {dashboard.alert.tapped ? `tapped ${dashboard.alert.taps}×` : "not tapped"}
              </span>
            </>
          ) : (
            <span className="text-ink-400">Not reached</span>
          )}
        </Field>
        {dashboard ? (
          <Field label="Sections">
            <ul className="flex flex-col gap-1 text-sm">
              {SECTIONS.filter((s) => shown.includes(s.id)).map((s) => {
                const stats = dashboard.sections[s.id];
                const opened = (stats?.opens ?? 0) > 0;
                return (
                  <li key={s.id} className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate", opened ? "text-ink-900" : "text-ink-400")}>{PART_LABELS[s.id]}</span>
                    <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                      {opened ? `${stats?.opens}× · ${formatMs(stats?.openMs)}` : "not opened"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Field>
        ) : null}
        {exploration && exploration.flights.length > 0 ? (
          <Field label="Flights looked at">
            <ul className="flex flex-col gap-1 text-sm">
              {exploration.flights.map((f, i) => {
                const tags = [
                  i === 0 ? "own flight" : (ADDED_VIA_LABEL[f.addedVia] ?? f.addedVia),
                  f.id === exploration.preferredFlightId ? "preferred" : null,
                  f.id === exploration.endedOnFlightId ? "finished here" : null,
                ].filter(Boolean);
                return (
                  <li key={f.id} className="min-w-0 text-ink-900">
                    {f.summary.route} · {f.input.date} · score {f.summary.smoothnessScore}
                    <span className="block text-xs text-ink-500 tabular-nums">
                      {[...tags, `${formatMs(exploration.flightMs[f.id] ?? 0)} visible`].join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <span className="mt-1 block text-xs text-ink-500">
              {exploration.switches} switches · compare opened {exploration.compares}× ({formatMs(exploration.compareMs)})
            </span>
          </Field>
        ) : null}
      </dl>
    </div>
  );
}

function Row({ record, open, onToggle }: { record: SessionRecord; open: boolean; onToggle: () => void }) {
  const completed = isCompleted(record);
  const change = ratingChange(record, "anxiety");
  const opened = sectionsOpened(record);
  const DeviceIcon = record.device ? DEVICE_ICON[record.device.type] : Smartphone;
  const cell = "px-2.5 py-2.5 align-middle whitespace-nowrap";

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={cn("cursor-pointer border-t border-line/70 transition-colors hover:bg-canvas/70", open && "bg-canvas/60")}
      >
        <td className={cn(cell, "pl-2")}>
          <span className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide details" : "Show details"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-line/60 hover:text-ink-900"
            >
              <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
            <span className="tabular-nums">{formatDateTime(record.createdAt)}</span>
          </span>
        </td>
        <td className={cn(cell, "max-w-40 truncate text-ink-700")} title={record.participant || undefined}>
          {record.participant || <span className="text-ink-400">—</span>}
        </td>
        <td className={cell}>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink-900 ring-1 ring-inset ring-line">
              {record.variant}
            </span>
            {record.variantSource === "forced" ? <span className="text-xs text-ink-400">forced</span> : null}
          </span>
        </td>
        <td className={cell}>
          <span className="inline-flex items-center gap-1.5 text-ink-700">
            <DeviceIcon aria-hidden className="size-4 text-ink-400" />
            {record.device ? DEVICE_LABELS[record.device.type] : "—"}
          </span>
        </td>
        <td className={cell}>
          <span className="flex items-center gap-1">
            {completed ? (
              <Pill tone="calm">Completed</Pill>
            ) : (
              <Pill tone="neutral">Stopped · {STEP_LABELS[record.step] ?? record.step}</Pill>
            )}
            {record.isTest ? <Pill tone="dusk">Test</Pill> : null}
          </span>
        </td>
        {MEASURES.map((m) => (
          <td key={m} className={cn(cell, "tabular-nums text-ink-700")}>
            {prePost(record, m)}
          </td>
        ))}
        <td className={cn(cell, "font-semibold tabular-nums", deltaClass(change))}>{formatSigned(change, 0)}</td>
        <td className={cn(cell, "tabular-nums text-ink-700")}>{formatMs(record.dashboard?.activeMs)}</td>
        <td className={cn(cell, "tabular-nums text-ink-700")}>{opened ? `${opened.opened} / ${opened.shown}` : "—"}</td>
        <td className={cn(cell, "tabular-nums text-ink-700")}>{flightsExplored(record) ?? "—"}</td>
        <td className={cn(cell, "text-ink-700")}>{alertCell(record)}</td>
        <td className={cn(cell, "pr-2 tabular-nums text-ink-700")}>{record.flight ? record.flight.smoothnessScore : "—"}</td>
      </tr>
      {open ? (
        <tr className="border-t border-line/60">
          <td colSpan={COLUMNS.length} className="px-2 pb-4 pt-1">
            <Details record={record} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** Every session in the current slice, newest first. Tap a row for the full record. */
export function ResponsesTable({ records, className }: { records: SessionRecord[]; className?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const rows = sortNewestFirst(records);
  const visible = rows.slice(0, limit);

  return (
    <Block
      id="responses"
      className={className}
      title="Responses"
      subtitle={`${rows.length} ${rows.length === 1 ? "session" : "sessions"} in this slice, newest first. Tap a row for the full record. Scroll sideways on small screens.`}
    >
      {rows.length === 0 ? (
        <EmptyNote>No sessions match these filters yet.</EmptyNote>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:thin]">
          <table className="w-full min-w-[1140px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {COLUMNS.map((c, i) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap px-2.5 pb-2 pt-1 font-semibold", i === 0 && "pl-2", i === COLUMNS.length - 1 && "pr-2")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <Row key={r.sessionId} record={r} open={openId === r.sessionId} onToggle={() => setOpenId(openId === r.sessionId ? null : r.sessionId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="h-11 rounded-full px-5 text-sm font-semibold text-breeze-700 ring-1 ring-inset ring-line-strong hover:bg-breeze-50"
          >
            Show {Math.min(PAGE, rows.length - limit)} more
          </button>
        </div>
      ) : null}
      <p className="text-xs text-ink-400">
        Columns: pre → post for each 0–10 rating · Δ anxiety = post − pre · Dashboard = active time · Sections = opened / shown · Flights = flights looked at in variant A, their own included · Score = the smoothness score of the flight they were shown.
      </p>
    </Block>
  );
}
