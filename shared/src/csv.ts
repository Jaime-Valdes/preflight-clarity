/*
 * CSV export of session records: one row per session, every field flattened.
 *
 * - RFC 4180: comma separated, CRLF line endings, cells containing commas,
 *   quotes or line breaks are double-quoted with quotes doubled.
 * - A UTF-8 byte-order mark so Excel opens accented text correctly.
 * - CSV-injection protection: free text that starts with = + - @ or a tab /
 *   carriage return is prefixed with a single quote so spreadsheet apps never
 *   treat a participant's answer as a formula. Numeric cells are written as
 *   numbers and are never prefixed, so negative deltas stay numeric.
 */
import { SECTION_IDS } from "./sections";
import { flightsExplored, isCompleted, ratingChange, sectionsOpened, sectionsShown } from "./stats";
import type { SessionRecord } from "./types";

type Cell = string | number | boolean | null | undefined;

export const CSV_BOM = "﻿";
const CRLF = "\r\n";

/** Escape one cell for RFC 4180 output (with formula-injection protection for text). */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let text = value;
  if (text === "") return "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function seconds(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return Math.round(ms / 100) / 10;
}

function joinList(values: readonly string[]): string {
  return values.join("; ");
}

/** Column headers, in output order. Exported so tests and docs can reference them. */
export const CSV_COLUMNS: readonly string[] = [
  // identity + timing
  "session_id",
  "schema_version",
  "seq",
  "created_at",
  "updated_at",
  "completed_at",
  "completed",
  "step",
  // study design
  "variant",
  "variant_source",
  "is_test",
  "participant",
  // device
  "device_type",
  "viewport_w",
  "viewport_h",
  "touch",
  "user_agent",
  // pre-survey
  "pre_anxiety",
  "pre_control",
  "pre_predictability",
  "pre_route_origin",
  "pre_route_destination",
  "pre_timeframe",
  "pre_flights_per_year",
  // post ratings + deltas
  "post_anxiety",
  "post_control",
  "post_predictability",
  "change_anxiety",
  "change_control",
  "change_predictability",
  // flight inputs + summary
  "flight_input_origin",
  "flight_input_destination",
  "flight_input_date",
  "flight_id",
  "flight_number",
  "flight_airline",
  "flight_route",
  "flight_aircraft",
  "flight_body_type",
  "flight_airborne_min",
  "flight_smoothness_score",
  "flight_max_intensity",
  "flight_days_until",
  "flight_forecast_mode",
  // dashboard totals
  "dashboard_started_at",
  "dashboard_ended_at",
  "dashboard_total_s",
  "dashboard_active_s",
  "dashboard_sections_shown",
  "dashboard_sections_opened",
  "dashboard_max_scroll_pct",
  "dashboard_resumed",
  "dashboard_event_count",
  // per section (blank when the section was not shown)
  ...SECTION_IDS.flatMap((id) => [`section_${id}_opens`, `section_${id}_open_s`, `section_${id}_first_open_s`]),
  // alert toggle
  "alert_tapped",
  "alert_taps",
  "alert_final_on",
  // free exploration (variant A; blank without exploration data)
  "flights_explored",
  "switches",
  "compares",
  "alternatives_opened",
  "what_ifs",
  "what_if_s",
  "preferred_flight",
  "ended_on_flight",
  "would_switch",
  // post-survey answers
  "felt_better",
  "felt_worse",
  "felt_worse_text",
  "check_frequency",
  "would_replace",
  "would_replace_text",
  "still_scared_of",
  "first_name",
  "email",
  // debrief sign-up (blank when the record predates it)
  "waitlist",
  "interview",
];

/** Flatten one session record into cells, in `CSV_COLUMNS` order. */
export function recordToRow(record: SessionRecord): Cell[] {
  const { device, pre, post, flightInput, flight, dashboard } = record;
  const opened = sectionsOpened(record);
  const x = dashboard?.exploration ?? null;
  const shown = dashboard ? sectionsShown(record) : [];

  const sectionCells: Cell[] = SECTION_IDS.flatMap((id) => {
    const stats = dashboard?.sections[id];
    if (!dashboard || !shown.includes(id) || !stats) return [null, null, null];
    return [stats.opens, seconds(stats.openMs), seconds(stats.firstOpenAtMs)];
  });

  return [
    record.sessionId,
    record.schemaVersion,
    record.seq,
    record.createdAt,
    record.updatedAt,
    record.completedAt,
    isCompleted(record),
    record.step,

    record.variant,
    record.variantSource,
    record.isTest,
    record.participant ?? "",

    device?.type ?? null,
    device?.viewportW ?? null,
    device?.viewportH ?? null,
    device ? device.touch : null,
    device?.userAgent ?? null,

    pre.anxiety,
    pre.control,
    pre.predictability,
    pre.routeOrigin,
    pre.routeDestination,
    pre.timeframe,
    pre.flightsPerYear,

    post.anxiety,
    post.control,
    post.predictability,
    ratingChange(record, "anxiety"),
    ratingChange(record, "control"),
    ratingChange(record, "predictability"),

    flightInput?.origin ?? null,
    flightInput?.destination ?? null,
    flightInput?.date ?? null,
    flight?.flightId ?? null,
    flight?.flightNumber ?? null,
    flight?.airline ?? null,
    flight?.route ?? null,
    flight?.aircraft ?? null,
    flight?.bodyType ?? null,
    flight?.airborneMin ?? null,
    flight?.smoothnessScore ?? null,
    flight?.maxIntensity ?? null,
    flight?.daysUntil ?? null,
    flight?.forecastMode ?? null,

    dashboard?.startedAt ?? null,
    dashboard?.endedAt ?? null,
    seconds(dashboard?.totalMs),
    seconds(dashboard?.activeMs),
    opened?.shown ?? null,
    opened?.opened ?? null,
    dashboard?.maxScrollPct ?? null,
    dashboard ? dashboard.resumed : null,
    dashboard ? dashboard.events.length : null,

    ...sectionCells,

    dashboard ? dashboard.alert.tapped : null,
    dashboard?.alert.taps ?? null,
    dashboard ? dashboard.alert.finalOn : null,

    flightsExplored(record),
    x?.switches ?? null,
    x?.compares ?? null,
    x?.alternativesOpened ?? null,
    x?.whatIfs ?? null,
    seconds(x?.whatIfMs),
    x?.preferredFlightId ?? null,
    x?.endedOnFlightId ?? null,
    post.wouldSwitch ?? null,

    joinList(post.feltBetter),
    joinList(post.feltWorse),
    post.feltWorseText,
    post.checkFrequency,
    joinList(post.wouldReplace),
    post.wouldReplaceText,
    post.stillScaredOf,
    record.firstName ?? "",
    record.email,
    record.waitlist ?? null,
    record.interview ?? null,
  ];
}

/** Whole CSV document (with BOM) for the given records, in the order given. */
export function recordsToCsv(records: readonly SessionRecord[]): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const record of records) lines.push(recordToRow(record).map(csvCell).join(","));
  return CSV_BOM + lines.join(CRLF) + CRLF;
}
