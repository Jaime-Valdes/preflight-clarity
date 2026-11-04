/*
 * Backend tests. Run from the repo root with `npx tsx backend/scripts/test.ts`
 * or `npm run test -w backend`. Exits non-zero on failure.
 *
 * No test runner, just node:assert and a tiny harness, so it works anywhere
 * tsx does. Covers: parseSessionRecord and parseSignup (accept, reject,
 * sanitize), the local file store (upsert, stale writes, ordering, concurrency,
 * sign-ups), the Supabase row mappings (pure), and the HTTP routes through
 * Hono's app.request() against temporary data files. Version D's schedules
 * (docs/REAL_DATA.md, step 1): the query validation, the providers (the
 * generator, the AeroDataBox fixture mapping, the adapter over a fetch double),
 * the route-day cache and GET /flights/day.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CSV_COLUMNS, csvCell, recordToRow as csvRow, recordsToCsv } from "@preflight/shared/csv";
import { addDays, toISODate } from "@preflight/shared/dates";
import {
  MAX_COMPARE_PAIRS,
  MAX_EVENTS,
  MAX_EXPLORED_FLIGHTS,
  MAX_TEXT_CHARS,
  parseSessionRecord,
} from "@preflight/shared/record";
import { generatedSchedule, optionsFromSchedule, type RouteDaySchedule, type ScheduleRow } from "@preflight/shared/schedule";
import { SECTION_IDS } from "@preflight/shared/sections";
import {
  emailKey,
  MAX_CONTEXT_CHARS,
  parseSignup,
  SIGNUP_CSV_COLUMNS,
  signupKey,
  signupStats,
  signupsToCsv,
  sortSignupsNewestFirst,
} from "@preflight/shared/signup";
import {
  BOOK_LIKELIHOOD_LABELS,
  BOOK_LIKELIHOODS,
  bookLikelihoodDistribution,
  explorationStats,
  REPLACE_LABELS,
  signupRateBySection,
} from "@preflight/shared/stats";
import type {
  DashboardEvent,
  ExplorationMetrics,
  ExploredFlight,
  FlightSummary,
  SectionId,
  SectionStats,
  SessionRecord,
  Signup,
} from "@preflight/shared/types";
import {
  aeroDataBoxConfig,
  createAeroDataBoxProvider,
  fidsHeaders,
  fidsUrls,
  parseAdbTime,
  retryAfterMs,
  scheduleFromFids,
  splitFlightNumber,
  type AdbFids,
  type AdbFlight,
  type AdbMovement,
} from "../src/lib/flights/aerodatabox";
import { MEMORY_CAPACITY, recordOf, RouteDayCache } from "../src/lib/flights/cache";
import { createFixtureProvider, defaultFixtureDir, fixtureFile } from "../src/lib/flights/fixture";
import { createGeneratorProvider } from "../src/lib/flights/generator";
import { currentProvider, providerName, routeDayCache, validateDayQuery } from "../src/lib/flights/index";
import { ProviderError, ROUTE_DAY_MAX_AGE_MS, ROUTE_DAY_TTL_MS, type RouteDayStore, type ScheduleProvider } from "../src/lib/flights/types";
import { createFileStore, ROUTE_DAYS_FILE, SIGNUPS_FILE } from "../src/lib/store/file";
import { createMemoryRouteDayStore } from "../src/lib/store/memory";
import {
  isMissingColumn,
  recordToRow,
  routeDayToRow,
  rowToRecord,
  rowToRouteDay,
  rowToSignup,
  signupToRow,
  withoutNewerColumns,
} from "../src/lib/store/supabase";

// ── Harness ─────────────────────────────────────────────────────────────────

interface Test {
  group: string;
  name: string;
  fn: () => Promise<void> | void;
}

const tests: Test[] = [];
let currentGroup = "";

function group(name: string, define: () => void): void {
  currentGroup = name;
  define();
}

function test(name: string, fn: Test["fn"]): void {
  tests.push({ group: currentGroup, name, fn });
}

async function run(): Promise<number> {
  let failed = 0;
  let lastGroup = "";
  for (const t of tests) {
    if (t.group !== lastGroup) {
      console.log(`\n# ${t.group}`);
      lastGroup = t.group;
    }
    try {
      await t.fn();
      console.log(`ok - ${t.name}`);
    } catch (err) {
      failed += 1;
      console.log(`not ok - ${t.name}`);
      console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  return failed;
}

// ── Fixture: a full, realistic, already-normalized record ───────────────────

const SESSION_ID = "6f1d2c3a-5b4e-4f6a-9c8d-0e1f2a3b4c5d";
const SECTIONS: SectionId[] = [
  "turbulence",
  "pilot",
  "aircraft",
  "airline",
  "weather",
  "seat",
  "sounds",
  "compare",
  "alerts",
];

function summary(id: string, score: number, bodyType: "narrow" | "wide" = "narrow"): FlightSummary {
  return {
    flightId: id,
    flightNumber: "DL 1423",
    airline: "Delta Air Lines",
    route: "JFK → LAX",
    aircraft: bodyType === "wide" ? "Airbus A330-900neo" : "Airbus A321neo",
    bodyType,
    airborneMin: 332,
    smoothnessScore: score,
    maxIntensity: "light",
    daysUntil: 44,
    forecastMode: "history",
  };
}

/** Variant A exploration: own flight + a what-if day + an opened wide-body alternative. */
function explorationFixture(): ExplorationMetrics {
  const flights: ExploredFlight[] = [
    { id: "f3a9c1e2", input: { origin: "JFK", destination: "LAX", date: "2026-11-26" }, prefs: {}, summary: summary("f3a9c1e2", 82), addedVia: "setup", addedAtMs: 0 },
    { id: "b71e04aa", input: { origin: "JFK", destination: "LAX", date: "2026-11-27" }, prefs: {}, summary: summary("b71e04aa", 88), addedVia: "whatif_day", addedAtMs: 61000 },
    {
      id: "c0ffee12",
      input: { origin: "JFK", destination: "LAX", date: "2026-11-26" },
      prefs: { departWindow: "morning", bodyType: "wide", airline: "DL" },
      summary: summary("c0ffee12", 91, "wide"),
      addedVia: "alternative",
      addedAtMs: 120500,
    },
  ];
  return {
    flights,
    switches: 4,
    flightMs: { f3a9c1e2: 150000, b71e04aa: 30000, c0ffee12: 45000 },
    compares: 2,
    compareMs: 26000,
    comparePairs: ["f3a9c1e2|b71e04aa", "f3a9c1e2|c0ffee12"],
    whatIfMs: 9000,
    alternativesOpened: 1,
    whatIfs: 1,
    endedOnFlightId: "c0ffee12",
    preferredFlightId: "c0ffee12",
  };
}

function fixture(): SessionRecord {
  const events: DashboardEvent[] = [
    { t: 0, type: "section_open", section: "turbulence" },
    { t: 41000, type: "section_close", section: "turbulence" },
    { t: 42000, type: "section_open", section: "pilot" },
    { t: 95000, type: "section_open", section: "seat" },
    { t: 101000, type: "seat_selected", section: "seat", detail: "15A" },
    { t: 140000, type: "page_hidden" },
    { t: 152000, type: "page_visible" },
    { t: 200000, type: "section_open", section: "alerts" },
    { t: 204000, type: "alert_toggle", section: "alerts", detail: "on" },
    { t: 278000, type: "dashboard_done" },
  ];
  const sections: Partial<Record<SectionId, SectionStats>> = {};
  SECTIONS.forEach((id, i) => {
    sections[id] = { opens: i % 3 === 2 ? 0 : 1, openMs: i % 3 === 2 ? 0 : 12000 + i * 1000, firstOpenAtMs: i % 3 === 2 ? null : i * 9000 };
  });
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    seq: 7,
    createdAt: "2026-10-13T14:02:11.000Z",
    updatedAt: "2026-10-13T14:09:48.000Z",
    completedAt: "2026-10-13T14:09:30.000Z",
    step: "debrief",
    variant: "A",
    variantSource: "random",
    isTest: false,
    participant: "sarah",
    device: {
      type: "mobile",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      viewportW: 390,
      viewportH: 844,
      touch: true,
    },
    pre: {
      anxiety: 7,
      control: 3,
      predictability: 4,
      routeOrigin: "JFK",
      routeDestination: "LAX",
      timeframe: "1to4w",
      flightsPerYear: "2to3",
      worriesMost: "turbulence",
      worriesOtherText: "",
      anxietyStarts: "days_before",
    },
    flightInput: { origin: "JFK", destination: "LAX", date: "2026-11-26" },
    flight: {
      flightId: "f3a9c1e2",
      flightNumber: "DL 1423",
      airline: "Delta Air Lines",
      route: "JFK → LAX",
      aircraft: "Airbus A321neo",
      bodyType: "narrow",
      airborneMin: 332,
      smoothnessScore: 82,
      maxIntensity: "light",
      daysUntil: 44,
      forecastMode: "history",
    },
    dashboard: {
      startedAt: "2026-10-13T14:04:02.000Z",
      endedAt: "2026-10-13T14:08:40.000Z",
      totalMs: 278000,
      activeMs: 251000,
      sectionOrder: [...SECTIONS],
      sections,
      alert: { tapped: true, taps: 1, finalOn: true },
      events,
      maxScrollPct: 100,
      resumed: false,
      exploration: explorationFixture(),
    },
    post: {
      anxiety: 5,
      control: 6,
      predictability: 7,
      feltBetter: ["summary", "turbulence", "seat"],
      feltWorse: ["none"],
      feltWorseText: "",
      checkFrequency: "weekly",
      wouldReplace: ["turbulence_apps", "choosing_flights"],
      wouldReplaceText: "Maybe the forecast app I use now.",
      stillScaredOf: "Long stretches of bumps over the ocean, and the feeling of not knowing when they end.",
      travelImpact: ["paid_more", "skipped_trip"],
      travelImpactOtherText: "",
      wouldSwitch: "not_sure",
      bookLikelihood: "more_likely",
    },
    email: "participant@example.com",
    firstName: "Sam",
    waitlist: true,
    interview: true,
  };
}

// ── Fixture: a debrief sign-up for that session ─────────────────────────────

const SIGNUP_ID = "0b3c1d2e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

function signupFixture(): Signup {
  return {
    schemaVersion: 1,
    id: SIGNUP_ID,
    createdAt: "2026-10-21T15:30:00.000Z",
    source: "study",
    placement: "debrief",
    email: "Sam@Example.com",
    firstName: "Sam",
    waitlist: true,
    interview: true,
    sessionId: SESSION_ID,
    variant: "A",
    isTest: false,
    participant: "sarah",
    context: "JFK → LAX · Nov 26",
    page: "/",
  };
}

/** A fixture as loose JSON so tests can poke invalid values into it. */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function loose(mutate: (r: Loose) => void): unknown {
  const r = JSON.parse(JSON.stringify(fixture())) as Loose;
  mutate(r);
  return r;
}

function expectError(input: unknown, code: string): void {
  const result = parseSessionRecord(input);
  assert.equal(result.ok, false, `expected rejection with ${code}`);
  if (!result.ok) assert.equal(result.error, code);
}

function expectOk(input: unknown): SessionRecord {
  const result = parseSessionRecord(input);
  assert.equal(result.ok, true, `expected acceptance, got ${result.ok ? "" : result.error}`);
  if (!result.ok) throw new Error("unreachable");
  return result.record;
}

// ── parseSessionRecord ──────────────────────────────────────────────────────

group("parseSessionRecord", () => {
  test("accepts a full realistic record unchanged", () => {
    const input = fixture();
    const record = expectOk(input);
    assert.deepEqual(record, fixture());
    assert.notEqual(record, input, "returns a fresh object");
    assert.notEqual(record.dashboard, input.dashboard, "nested objects are rebuilt too");
  });

  test("survives a JSON round trip unchanged", () => {
    const record = expectOk(JSON.parse(JSON.stringify(fixture())));
    assert.deepEqual(record, fixture());
  });

  test("rejects non-objects", () => {
    expectError(null, "not_an_object");
    expectError("hello", "not_an_object");
    expectError([], "not_an_object");
    expectError(42, "not_an_object");
  });

  test("session id must be a UUID and is lower-cased", () => {
    expectError(loose((r) => delete r.sessionId), "missing_session_id");
    expectError(loose((r) => (r.sessionId = "")), "missing_session_id");
    expectError(loose((r) => (r.sessionId = "abc")), "invalid_session_id");
    expectError(loose((r) => (r.sessionId = 123)), "invalid_session_id");
    expectError(loose((r) => (r.sessionId = "6f1d2c3a-5b4e-4f6a-9c8d-0e1f2a3b4c5d; drop table")), "invalid_session_id");
    const upper = expectOk(loose((r) => (r.sessionId = SESSION_ID.toUpperCase())));
    assert.equal(upper.sessionId, SESSION_ID);
  });

  test("schema version and seq are strict", () => {
    expectError(loose((r) => (r.schemaVersion = 2)), "unsupported_schema_version");
    expectError(loose((r) => (r.schemaVersion = "1")), "unsupported_schema_version");
    expectError(loose((r) => (r.seq = -1)), "invalid_seq");
    expectError(loose((r) => (r.seq = 1.5)), "invalid_seq");
    expectError(loose((r) => (r.seq = "3")), "invalid_seq");
    expectError(loose((r) => delete r.seq), "invalid_seq");
    assert.equal(expectOk(loose((r) => (r.seq = 0))).seq, 0);
  });

  test("wrong study-design enums are rejected", () => {
    expectError(loose((r) => (r.variant = "C")), "invalid_variant");
    expectError(loose((r) => (r.variant = "a")), "invalid_variant");
    expectError(loose((r) => (r.variantSource = "guess")), "invalid_variant");
    expectError(loose((r) => (r.step = "finished")), "invalid_step");
    expectError(loose((r) => delete r.step), "invalid_step");
    expectError(loose((r) => (r.device.type = "watch")), "invalid_device");
    expectError(loose((r) => (r.device = "iPhone")), "invalid_device");
  });

  test("timestamps must be ISO 8601 and are normalized to UTC", () => {
    expectError(loose((r) => (r.createdAt = "yesterday")), "invalid_timestamp");
    expectError(loose((r) => (r.createdAt = 1760364131000)), "invalid_timestamp");
    expectError(loose((r) => (r.updatedAt = "2026-10-13")), "invalid_timestamp");
    expectError(loose((r) => (r.completedAt = "soon")), "invalid_timestamp");
    expectError(loose((r) => (r.createdAt = "1999-12-31T23:59:59Z")), "invalid_timestamp");
    const offset = expectOk(loose((r) => (r.createdAt = "2026-10-13T16:02:11+02:00")));
    assert.equal(offset.createdAt, "2026-10-13T14:02:11.000Z");
    const noMillis = expectOk(loose((r) => (r.completedAt = "2026-10-13T14:09:30Z")));
    assert.equal(noMillis.completedAt, "2026-10-13T14:09:30.000Z");
    assert.equal(expectOk(loose((r) => (r.completedAt = null))).completedAt, null);
    assert.equal(expectOk(loose((r) => delete r.completedAt)).completedAt, null);
  });

  test("ratings are integers 0–10 or null", () => {
    expectError(loose((r) => (r.pre.anxiety = 11)), "invalid_rating");
    expectError(loose((r) => (r.pre.control = -1)), "invalid_rating");
    expectError(loose((r) => (r.post.predictability = 7.5)), "invalid_rating");
    expectError(loose((r) => (r.post.anxiety = "7")), "invalid_rating");
    const unanswered = expectOk(loose((r) => { r.pre.anxiety = null; delete r.post.control; }));
    assert.equal(unanswered.pre.anxiety, null);
    assert.equal(unanswered.post.control, null);
    assert.equal(expectOk(loose((r) => (r.pre.predictability = 0))).pre.predictability, 0);
    assert.equal(expectOk(loose((r) => (r.post.anxiety = 10))).post.anxiety, 10);
  });

  test("free text is trimmed, cleaned and capped", () => {
    const long = "x".repeat(MAX_TEXT_CHARS + 500);
    const record = expectOk(
      loose((r) => {
        r.post.stillScaredOf = long;
        r.post.feltWorseText = "  spaced out  \n";
        r.post.wouldReplaceText = "nul\u0000byte\u0007 and tab\tkept";
        r.pre.routeOrigin = " jfk ";
        r.device.userAgent = "ua".repeat(1000);
      }),
    );
    assert.equal(record.post.stillScaredOf.length, MAX_TEXT_CHARS);
    assert.equal(record.post.feltWorseText, "spaced out");
    assert.equal(record.post.wouldReplaceText, "nulbyte and tab\tkept");
    assert.equal(record.pre.routeOrigin, "jfk");
    assert.equal(record.device.userAgent.length, 512);
    assert.equal(expectOk(loose((r) => (r.post.stillScaredOf = 42))).post.stillScaredOf, "");
    assert.equal(expectOk(loose((r) => (r.post.stillScaredOf = ["a"]))).post.stillScaredOf, "");
  });

  test("email is kept only when it looks like one", () => {
    assert.equal(expectOk(loose((r) => (r.email = "not an email"))).email, "");
    assert.equal(expectOk(loose((r) => (r.email = "  Person@Example.org "))).email, "Person@Example.org");
    assert.equal(expectOk(loose((r) => (r.email = `${"a".repeat(250)}@example.com`))).email, "");
    assert.equal(expectOk(loose((r) => (r.email = null))).email, "");
    assert.equal(expectOk(loose((r) => delete r.email)).email, "");
    assert.equal(expectOk(loose((r) => (r.email = "a@b.c"))).email, "");
  });

  test("About-your-flying answers and travel impact are validated; 'no' is exclusive", () => {
    assert.equal(expectOk(loose((r) => (r.pre.worriesMost = "turbulence"))).pre.worriesMost, "turbulence");
    assert.equal(expectOk(loose((r) => (r.pre.worriesMost = "spiders"))).pre.worriesMost, null);
    assert.equal(expectOk(loose((r) => delete r.pre.anxietyStarts)).pre.anxietyStarts, null);
    assert.deepEqual(expectOk(loose((r) => (r.post.travelImpact = ["skipped_trip", "no", "paid_more"]))).post.travelImpact, ["no"]);
    assert.deepEqual(expectOk(loose((r) => (r.post.travelImpact = ["paid_more", "bogus", "paid_more"]))).post.travelImpact, ["paid_more"]);
    assert.deepEqual(expectOk(loose((r) => delete r.post.travelImpact)).post.travelImpact, []);
  });

  test("first name is optional, one line, trimmed and capped", () => {
    assert.equal(expectOk(loose((r) => (r.firstName = "  Sam "))).firstName, "Sam");
    assert.equal(expectOk(loose((r) => (r.firstName = "Sam\n\tLee  Jr"))).firstName, "Sam Lee Jr");
    assert.equal(expectOk(loose((r) => (r.firstName = "x".repeat(80)))).firstName?.length, 60);
    assert.equal(expectOk(loose((r) => (r.firstName = 7))).firstName, "");
    assert.equal(expectOk(loose((r) => delete r.firstName)).firstName, "");
  });

  test("waitlist and interview are booleans; absent or invalid → false", () => {
    const record = expectOk(
      loose((r) => {
        delete r.waitlist;
        r.interview = "yes";
      }),
    );
    assert.equal(record.waitlist, false);
    assert.equal(record.interview, false);
    const signed = expectOk(
      loose((r) => {
        r.waitlist = true;
        r.interview = 1;
      }),
    );
    assert.equal(signed.waitlist, true);
    assert.equal(signed.interview, false);
  });

  test("unknown keys are dropped at every level", () => {
    const record = expectOk(
      loose((r) => {
        r.extra = "top";
        r.__proto__ = { polluted: true };
        r.pre.extra = 1;
        r.post.extra = 1;
        r.device.extra = 1;
        r.flight.extra = 1;
        r.flightInput.extra = 1;
        r.dashboard.extra = 1;
        r.dashboard.alert.extra = 1;
        r.dashboard.sections.turbulence.extra = 1;
        r.dashboard.sections.bogus = { opens: 1, openMs: 1, firstOpenAtMs: 1 };
        r.dashboard.events[0].extra = 1;
      }),
    );
    assert.deepEqual(record, fixture());
    assert.equal(Object.hasOwn(record, "extra"), false);
    assert.equal("polluted" in record, false);
    assert.equal(({} as Loose).polluted, undefined, "no prototype pollution");
  });

  test("optional survey enums fall back to null", () => {
    const record = expectOk(
      loose((r) => {
        r.pre.timeframe = "soon";
        r.pre.flightsPerYear = 99;
        r.post.checkFrequency = "sometimes";
      }),
    );
    assert.equal(record.pre.timeframe, null);
    assert.equal(record.pre.flightsPerYear, null);
    assert.equal(record.post.checkFrequency, null);
  });

  test("multi-select arrays are filtered to known values and de-duplicated", () => {
    const record = expectOk(
      loose((r) => {
        r.post.feltBetter = ["summary", "bogus", "summary", 7, null, "none", "pilot"];
        r.post.feltWorse = "turbulence";
        r.post.wouldReplace = ["medication", "x", "medication", "nothing"];
      }),
    );
    assert.deepEqual(record.post.feltBetter, ["summary", "none", "pilot"]);
    assert.deepEqual(record.post.feltWorse, []);
    assert.deepEqual(record.post.wouldReplace, ["medication", "nothing"]);
  });

  test("flight input and flight summary are strict", () => {
    expectError(loose((r) => (r.flightInput.date = "2026-13-40")), "invalid_flight_input");
    expectError(loose((r) => (r.flightInput.origin = "")), "invalid_flight_input");
    expectError(loose((r) => (r.flightInput = "JFK-LAX")), "invalid_flight_input");
    expectError(loose((r) => (r.flight.bodyType = "huge")), "invalid_flight");
    expectError(loose((r) => (r.flight.maxIntensity = "severe")), "invalid_flight");
    expectError(loose((r) => (r.flight.forecastMode = "guess")), "invalid_flight");
    expectError(loose((r) => (r.flight.airborneMin = "332")), "invalid_flight");
    assert.equal(expectOk(loose((r) => (r.flightInput = null))).flightInput, null);
    assert.equal(expectOk(loose((r) => (r.flight = null))).flight, null);
    const clamped = expectOk(loose((r) => (r.flight.smoothnessScore = 140)));
    assert.equal(clamped.flight?.smoothnessScore, 100);
  });

  test("dashboard metrics must be finite and non-negative; events are capped", () => {
    expectError(loose((r) => (r.dashboard.totalMs = "long")), "invalid_dashboard");
    expectError(loose((r) => (r.dashboard.startedAt = "earlier")), "invalid_dashboard");
    expectError(loose((r) => (r.dashboard.sections.turbulence.opens = "1")), "invalid_dashboard");
    expectError(loose((r) => (r.dashboard.sections = [])), "invalid_dashboard");
    expectError(loose((r) => (r.dashboard = "lots")), "invalid_dashboard");
    const nan = fixture();
    nan.dashboard!.activeMs = Number.NaN;
    expectError(nan, "invalid_dashboard");
    const inf = fixture();
    inf.dashboard!.sections.pilot!.openMs = Number.POSITIVE_INFINITY;
    expectError(inf, "invalid_dashboard");

    const record = expectOk(
      loose((r) => {
        r.dashboard.totalMs = -5;
        r.dashboard.maxScrollPct = 140;
        r.dashboard.sectionOrder = ["turbulence", "bogus", "turbulence", "seat"];
        r.dashboard.events = Array.from({ length: MAX_EVENTS + 100 }, (_, i) => ({
          t: i * 10,
          type: "tick",
          section: i % 2 ? "seat" : "bogus",
          detail: "d".repeat(500),
          extra: true,
        }));
        r.dashboard.events.unshift("junk", { t: "0", type: "bad" }, { t: 1, type: "" });
      }),
    );
    assert.equal(record.dashboard?.totalMs, 0);
    assert.equal(record.dashboard?.maxScrollPct, 100);
    assert.deepEqual(record.dashboard?.sectionOrder, ["turbulence", "seat"]);
    assert.equal(record.dashboard?.events.length, MAX_EVENTS);
    assert.deepEqual(record.dashboard?.events[0], { t: 0, type: "tick", detail: "d".repeat(120) });
    assert.deepEqual(Object.keys(record.dashboard?.events[1] ?? {}), ["t", "type", "section", "detail"]);
    assert.equal(expectOk(loose((r) => (r.dashboard = null))).dashboard, null);
    assert.deepEqual(expectOk(loose((r) => delete r.dashboard.events)).dashboard?.events, []);
  });

  test("booleans only count when they are literally true", () => {
    const record = expectOk(
      loose((r) => {
        r.isTest = "yes";
        r.device.touch = 1;
        r.dashboard.alert.tapped = "true";
        r.dashboard.resumed = null;
      }),
    );
    assert.equal(record.isTest, false);
    assert.equal(record.device.touch, false);
    assert.equal(record.dashboard?.alert.tapped, false);
    assert.equal(record.dashboard?.resumed, false);
    assert.equal(expectOk(loose((r) => (r.isTest = true))).isTest, true);
  });

  test("a minimal record straight after the pre-survey is accepted", () => {
    const minimal = {
      schemaVersion: 1,
      sessionId: SESSION_ID,
      seq: 1,
      createdAt: "2026-10-13T14:02:11.000Z",
      updatedAt: "2026-10-13T14:02:11.000Z",
      completedAt: null,
      step: "pre",
      variant: "B",
      variantSource: "forced",
      isTest: true,
      device: { type: "desktop", userAgent: "", viewportW: 1280, viewportH: 900, touch: false },
      pre: { anxiety: 6, control: null, predictability: null, routeOrigin: "", routeDestination: "", timeframe: null, flightsPerYear: null },
      flightInput: null,
      flight: null,
      dashboard: null,
      post: {
        anxiety: null,
        control: null,
        predictability: null,
        feltBetter: [],
        feltWorse: [],
        feltWorseText: "",
        checkFrequency: null,
        wouldReplace: [],
        wouldReplaceText: "",
        stillScaredOf: "",
      },
      email: "",
      firstName: "",
    };
    // Records from before the participant label / exploration / sign-up / newer survey fields parse with "" / null / [] / false.
    assert.deepEqual(expectOk(minimal), {
      ...minimal,
      participant: "",
      pre: { ...minimal.pre, worriesMost: null, worriesOtherText: "", anxietyStarts: null },
      post: { ...minimal.post, wouldSwitch: null, travelImpact: [], travelImpactOtherText: "", bookLikelihood: null },
      waitlist: false,
      interview: false,
    });
  });

  test("an old record without participant / exploration / wouldSwitch is accepted with defaults", () => {
    const record = expectOk(
      loose((r) => {
        delete r.participant;
        delete r.dashboard.exploration;
        delete r.post.wouldSwitch;
      }),
    );
    assert.equal(record.participant, "");
    assert.equal(record.dashboard?.exploration, null);
    assert.equal(record.post.wouldSwitch, null);
    assert.deepEqual(
      { ...record, participant: "sarah", dashboard: { ...record.dashboard!, exploration: explorationFixture() }, post: { ...record.post, wouldSwitch: "not_sure" } },
      fixture(),
      "nothing else changes",
    );
  });

  test("wouldSwitch is an enum or null", () => {
    for (const v of ["yes", "no", "not_sure", "didnt_look"] as const) {
      assert.equal(expectOk(loose((r) => (r.post.wouldSwitch = v))).post.wouldSwitch, v);
    }
    for (const v of ["maybe", 1, true, {}, null]) {
      assert.equal(expectOk(loose((r) => (r.post.wouldSwitch = v))).post.wouldSwitch, null);
    }
  });

  test("bookLikelihood is an enum or null; a record from before the question parses as null", () => {
    for (const v of ["more_likely", "no_difference", "less_likely", "not_sure"] as const) {
      assert.equal(expectOk(loose((r) => (r.post.bookLikelihood = v))).post.bookLikelihood, v);
    }
    for (const v of ["yes", "More likely", "", 1, true, {}, ["more_likely"], null]) {
      assert.equal(expectOk(loose((r) => (r.post.bookLikelihood = v))).post.bookLikelihood, null);
    }
    const old = expectOk(loose((r) => delete r.post.bookLikelihood));
    assert.equal(old.post.bookLikelihood, null);
    assert.deepEqual({ ...old, post: { ...old.post, bookLikelihood: "more_likely" } }, fixture(), "nothing else changes");
  });

  test("participant label keeps letters, digits, space and - _ . @ only, ≤ 40 chars", () => {
    const label = (v: unknown) => expectOk(loose((r) => (r.participant = v))).participant;
    assert.equal(label("  sarah  "), "sarah");
    assert.equal(label("José M. <script>"), "José M. script");
    assert.equal(label("=cmd|' /C calc'!A0"), "cmd C calcA0");
    assert.equal(label("a@b.co_x-1"), "a@b.co_x-1");
    assert.equal(label("x".repeat(80)), "x".repeat(40));
    assert.equal(label("a\u0000b\nc"), "abc");
    assert.equal(label(42), "");
    assert.equal(label(null), "");
  });

  test("exploration: a non-object or flight-less block becomes null (never rejects)", () => {
    for (const v of ["lots", 5, [], { flights: [] }, { flights: "x" }, {}]) {
      assert.equal(expectOk(loose((r) => (r.dashboard.exploration = v))).dashboard?.exploration, null);
    }
    // A broken reference flight (the first) voids the block: every other figure is relative to it.
    assert.equal(expectOk(loose((r) => (r.dashboard.exploration.flights[0].summary.bodyType = "huge"))).dashboard?.exploration, null);
    assert.equal(expectOk(loose((r) => (r.dashboard.exploration.flights[0].addedVia = "teleport"))).dashboard?.exploration, null);
  });

  test("exploration: implausible or duplicate flights are dropped, prefs sanitized", () => {
    const record = expectOk(
      loose((r) => {
        const x = r.dashboard.exploration;
        x.flights[1].input.date = "2026-02-31";
        x.flights[2].prefs = { departWindow: "midnight", bodyType: "narrow", airline: "  DL  ", extra: 1 };
        x.flights[2].extra = true;
        x.flights.push({ ...x.flights[2] }, "junk", { ...x.flights[2], id: "neg", addedAtMs: -5 }, { ...x.flights[2], id: "nan", addedAtMs: "1" });
      }),
    );
    const x = record.dashboard!.exploration!;
    assert.deepEqual(x.flights.map((f) => f.id), ["f3a9c1e2", "c0ffee12", "neg"]);
    assert.deepEqual(x.flights[1].prefs, { airline: "DL" });
    assert.equal(x.flights[2].addedAtMs, 0, "negative clamps to 0");
    assert.equal(Object.hasOwn(x.flights[1], "extra"), false);
    assert.deepEqual(Object.keys(x.flightMs).sort(), ["c0ffee12", "f3a9c1e2"], "flightMs keys ⊆ surviving flight ids");
  });

  test("exploration: counters clamp, flightMs is filtered, lists are capped", () => {
    const record = expectOk(
      loose((r) => {
        const x = r.dashboard.exploration;
        x.switches = -3;
        x.compares = "2";
        x.compareMs = Number.MAX_SAFE_INTEGER;
        delete x.whatIfs;
        delete x.whatIfMs;
        x.flightMs = { f3a9c1e2: 1000.6, b71e04aa: "30", c0ffee12: -1, stranger: 5, __proto__: { polluted: 1 } };
        x.comparePairs = ["a|b", "", 7, "p".repeat(400), ...Array.from({ length: 100 }, () => "x|y")];
        x.endedOnFlightId = "";
        x.preferredFlightId = 7;
        x.flights = Array.from({ length: 20 }, (_, i) => ({ ...x.flights[0], id: `id${i}` }));
      }),
    );
    const x = record.dashboard!.exploration!;
    assert.equal(x.switches, 0);
    assert.equal(x.compares, 0);
    assert.equal(x.compareMs, 2_147_483_647);
    assert.equal(x.whatIfs, 0);
    assert.equal(x.whatIfMs, 0, "a block from before whatIfMs parses as 0");
    assert.equal(x.flights.length, MAX_EXPLORED_FLIGHTS);
    assert.deepEqual(x.flightMs, {}, "ids no longer match any flight");
    assert.equal(x.comparePairs.length <= MAX_COMPARE_PAIRS, true);
    assert.equal(x.comparePairs[0], "a|b");
    assert.equal(x.comparePairs[1].length, 241);
    assert.equal(x.endedOnFlightId, "id0", "falls back to the reference flight");
    assert.equal(x.preferredFlightId, null);
    assert.equal(({} as Loose).polluted, undefined, "no prototype pollution");

    const ms = expectOk(
      loose((r) => (r.dashboard.exploration.flightMs = { f3a9c1e2: 1000.6, b71e04aa: "30", c0ffee12: -1, stranger: 5 })),
    ).dashboard!.exploration!.flightMs;
    assert.deepEqual(ms, { f3a9c1e2: 1001, c0ffee12: 0 });
  });

  test("exploration survives a JSON round trip through stats and CSV", () => {
    const old = loose((r) => {
      r.sessionId = "00000000-0000-4000-8000-000000000002";
      r.variant = "B";
      delete r.participant;
      r.dashboard.exploration = null;
      delete r.post.wouldSwitch;
      delete r.post.bookLikelihood;
      delete r.waitlist;
      delete r.interview;
    });
    const records = [fixture(), expectOk(old)];
    const stats = explorationStats(records);
    assert.equal(stats.overall.n, 1);
    assert.equal(stats.byVariant.B.n, 0);
    assert.equal(stats.byVariant.B.meanFlights, null);
    assert.equal(stats.byVariant.A.meanFlights, 3);
    assert.equal(stats.byVariant.A.preferredOther, 1);
    assert.equal(stats.byVariant.A.medianReferenceMs, 150000);
    assert.equal(stats.byVariant.A.medianOtherMs, 37500);
    assert.equal(stats.overall.wouldSwitch.n, 1);

    const header = recordsToCsv(records).replace(/^\uFEFF/, "").split("\r\n")[0].split(",");
    assert.deepEqual(header, [...CSV_COLUMNS]);
    const col = (record: SessionRecord, name: string) => csvCell(csvRow(record)[CSV_COLUMNS.indexOf(name)]);
    assert.equal(col(records[0], "participant"), "sarah");
    assert.equal(col(records[0], "flights_explored"), "3");
    assert.equal(col(records[0], "switches"), "4");
    assert.equal(col(records[0], "preferred_flight"), "c0ffee12");
    assert.equal(col(records[0], "ended_on_flight"), "c0ffee12");
    assert.equal(col(records[0], "would_switch"), "not_sure");
    assert.equal(CSV_COLUMNS[CSV_COLUMNS.indexOf("would_switch") + 1], "book_likelihood", "the booking question follows would_switch");
    assert.equal(col(records[0], "book_likelihood"), "more_likely");
    assert.equal(col(records[1], "book_likelihood"), "", "blank when the question was never asked (parsed null)");
    assert.equal(col({ ...records[1], post: { ...records[1].post, bookLikelihood: undefined } }, "book_likelihood"), "", "and when the field is absent");
    assert.equal(col(records[0], "what_if_s"), "9");
    assert.equal(col(records[0], "waitlist"), "true");
    assert.equal(col(records[0], "interview"), "true");
    assert.equal(col(records[1], "waitlist"), "false", "parsed records always carry the sign-up flags");
    assert.equal(col({ ...records[1], waitlist: undefined, interview: undefined }, "interview"), "", "blank when the record predates them");
    for (const name of ["participant", "flights_explored", "switches", "compares", "alternatives_opened", "what_ifs", "what_if_s", "preferred_flight", "ended_on_flight", "would_switch"]) {
      assert.equal(col(records[1], name), "", `${name} is blank without exploration`);
    }
  });
});

// ── Stats: post-survey labels, booking likelihood, sign-ups by section ──────

/** `base` with a dashboard that showed `order` and expanded exactly the sections in `open`. */
function withOpens(base: SessionRecord, open: readonly SectionId[], order: readonly SectionId[] = SECTIONS): SessionRecord {
  const sections: Partial<Record<SectionId, SectionStats>> = {};
  for (const id of order) {
    const opened = open.includes(id);
    sections[id] = { opens: opened ? 2 : 0, openMs: opened ? 5000 : 0, firstOpenAtMs: opened ? 1000 : null };
  }
  return { ...base, dashboard: { ...base.dashboard!, sectionOrder: [...order], sections } };
}

group("stats", () => {
  test("labels: 'researching flights carefully'; the booking-likelihood vocabulary", () => {
    assert.equal(REPLACE_LABELS.choosing_flights, "Researching flights carefully");
    assert.deepEqual(BOOK_LIKELIHOODS, ["more_likely", "no_difference", "less_likely", "not_sure"]);
    assert.deepEqual(Object.keys(BOOK_LIKELIHOOD_LABELS), [...BOOK_LIKELIHOODS]);
    assert.deepEqual(Object.values(BOOK_LIKELIHOOD_LABELS), ["Yes, more likely", "No difference", "Less likely", "Not sure"]);
  });

  test("bookLikelihoodDistribution: share of those who answered; unanswered and older records are left out", () => {
    const answered = (n: number, bookLikelihood: SessionRecord["post"]["bookLikelihood"]): SessionRecord => ({
      ...fixture(),
      sessionId: session(n),
      post: { ...fixture().post, bookLikelihood },
    });
    const old = expectOk(loose((r) => delete r.post.bookLikelihood));
    const d = bookLikelihoodDistribution([fixture(), answered(2, null), answered(3, "not_sure"), answered(4, "more_likely"), old]);
    assert.equal(d.n, 3);
    assert.deepEqual(
      d.buckets.map((b) => [b.value, b.label, b.count]),
      [["more_likely", "Yes, more likely", 2], ["no_difference", "No difference", 0], ["less_likely", "Less likely", 0], ["not_sure", "Not sure", 1]],
    );
    assert.equal(d.buckets[0].pct, 2 / 3);
    assert.equal(d.buckets[1].pct, 0);
    assert.deepEqual(bookLikelihoodDistribution([]), { n: 0, buckets: BOOK_LIKELIHOODS.map((value) => ({ value, label: BOOK_LIKELIHOOD_LABELS[value], count: 0, pct: null })) });
    // An unvalidated local record with a stray value is not an answer.
    const stray = { ...answered(5, null), post: { ...fixture().post, bookLikelihood: "yes" as unknown as "not_sure" } };
    assert.equal(bookLikelihoodDistribution([stray]).n, 0);
  });

  test("signupRateBySection: real completed sessions, split by whether they opened each section", () => {
    const records: SessionRecord[] = [
      withOpens({ ...fixture(), sessionId: session(1), waitlist: true }, ["turbulence", "pilot", "seat"]), // A, signed up
      withOpens({ ...fixture(), sessionId: session(2), waitlist: false }, ["turbulence"]), // A, no sign-up
      withOpens({ ...fixture(), sessionId: session(3), waitlist: false }, []), // A, opened nothing
      withOpens({ ...fixture(), sessionId: session(4), variant: "B", waitlist: true }, [], ["turbulence"]), // B, signed up without opening anything
      withOpens({ ...fixture(), sessionId: session(5), isTest: true, waitlist: true }, ["turbulence", "aircraft"]), // team test: excluded
      withOpens({ ...fixture(), sessionId: session(6), completedAt: null, step: "dashboard", waitlist: true }, ["turbulence"]), // not completed: excluded
      { ...fixture(), sessionId: session(7), dashboard: null, waitlist: true }, // no dashboard: excluded
    ];
    const rates = signupRateBySection(records);
    assert.deepEqual(rates.map((r) => r.section), [...SECTION_IDS], "every section, in dashboard order");
    const by = Object.fromEntries(rates.map((r) => [r.section, r]));
    assert.deepEqual(by.turbulence, {
      section: "turbulence",
      label: "Turbulence forecast",
      opened: { n: 2, signups: 1, pct: 50 },
      notOpened: { n: 2, signups: 1, pct: 50 },
    });
    assert.deepEqual(by.pilot, {
      section: "pilot",
      label: "Who flies your plane",
      opened: { n: 1, signups: 1, pct: 100 },
      notOpened: { n: 2, signups: 0, pct: 0 },
    });
    assert.deepEqual(by.aircraft.opened, { n: 0, signups: 0, pct: null }, "nobody opened it: no rate");
    assert.deepEqual(by.aircraft.notOpened, { n: 3, signups: 1, pct: 33 }, "variant B never showed it");
    assert.deepEqual(by.seat.opened, { n: 1, signups: 1, pct: 100 });
    assert.deepEqual(by.alerts.notOpened, { n: 3, signups: 1, pct: 33 });
    // A record from before the sign-up existed (no waitlist flag) counts as not signed up.
    const legacy = withOpens({ ...fixture(), sessionId: session(8), waitlist: undefined, interview: undefined }, ["turbulence"]);
    assert.deepEqual(signupRateBySection([legacy])[0].opened, { n: 1, signups: 0, pct: 0 });
    // Nothing to count: every cell is empty and no rate is invented.
    for (const r of signupRateBySection([])) {
      assert.deepEqual(r.opened, { n: 0, signups: 0, pct: null });
      assert.deepEqual(r.notOpened, { n: 0, signups: 0, pct: null });
    }
    assert.deepEqual(signupRateBySection([records[4], records[5], records[6]]), signupRateBySection([]), "tests, unfinished and dashboard-less sessions never count");
  });
});

// ── Supabase row mapping (pure) ─────────────────────────────────────────────

group("supabase row mapping", () => {
  test("recordToRow flattens the headline numbers and keeps the full record", () => {
    const record = fixture();
    const row = recordToRow(record);
    assert.equal(row.session_id, SESSION_ID);
    assert.equal(row.seq, 7);
    assert.equal(row.created_at, record.createdAt);
    assert.equal(row.completed_at, record.completedAt);
    assert.equal(row.step, "debrief");
    assert.equal(row.variant, "A");
    assert.equal(row.device_type, "mobile");
    assert.equal(row.pre_anxiety, 7);
    assert.equal(row.post_anxiety, 5);
    assert.equal(row.smoothness_score, 82);
    assert.equal(row.dashboard_active_ms, 251000);
    assert.equal(row.sections_opened, 6);
    assert.equal(row.alert_tapped, true);
    assert.equal(row.check_frequency, "weekly");
    assert.equal(row.worries_most, "turbulence");
    assert.equal(row.anxiety_starts, "days_before");
    assert.equal(row.travel_impact, "paid_more,skipped_trip");
    assert.equal(row.email, "participant@example.com");
    assert.equal(row.record, record);
    assert.equal("updated_at" in row, false, "updated_at is the database's job");
    assert.equal("delta_anxiety" in row, false, "generated columns are never written");
  });

  test("recordToRow uses nulls before the flight and dashboard exist", () => {
    const record = { ...fixture(), flight: null, dashboard: null, email: "" };
    const row = recordToRow(record);
    assert.equal(row.smoothness_score, null);
    assert.equal(row.dashboard_active_ms, null);
    assert.equal(row.sections_opened, null);
    assert.equal(row.alert_tapped, null);
    assert.equal(row.email, null);
    assert.equal(recordToRow({ ...fixture(), post: { ...fixture().post, travelImpact: [] } }).travel_impact, null);
  });

  test("a table without the newer columns gets the row without them (record jsonb keeps everything)", () => {
    const row = recordToRow(fixture());
    const legacy = withoutNewerColumns(row);
    assert.equal("worries_most" in legacy, false);
    assert.equal("anxiety_starts" in legacy, false);
    assert.equal("travel_impact" in legacy, false);
    assert.equal(legacy.record.pre.worriesMost, "turbulence");
    assert.equal(isMissingColumn({ code: "PGRST204", message: "Could not find the 'worries_most' column of 'responses' in the schema cache" }), true);
    assert.equal(isMissingColumn({ code: "42703", message: 'column "travel_impact" of relation "responses" does not exist' }), true);
    assert.equal(isMissingColumn({ code: "23505", message: "duplicate key value violates unique constraint" }), false);
  });

  test("rowToRecord reads the jsonb column (object or string)", () => {
    const record = fixture();
    assert.deepEqual(rowToRecord({ record }), record);
    assert.deepEqual(rowToRecord({ record: JSON.stringify(record) }), record);
    assert.throws(() => rowToRecord({ session_id: SESSION_ID }), /record/);
    assert.throws(() => rowToRecord({ record: 5 }), /record/);
    assert.throws(() => rowToRecord(null), /record/);
  });
});

// ── File store ──────────────────────────────────────────────────────────────

let tempDir = "";

function session(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

group("file store", () => {
  test("creates the parent directory and stores a JSON object keyed by sessionId", async () => {
    const store = createFileStore(join(tempDir, "nested", "deeper", "responses.json"));
    await store.upsert(fixture());
    const raw = JSON.parse(await readFile(store.path, "utf8"));
    assert.deepEqual(Object.keys(raw), [SESSION_ID]);
    assert.deepEqual(raw[SESSION_ID], fixture());
    assert.deepEqual(await store.list(), [fixture()]);
  });

  test("resolves a relative path against the current working directory", () => {
    const store = createFileStore("./data/responses.json");
    assert.equal(store.path, join(process.cwd(), "data", "responses.json"));
  });

  test("lists nothing when the file does not exist yet", async () => {
    const store = createFileStore(join(tempDir, "empty", "responses.json"));
    assert.deepEqual(await store.list(), []);
  });

  test("a higher seq replaces the record but keeps the original createdAt", async () => {
    const store = createFileStore(join(tempDir, "seq", "responses.json"));
    const first = { ...fixture(), seq: 1, step: "pre" as const, createdAt: "2026-10-13T14:02:11.000Z" };
    const later = { ...fixture(), seq: 2, step: "setup" as const, createdAt: "2026-10-13T14:03:00.000Z" };
    await store.upsert(first);
    await store.upsert(later);
    const [stored] = await store.list();
    assert.equal(stored.seq, 2);
    assert.equal(stored.step, "setup");
    assert.equal(stored.createdAt, first.createdAt);
    assert.equal((await store.list()).length, 1);
  });

  test("a stale (lower seq) write is ignored; an equal seq wins as the latest copy", async () => {
    const store = createFileStore(join(tempDir, "stale", "responses.json"));
    await store.upsert({ ...fixture(), seq: 5, step: "post" });
    await store.upsert({ ...fixture(), seq: 3, step: "dashboard" });
    let [stored] = await store.list();
    assert.equal(stored.seq, 5);
    assert.equal(stored.step, "post");
    await store.upsert({ ...fixture(), seq: 5, step: "debrief" });
    [stored] = await store.list();
    assert.equal(stored.step, "debrief");
  });

  test("lists newest first by createdAt", async () => {
    const store = createFileStore(join(tempDir, "order", "responses.json"));
    const times = ["2026-10-11T09:00:00.000Z", "2026-10-13T09:00:00.000Z", "2026-10-12T09:00:00.000Z"];
    for (const [i, createdAt] of times.entries()) {
      await store.upsert({ ...fixture(), sessionId: session(i), createdAt });
    }
    const listed = await store.list();
    assert.deepEqual(
      listed.map((r) => r.createdAt),
      ["2026-10-13T09:00:00.000Z", "2026-10-12T09:00:00.000Z", "2026-10-11T09:00:00.000Z"],
    );
  });

  test("concurrent writes are serialized and never tear the file", async () => {
    const store = createFileStore(join(tempDir, "concurrent", "responses.json"));
    const seqs = Array.from({ length: 30 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    const writes = [
      ...seqs.map((seq) => store.upsert({ ...fixture(), seq, step: seq === 30 ? "debrief" : "dashboard" })),
      ...Array.from({ length: 10 }, (_, i) => store.upsert({ ...fixture(), sessionId: session(100 + i), seq: 1 })),
    ];
    const listedWhileWriting = store.list();
    await Promise.all([...writes, listedWhileWriting]);
    const listed = await store.list();
    assert.equal(listed.length, 11);
    const main = listed.find((r) => r.sessionId === SESSION_ID);
    assert.equal(main?.seq, 30);
    assert.equal(main?.step, "debrief");
    const raw = JSON.parse(await readFile(store.path, "utf8"));
    assert.equal(Object.keys(raw).length, 11);
    const leftovers = (await readdir(join(tempDir, "concurrent"))).filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "no temp files left behind");
  });

  test("a corrupt data file fails loudly instead of being overwritten", async () => {
    const path = join(tempDir, "corrupt", "responses.json");
    const store = createFileStore(path);
    await store.upsert(fixture());
    await writeFile(path, "{ not json", "utf8");
    await assert.rejects(store.upsert({ ...fixture(), seq: 8 }), /not valid JSON/);
    await assert.rejects(store.list(), /not valid JSON/);
    assert.equal(await readFile(path, "utf8"), "{ not json", "file untouched");
  });
});

// ── parseSignup ─────────────────────────────────────────────────────────────

function looseSignup(mutate: (s: Loose) => void): unknown {
  const s = JSON.parse(JSON.stringify(signupFixture())) as Loose;
  mutate(s);
  return s;
}

function expectSignupError(input: unknown, code: string): void {
  const result = parseSignup(input);
  assert.equal(result.ok, false, `expected rejection with ${code}`);
  if (!result.ok) assert.equal(result.error, code);
}

function expectSignup(input: unknown): Signup {
  const result = parseSignup(input);
  assert.equal(result.ok, true, `expected acceptance, got ${result.ok ? "" : result.error}`);
  if (!result.ok) throw new Error("unreachable");
  return result.signup;
}

group("parseSignup", () => {
  test("accepts a full sign-up unchanged, as a fresh object", () => {
    const input = signupFixture();
    const signup = expectSignup(input);
    assert.deepEqual(signup, signupFixture());
    assert.notEqual(signup, input);
    assert.deepEqual(expectSignup(JSON.parse(JSON.stringify(input))), signupFixture(), "survives a JSON round trip");
  });

  test("rejects non-objects and unknown schema versions", () => {
    expectSignupError(null, "invalid_body");
    expectSignupError("sam@example.com", "invalid_body");
    expectSignupError([], "invalid_body");
    expectSignupError(looseSignup((s) => (s.schemaVersion = 2)), "unsupported_schema_version");
    assert.equal(expectSignup(looseSignup((s) => delete s.schemaVersion)).schemaVersion, 1);
  });

  test("id must be a UUID; it is trimmed and lower-cased", () => {
    expectSignupError(looseSignup((s) => delete s.id), "missing_id");
    expectSignupError(looseSignup((s) => (s.id = "")), "missing_id");
    expectSignupError(looseSignup((s) => (s.id = "abc")), "missing_id");
    expectSignupError(looseSignup((s) => (s.id = 42)), "missing_id");
    assert.equal(expectSignup(looseSignup((s) => (s.id = ` ${SIGNUP_ID.toUpperCase()} `))).id, SIGNUP_ID);
  });

  test("email must look like one (kept as typed, trimmed)", () => {
    expectSignupError(looseSignup((s) => delete s.email), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = "")), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = "not an email")), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = "a@b.c")), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = "sam@example")), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = `${"a".repeat(250)}@example.com`)), "invalid_email");
    expectSignupError(looseSignup((s) => (s.email = ["sam@example.com"])), "invalid_email");
    assert.equal(expectSignup(looseSignup((s) => (s.email = "  Person@Example.org "))).email, "Person@Example.org");
  });

  test("source, placement and createdAt are strict", () => {
    expectSignupError(looseSignup((s) => (s.source = "C")), "invalid_source");
    expectSignupError(looseSignup((s) => delete s.source), "invalid_source");
    expectSignupError(looseSignup((s) => (s.placement = "footer")), "invalid_placement");
    expectSignupError(looseSignup((s) => (s.placement = null)), "invalid_placement");
    expectSignupError(looseSignup((s) => delete s.createdAt), "invalid_created_at");
    expectSignupError(looseSignup((s) => (s.createdAt = "yesterday")), "invalid_created_at");
    expectSignupError(looseSignup((s) => (s.createdAt = "2026-10-21")), "invalid_created_at");
    expectSignupError(looseSignup((s) => (s.createdAt = 1760364131000)), "invalid_created_at");
    expectSignupError(looseSignup((s) => (s.createdAt = "1999-12-31T23:59:59Z")), "invalid_created_at");
    assert.equal(expectSignup(looseSignup((s) => (s.createdAt = "2026-10-21T17:30:00+02:00"))).createdAt, "2026-10-21T15:30:00.000Z");
    const c = expectSignup(
      looseSignup((s) => {
        s.source = "c";
        s.placement = "c_compare";
        s.sessionId = null;
        s.variant = null;
        s.page = "/c/compare";
      }),
    );
    assert.equal(c.source, "c");
    assert.equal(c.placement, "c_compare");
    assert.equal(c.sessionId, null);
    assert.equal(c.variant, null);
  });

  test("free text is one line, trimmed, cleaned and capped", () => {
    const signup = expectSignup(
      looseSignup((s) => {
        s.firstName = "  Sam\n\tLee  Jr ";
        s.context = `JFK → LAX\u0000 · Nov 26\n· ${"x".repeat(200)}`;
        s.participant = "José M. <script>";
      }),
    );
    assert.equal(signup.firstName, "Sam Lee Jr");
    assert.equal(signup.context.startsWith("JFK → LAX · Nov 26 · xxx"), true);
    assert.equal(signup.context.length, MAX_CONTEXT_CHARS);
    assert.equal(signup.participant, "José M. script");
    assert.equal(expectSignup(looseSignup((s) => (s.firstName = "x".repeat(80)))).firstName.length, 60);
    assert.equal(expectSignup(looseSignup((s) => (s.firstName = 7))).firstName, "");
    assert.equal(expectSignup(looseSignup((s) => delete s.context)).context, "");
    assert.equal(expectSignup(looseSignup((s) => (s.participant = "x".repeat(80)))).participant.length, 40);
  });

  test("page is reduced to a pathname", () => {
    const page = (v: unknown) => expectSignup(looseSignup((s) => (s.page = v))).page;
    assert.equal(page("/c/compare"), "/c/compare");
    assert.equal(page("/c/compare?key=secret#top"), "/c/compare");
    assert.equal(page("https://preflight.example/c/flight?x=1"), "/c/flight");
    assert.equal(page("c/results"), "/c/results");
    assert.equal(page(""), "");
    assert.equal(page(7), "");
    assert.equal(page("javascript:alert(1)"), "");
    assert.equal(page(`/${"p".repeat(500)}`).length, 200);
  });

  test("booleans, session id and variant fall back safely", () => {
    const signup = expectSignup(
      looseSignup((s) => {
        delete s.waitlist;
        s.interview = "yes";
        s.isTest = 1;
        s.sessionId = "abc";
        s.variant = "C";
      }),
    );
    assert.equal(signup.waitlist, true, "the primary action: true unless explicitly false");
    assert.equal(signup.interview, false);
    assert.equal(signup.isTest, false);
    assert.equal(signup.sessionId, null);
    assert.equal(signup.variant, null);
    const explicit = expectSignup(
      looseSignup((s) => {
        s.waitlist = false;
        s.interview = true;
        s.isTest = true;
        s.sessionId = ` ${SESSION_ID.toUpperCase()} `;
        s.variant = "B";
      }),
    );
    assert.equal(explicit.waitlist, false);
    assert.equal(explicit.interview, true);
    assert.equal(explicit.isTest, true);
    assert.equal(explicit.sessionId, SESSION_ID);
    assert.equal(explicit.variant, "B");
    assert.equal(expectSignup(looseSignup((s) => (s.sessionId = null))).sessionId, null);
  });

  test("unknown keys are dropped", () => {
    const signup = expectSignup(
      looseSignup((s) => {
        s.extra = "top";
        s.__proto__ = { polluted: true };
        s.record = {};
      }),
    );
    assert.deepEqual(signup, signupFixture());
    assert.equal(Object.hasOwn(signup, "extra"), false);
    assert.equal(({} as Loose).polluted, undefined, "no prototype pollution");
  });

  test("dedupe key: lower-cased, trimmed email per source", () => {
    assert.equal(emailKey("  Sam@Example.COM "), "sam@example.com");
    assert.equal(signupKey(signupFixture()), "sam@example.com|study");
    assert.equal(signupKey({ email: "sam@example.com", source: "c" }), "sam@example.com|c");
    const again = expectSignup(
      looseSignup((s) => {
        s.id = session(9);
        s.email = "SAM@example.com";
      }),
    );
    assert.equal(signupKey(again), signupKey(signupFixture()), "same person, same source");
  });
});

// ── Sign-up stats and CSV ───────────────────────────────────────────────────

group("signup stats and CSV", () => {
  test("sorts newest first with id as the tie-break", () => {
    const a = { ...signupFixture(), id: session(1), createdAt: "2026-10-21T10:00:00.000Z" };
    const b = { ...signupFixture(), id: session(2), createdAt: "2026-10-22T10:00:00.000Z" };
    const c = { ...signupFixture(), id: session(3), createdAt: "2026-10-22T10:00:00.000Z" };
    assert.deepEqual(sortSignupsNewestFirst([c, a, b]).map((s) => s.id), [b.id, c.id, a.id]);
  });

  test("CSV: BOM, header, formula-safe cells, blanks for nulls", () => {
    const csv = signupsToCsv([
      signupFixture(),
      { ...signupFixture(), id: session(2), source: "c", placement: "c_home", firstName: "=cmd", sessionId: null, variant: null, context: "JFK → LAX, Nov 26", page: "/c" },
    ]);
    assert.equal(csv.startsWith("﻿"), true);
    const lines = csv.slice(1).split("\r\n");
    assert.deepEqual(lines[0].split(","), [...SIGNUP_CSV_COLUMNS]);
    assert.equal(lines[1], `${SIGNUP_ID},2026-10-21T15:30:00.000Z,study,debrief,Sam,Sam@Example.com,true,true,${SESSION_ID},A,false,sarah,JFK → LAX · Nov 26,/`);
    assert.equal(lines[2], `${session(2)},2026-10-21T15:30:00.000Z,c,c_home,'=cmd,Sam@Example.com,true,true,,,false,sarah,"JFK → LAX, Nov 26",/c`);
    assert.deepEqual(lines.slice(3), [""], "ends with CRLF");
  });

  test("stats: totals, unique emails, by source and placement", () => {
    const signups: Signup[] = [
      signupFixture(),
      { ...signupFixture(), id: session(2), email: "SAM@example.com", source: "c", placement: "c_compare", sessionId: null, variant: null, interview: false },
      { ...signupFixture(), id: session(3), email: "kim@example.com", source: "c", placement: "c_compare", sessionId: null, variant: null, interview: false },
    ];
    const stats = signupStats(signups, []);
    assert.equal(stats.total, 3);
    assert.equal(stats.uniqueEmails, 2);
    assert.equal(stats.interview, 1);
    assert.deepEqual(stats.bySource, { study: 1, c: 2, d: 0 });
    assert.deepEqual(stats.byPlacement, { debrief: 1, c_compare: 2 });
    assert.deepEqual(stats.study.all, { signups: 1, sawForm: 1, pct: 100 }, "a signed-up session reached the debrief even without its record");
  });

  test("stats: the study rate per variant counts real sessions once and never passes 100%", () => {
    const records: SessionRecord[] = [
      fixture(), // A, debrief, signed up (the fixture's record says waitlist: true, like the debrief save does)
      { ...fixture(), sessionId: session(2), variant: "A", step: "post", completedAt: null, waitlist: false }, // A, stopped after the briefing: saw its card
      { ...fixture(), sessionId: session(3), variant: "B", step: "debrief", waitlist: false }, // B, no sign-up
      { ...fixture(), sessionId: session(4), variant: "B", step: "post", completedAt: null, waitlist: false }, // B, signed up but the debrief save never landed
      { ...fixture(), sessionId: session(5), variant: "B", step: "debrief", isTest: true }, // team test
    ];
    const signups: Signup[] = [
      signupFixture(),
      { ...signupFixture(), id: session(11), email: "again@example.com" }, // the same session twice: one sign-up
      { ...signupFixture(), id: session(12), sessionId: session(4), variant: "A", email: "b@example.com" }, // the record says B: trust the record
      { ...signupFixture(), id: session(13), sessionId: session(5), variant: "B", email: "t@example.com" }, // test session: excluded
      { ...signupFixture(), id: session(14), sessionId: null, variant: "B", isTest: true, email: "t2@example.com" },
      { ...signupFixture(), id: session(15), sessionId: null, variant: null, email: "nov@example.com" }, // no variant known: not counted
      { ...signupFixture(), id: session(16), source: "c", placement: "c_home", sessionId: null, variant: null, email: "c@example.com" },
    ];
    const stats = signupStats(signups, records);
    assert.deepEqual(stats.study.A, { signups: 1, sawForm: 2, pct: 50 });
    assert.deepEqual(stats.study.B, { signups: 1, sawForm: 2, pct: 50 });
    assert.deepEqual(stats.study.all, { signups: 2, sawForm: 4, pct: 50 });
    assert.deepEqual(signupStats([], records).study.A, { signups: 1, sawForm: 2, pct: 50 }, "no rows: the fixture's record still says waitlist");
    const declined = records.map((r) => ({ ...r, waitlist: false }));
    assert.deepEqual(signupStats([], declined).study.A, { signups: 0, sawForm: 2, pct: 0 });
    assert.equal(signupStats([], []).study.all.pct, null);
  });

  test("stats: the briefing's sign-up card counts dropouts who saw it, signed up or not", () => {
    const records: SessionRecord[] = [
      { ...fixture(), sessionId: session(1), waitlist: true }, // debrief, signed up
      { ...fixture(), sessionId: session(2), waitlist: false }, // debrief, declined
      { ...fixture(), sessionId: session(3), step: "dashboard", completedAt: null, waitlist: true }, // signed up on the card, then stopped
      { ...fixture(), sessionId: session(4), step: "dashboard", completedAt: null, waitlist: false }, // saw the card, no sign-up, stopped
      { ...fixture(), sessionId: session(5), step: "setup", completedAt: null, waitlist: false }, // never saw a form
      { ...fixture(), sessionId: session(6), step: "pre", completedAt: null, waitlist: false },
      { ...fixture(), sessionId: session(7), step: "dashboard", completedAt: null, waitlist: true, isTest: true }, // team test
    ];
    assert.deepEqual(signupStats([], records).study.A, { signups: 2, sawForm: 4, pct: 50 });
    const row: Signup = { ...signupFixture(), id: session(13), sessionId: session(3), placement: "dashboard", email: "card@example.com" };
    assert.deepEqual(signupStats([row], records).study.A, { signups: 2, sawForm: 4, pct: 50 }, "the card's row is the same session: counted once");
    assert.deepEqual(signupStats([], [records[4], records[5]]).study.A, { signups: 0, sawForm: 0, pct: null }, "nobody saw a form yet");
  });

  test("stats: a session whose record says waitlist counts even without a sign-up row", () => {
    // Two real B sessions signed up with the same email: the store keeps one row (the later session's).
    const records: SessionRecord[] = [
      { ...fixture(), sessionId: session(1), variant: "B", waitlist: true, interview: false },
      { ...fixture(), sessionId: session(2), variant: "B", waitlist: true, interview: true },
      { ...fixture(), sessionId: session(3), variant: "B", step: "post", completedAt: null, waitlist: true }, // POST /signups lost, debrief save landed
      { ...fixture(), sessionId: session(4), variant: "A", waitlist: false }, // declined
      { ...fixture(), sessionId: session(5), variant: "A", waitlist: true, isTest: true }, // team test
    ];
    const oneRow: Signup[] = [{ ...signupFixture(), id: session(12), sessionId: session(2), variant: "B", email: "two@example.com" }];
    assert.deepEqual(signupStats(oneRow, records).study.B, { signups: 3, sawForm: 3, pct: 100 });
    assert.deepEqual(signupStats(oneRow, records).study.A, { signups: 0, sawForm: 1, pct: 0 });
    assert.deepEqual(signupStats([], records).study.B, { signups: 3, sawForm: 3, pct: 100 }, "no rows at all: the records carry the fact");
    assert.equal(signupStats(oneRow, records).total, 1, "the totals still count rows");
  });
});

// ── Supabase row mapping: sign-ups (pure) ───────────────────────────────────

group("supabase row mapping: sign-ups", () => {
  test("signupToRow flattens the columns and keeps the full sign-up", () => {
    const signup = signupFixture();
    const row = signupToRow(signup);
    assert.deepEqual(row, {
      id: SIGNUP_ID,
      created_at: "2026-10-21T15:30:00.000Z",
      source: "study",
      placement: "debrief",
      email: "Sam@Example.com",
      first_name: "Sam",
      waitlist: true,
      interview: true,
      session_id: SESSION_ID,
      variant: "A",
      is_test: false,
      participant: "sarah",
      context: "JFK → LAX · Nov 26",
      page: "/",
      record: signup,
    });
    assert.equal(row.record, signup);
    assert.equal("email_key" in row, false, "email_key is generated by the database");
    assert.equal("updated_at" in row, false, "updated_at is the database's job");
  });

  test("signupToRow uses nulls for empty optional text", () => {
    const row = signupToRow({ ...signupFixture(), source: "c", placement: "c_home", firstName: "", sessionId: null, variant: null, participant: "", context: "", page: "" });
    assert.equal(row.first_name, null);
    assert.equal(row.session_id, null);
    assert.equal(row.variant, null);
    assert.equal(row.participant, null);
    assert.equal(row.context, null);
    assert.equal(row.page, null);
  });

  test("rowToSignup reads the jsonb column (object or string)", () => {
    const signup = signupFixture();
    assert.deepEqual(rowToSignup({ record: signup }), signup);
    assert.deepEqual(rowToSignup({ record: JSON.stringify(signup) }), signup);
    assert.throws(() => rowToSignup({ id: SIGNUP_ID }), /record/);
    assert.throws(() => rowToSignup({ record: "[]" }), /record/);
  });
});

// ── File store: sign-ups ────────────────────────────────────────────────────

group("file store: sign-ups", () => {
  test("writes signups.json next to the responses file, keyed by email_key|source", async () => {
    const store = createFileStore(join(tempDir, "signups", "responses.json"));
    assert.equal(store.signupsPath, join(tempDir, "signups", SIGNUPS_FILE));
    await store.upsertSignup(signupFixture());
    const raw = JSON.parse(await readFile(store.signupsPath, "utf8"));
    assert.deepEqual(Object.keys(raw), ["sam@example.com|study"]);
    assert.deepEqual(raw["sam@example.com|study"], signupFixture());
    assert.deepEqual(await store.listSignups(), [signupFixture()]);
    assert.deepEqual(await store.list(), [], "the responses file is separate");
    await store.upsert(fixture());
    assert.deepEqual(await store.listSignups(), [signupFixture()], "and a session save leaves sign-ups alone");
    assert.deepEqual((await readdir(join(tempDir, "signups"))).sort(), ["responses.json", SIGNUPS_FILE]);
  });

  test("lists nothing when the file does not exist yet", async () => {
    const store = createFileStore(join(tempDir, "signups-empty", "responses.json"));
    assert.deepEqual(await store.listSignups(), []);
  });

  test("the same email from the same source updates the entry but keeps the original createdAt", async () => {
    const store = createFileStore(join(tempDir, "signups-dupe", "responses.json"));
    await store.upsertSignup(signupFixture());
    const again = { ...signupFixture(), id: session(2), createdAt: "2026-10-22T09:00:00.000Z", email: "SAM@example.com", firstName: "Samuel", interview: false };
    await store.upsertSignup(again);
    const listed = await store.listSignups();
    assert.equal(listed.length, 1);
    // The new name wins; the earlier interview opt-in survives an unticked box (see the next test).
    assert.deepEqual(listed[0], { ...again, createdAt: signupFixture().createdAt, interview: true });
    // Another source is another entry.
    await store.upsertSignup({ ...signupFixture(), id: session(3), source: "c", placement: "c_home", sessionId: null, variant: null });
    assert.equal((await store.listSignups()).length, 2);
  });

  test("a repeat with a blank name and an unticked interview box keeps the earlier name and opt-in", async () => {
    const store = createFileStore(join(tempDir, "signups-merge", "responses.json"));
    const first: Signup = { ...signupFixture(), source: "c", placement: "c_compare", sessionId: null, variant: null, firstName: "Cee", interview: true, context: "JFK → LAX · 2 flights in compare" };
    await store.upsertSignup(first);
    const repeat: Signup = { ...first, id: session(4), createdAt: "2026-10-22T09:00:00.000Z", placement: "c_flight", firstName: "", interview: false, context: "", page: "/c/flight/abc" };
    await store.upsertSignup(repeat);
    const listed = await store.listSignups();
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0], { ...repeat, createdAt: first.createdAt, firstName: "Cee", interview: true });
    // The first sign-up blank, the repeat filled in: the repeat's values are kept as they are.
    const store2 = createFileStore(join(tempDir, "signups-merge-2", "responses.json"));
    await store2.upsertSignup({ ...first, firstName: "", interview: false });
    await store2.upsertSignup({ ...repeat, firstName: "C.", interview: true });
    assert.deepEqual((await store2.listSignups())[0], { ...repeat, createdAt: first.createdAt, firstName: "C.", interview: true });
  });

  test("an id that already belongs to another email is refused, like the database's primary key", async () => {
    const store = createFileStore(join(tempDir, "signups-id", "responses.json"));
    await store.upsertSignup(signupFixture());
    await assert.rejects(store.upsertSignup({ ...signupFixture(), email: "other@example.com" }), /already belongs/);
    assert.equal((await store.listSignups()).length, 1, "file untouched");
    // The same id with the same email is just a repeat.
    await store.upsertSignup({ ...signupFixture(), firstName: "Sammy" });
    assert.equal((await store.listSignups())[0].firstName, "Sammy");
  });

  test("lists newest first", async () => {
    const store = createFileStore(join(tempDir, "signups-order", "responses.json"));
    const times = ["2026-10-11T09:00:00.000Z", "2026-10-13T09:00:00.000Z", "2026-10-12T09:00:00.000Z"];
    for (const [i, createdAt] of times.entries()) {
      await store.upsertSignup({ ...signupFixture(), id: session(20 + i), email: `p${i}@example.com`, createdAt });
    }
    assert.deepEqual(
      (await store.listSignups()).map((s) => s.createdAt),
      ["2026-10-13T09:00:00.000Z", "2026-10-12T09:00:00.000Z", "2026-10-11T09:00:00.000Z"],
    );
  });

  test("a corrupt sign-up file fails loudly instead of being overwritten", async () => {
    const store = createFileStore(join(tempDir, "signups-corrupt", "responses.json"));
    await store.upsertSignup(signupFixture());
    await writeFile(store.signupsPath, "[]", "utf8");
    await assert.rejects(store.upsertSignup(signupFixture()), /keyed by email_key\|source/);
    await assert.rejects(store.listSignups(), /keyed by/);
    assert.equal(await readFile(store.signupsPath, "utf8"), "[]", "file untouched");
  });
});

// ── Flights: validation (docs/REAL_DATA.md, step 1) ─────────────────────────

/** A fixed server day for the validation tests: local noon, so the calendar day is unambiguous. */
const SERVER_TODAY = new Date(2026, 10, 4, 12, 0, 0);
const TODAY_ISO = toISODate(SERVER_TODAY);

group("flights: validation", () => {
  test("accepts catalogue codes with a date from yesterday to a day past 330 days ahead", () => {
    // One day either side of the window: a traveller west of the server is still on yesterday, one east is already on tomorrow.
    for (const date of [addDays(TODAY_ISO, -1), TODAY_ISO, addDays(TODAY_ISO, 330), addDays(TODAY_ISO, 331)]) {
      assert.deepEqual(validateDayQuery({ from: "JFK", to: "LAX", date }, SERVER_TODAY), { ok: true, query: { from: "JFK", to: "LAX", date } });
    }
  });

  test("rejects a date outside that window", () => {
    for (const date of [addDays(TODAY_ISO, -2), addDays(TODAY_ISO, 332), "2020-01-01"]) {
      assert.deepEqual(validateDayQuery({ from: "JFK", to: "LAX", date }, SERVER_TODAY), { ok: false, error: "date_out_of_range" });
    }
  });

  test("rejects malformed or unknown airports and dates with one short code each", () => {
    const expect = (raw: { from?: string; to?: string; date?: string }, error: string) =>
      assert.deepEqual(validateDayQuery(raw, SERVER_TODAY), { ok: false, error }, JSON.stringify(raw));
    expect({ to: "LAX", date: TODAY_ISO }, "invalid_from");
    expect({ from: "jfk", to: "LAX", date: TODAY_ISO }, "invalid_from");
    expect({ from: "JFKX", to: "LAX", date: TODAY_ISO }, "invalid_from");
    expect({ from: "ZZZ", to: "LAX", date: TODAY_ISO }, "unknown_from");
    expect({ from: "JFK", date: TODAY_ISO }, "invalid_to");
    expect({ from: "JFK", to: "LAX ", date: TODAY_ISO }, "invalid_to");
    expect({ from: "JFK", to: "QQQ", date: TODAY_ISO }, "unknown_to");
    expect({ from: "JFK", to: "JFK", date: TODAY_ISO }, "same_airport");
    expect({ from: "JFK", to: "LAX" }, "invalid_date");
    expect({ from: "JFK", to: "LAX", date: "2026-2-3" }, "invalid_date");
    expect({ from: "JFK", to: "LAX", date: "2026-02-30" }, "invalid_date");
    expect({ from: "JFK", to: "LAX", date: "26/11/2026" }, "invalid_date");
  });
});

// ── Flights: providers ──────────────────────────────────────────────────────

const FETCHED_MS = Date.UTC(2026, 10, 4, 12, 0, 0);
const FETCHED_AT = new Date(FETCHED_MS).toISOString();
const FIXTURE_DAY = "2026-11-26";
const JFK_LAX = { from: "JFK", to: "LAX", date: FIXTURE_DAY };
const clockAt = (ms: number) => () => ms;

/** JFK → LAX on the fixture day, as the mapping should read backend/fixtures/aerodatabox/JFK-2026-11-26.json. */
function fixtureRows(): ScheduleRow[] {
  const base = { origin: "JFK", destination: "LAX", date: FIXTURE_DAY, arriveDayOffset: 0 };
  return [
    { ...base, airline: "DL", airlineName: "Delta Air Lines", number: "423", departTime: "06:00", arriveTime: "09:25", blockMin: 385, aircraft: { name: "Boeing 767-300(ER)" }, terminal: "4" },
    { ...base, airline: "B6", airlineName: "JetBlue Airways", number: "23", departTime: "07:00", arriveTime: "10:28", blockMin: 388, aircraft: { name: "Airbus A321-231" }, terminal: "5" },
    { ...base, airline: "AA", airlineName: "American Airlines", number: "1", departTime: "08:00", arriveTime: "11:30", blockMin: 390, aircraft: { name: "Airbus A321" }, terminal: "8" },
    { ...base, airline: "YX", airlineName: "Republic Airways", number: "4512", departTime: "10:15", arriveTime: "13:52", blockMin: 397, aircraft: { name: "Embraer 175" } },
    { ...base, airline: "UA", airlineName: "United Airlines", number: "1455", departTime: "21:10", arriveTime: "00:35", arriveDayOffset: 1, blockMin: 385, aircraft: { name: "Boeing 757-200" }, terminal: "7" },
  ];
}

function fixtureDay(): RouteDaySchedule {
  return { origin: "JFK", destination: "LAX", date: FIXTURE_DAY, provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: fixtureRows(), served: true };
}

/** The fixture's departures, as the file lists them. */
async function fixtureDepartures(): Promise<AdbFlight[]> {
  const fids = JSON.parse(await readFile(fixtureFile(defaultFixtureDir(), "JFK", FIXTURE_DAY), "utf8")) as AdbFids;
  return fids.departures ?? [];
}

/** A listed departure at noon to LAX (the minute both windows share), with the parts a test may swap. */
function noonFlight(number: string, overrides: Partial<AdbFlight> = {}): AdbFlight {
  const departure: AdbMovement = { scheduledTime: { utc: `${FIXTURE_DAY} 17:00Z`, local: `${FIXTURE_DAY} 12:00-05:00` }, terminal: "8", quality: ["Basic"] };
  const arrival: AdbMovement = { airport: { iata: "LAX" }, scheduledTime: { utc: `${FIXTURE_DAY} 23:30Z`, local: `${FIXTURE_DAY} 15:30-08:00` }, quality: ["Basic"] };
  return {
    number,
    status: "Expected",
    codeshareStatus: "IsOperator",
    isCargo: false,
    departure,
    arrival,
    aircraft: { model: "Airbus A321" },
    airline: { name: "American Airlines", iata: "AA", icao: "AAL" },
    ...overrides,
  };
}

group("flights: providers", () => {
  test("providerName follows FLIGHT_PROVIDER, the generator by default and for anything unknown", () => {
    assert.equal(providerName({}), "generator");
    assert.equal(providerName({ FLIGHT_PROVIDER: "aerodatabox" }), "aerodatabox");
    assert.equal(providerName({ FLIGHT_PROVIDER: " Fixture " }), "fixture");
    assert.equal(providerName({ FLIGHT_PROVIDER: "nope" }), "generator");
  });

  test("currentProvider: each name; AeroDataBox without a key fails as a provider rather than falling back", async () => {
    assert.equal(currentProvider({}).name, "generator");
    assert.equal(currentProvider({ FLIGHT_PROVIDER: "fixture" }).name, "fixture");
    assert.equal(currentProvider({ FLIGHT_PROVIDER: "aerodatabox", AERODATABOX_API_KEY: "k" }).name, "aerodatabox");
    const keyless = currentProvider({ FLIGHT_PROVIDER: "aerodatabox" });
    assert.equal(keyless.name, "aerodatabox");
    await assert.rejects(keyless.fetchDay("JFK", "LAX", FIXTURE_DAY), (err: unknown) => err instanceof ProviderError && /AERODATABOX_API_KEY/.test(err.message));
  });

  test("the generator provider is generatedSchedule with the clock as fetchedAt", async () => {
    const schedule = await createGeneratorProvider(clockAt(FETCHED_MS)).fetchDay("JFK", "LAX", FIXTURE_DAY);
    assert.deepEqual(schedule, generatedSchedule({ origin: "JFK", destination: "LAX", date: FIXTURE_DAY }, FETCHED_AT));
    assert.equal(schedule.provider, "generator");
    assert.equal(schedule.served, true);
    assert.ok(schedule.rows.length > 0);
  });

  test("the fixture provider maps JFK → LAX: local times, the overnight offset, block minutes, terminals; the codeshare, the cargo flight and the other destination left out", async () => {
    const provider = createFixtureProvider(defaultFixtureDir(), clockAt(FETCHED_MS));
    assert.equal(provider.name, "fixture");
    const schedule = await provider.fetchDay("JFK", "LAX", FIXTURE_DAY);
    assert.deepEqual(schedule, fixtureDay());
    const numbers = schedule.rows.map((r) => `${r.airline} ${r.number}`);
    for (const left of ["VS 4423", "5Y 741", "B6 615"]) assert.equal(numbers.includes(left), false, `${left} is not shown`);
    assert.equal((await fixtureDepartures()).length, 8, "the fixture lists eight departures");
  });

  test("the fixture's other destination is its own day; a destination nobody flies has no rows and an unknown served", async () => {
    const provider = createFixtureProvider(defaultFixtureDir(), clockAt(FETCHED_MS));
    const sfo = await provider.fetchDay("JFK", "SFO", FIXTURE_DAY);
    assert.deepEqual(sfo.rows, [
      { airline: "B6", airlineName: "JetBlue Airways", number: "615", origin: "JFK", destination: "SFO", date: FIXTURE_DAY, departTime: "08:40", arriveTime: "12:17", arriveDayOffset: 0, blockMin: 397, aircraft: { name: "Airbus A321-231" }, terminal: "5" },
    ]);
    assert.equal(sfo.served, true);
    const bos = await provider.fetchDay("JFK", "BOS", FIXTURE_DAY);
    assert.deepEqual(bos, { origin: "JFK", destination: "BOS", date: FIXTURE_DAY, provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: [], served: null });
  });

  test("a day without a fixture is a provider failure", async () => {
    const provider = createFixtureProvider(defaultFixtureDir());
    await assert.rejects(provider.fetchDay("JFK", "LAX", "2026-11-27"), (err: unknown) => err instanceof ProviderError && /no fixture for JFK on 2026-11-27/.test(err.message));
    await assert.rejects(createFixtureProvider(join(tempDir, "nowhere")).fetchDay("JFK", "LAX", FIXTURE_DAY), ProviderError);
  });

  test("the mapped day builds version D's options through the shared path, the regional carrier on its fallback profile", () => {
    const results = optionsFromSchedule(fixtureDay());
    assert.deepEqual(results.options.map((o) => o.key), ["DL423", "B623", "AA1", "YX4512", "UA1455"]);
    const regional = results.options[3].flight;
    assert.equal(regional.airline.name, "Republic Airways");
    assert.equal(regional.flightNumber, "YX 4512");
    const overnight = results.options[4].flight;
    assert.equal(overnight.departTime, "21:10");
    assert.equal(overnight.arriveTime, "00:35");
    assert.equal(overnight.arriveDayOffset, 1);
    assert.equal(overnight.blockMin, 385);
    assert.equal(overnight.terminal, "7");
  });

  test("parseAdbTime reads AeroDataBox's forms and the ISO one; the instant follows the offset", () => {
    assert.deepEqual(parseAdbTime("2026-11-26 06:00-05:00"), { date: "2026-11-26", time: "06:00", ms: Date.UTC(2026, 10, 26, 11, 0) });
    assert.deepEqual(parseAdbTime("2026-11-26 11:00Z"), { date: "2026-11-26", time: "11:00", ms: Date.UTC(2026, 10, 26, 11, 0) });
    assert.deepEqual(parseAdbTime("2026-11-27T00:35:00+05:30"), { date: "2026-11-27", time: "00:35", ms: Date.UTC(2026, 10, 26, 19, 5) });
    assert.deepEqual(parseAdbTime(" 2026-11-26 06:00 "), { date: "2026-11-26", time: "06:00", ms: null });
    for (const bad of [undefined, null, "", "06:00", "2026-11-26", "2026-11-26 25:00Z", "yesterday"]) assert.equal(parseAdbTime(bad), null, String(bad));
  });

  test("splitFlightNumber: the airline's IATA code wins; the digits as published", () => {
    assert.deepEqual(splitFlightNumber("DL 423", "DL"), { airline: "DL", number: "423" });
    assert.deepEqual(splitFlightNumber("DL1423"), { airline: "DL", number: "1423" });
    assert.deepEqual(splitFlightNumber("5Y 741", "5Y"), { airline: "5Y", number: "741" });
    assert.deepEqual(splitFlightNumber("5y741", null), { airline: "5Y", number: "741" });
    assert.deepEqual(splitFlightNumber("GTI 741", "5Y"), { airline: "5Y", number: "741" });
    assert.deepEqual(splitFlightNumber("GTI 741"), { airline: "GTI", number: "741" });
    assert.deepEqual(splitFlightNumber("423", "DL"), { airline: "DL", number: "423" });
    assert.deepEqual(splitFlightNumber("423"), { airline: "", number: "423" });
    assert.deepEqual(splitFlightNumber("???"), { airline: "", number: "" });
  });

  test("scheduleFromFids: pages merge, a flight on the shared minute is listed once, a 204 page is empty, listings missing what a row needs are left out", async () => {
    const all = await fixtureDepartures();
    const morning = all.filter((f) => (f.departure?.scheduledTime?.local ?? "") < `${FIXTURE_DAY} 12:00`);
    const evening = all.filter((f) => !morning.includes(f));
    const pages = [{ departures: [...morning, noonFlight("AA 171")] }, { departures: [noonFlight("AA 171"), ...evening] }];
    const expected = fixtureRows();
    expected.splice(4, 0, {
      airline: "AA", airlineName: "American Airlines", number: "171", origin: "JFK", destination: "LAX", date: FIXTURE_DAY,
      departTime: "12:00", arriveTime: "15:30", arriveDayOffset: 0, blockMin: 390, aircraft: { name: "Airbus A321" }, terminal: "8",
    });
    assert.deepEqual(scheduleFromFids("JFK", "LAX", FIXTURE_DAY, pages, FETCHED_AT).rows, expected);
    assert.deepEqual(scheduleFromFids("JFK", "LAX", FIXTURE_DAY, [null, null], FETCHED_AT), {
      origin: "JFK", destination: "LAX", date: FIXTURE_DAY, provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: [], served: null,
    });
    const base = noonFlight("AA 172");
    const unusable: AdbFlight[] = [
      noonFlight("AA 172", { departure: { ...base.departure, scheduledTime: null } }),
      noonFlight("AA 173", { arrival: { ...base.arrival, scheduledTime: { local: `${FIXTURE_DAY} 15:30` } } }),
      noonFlight("AA 174", { departure: undefined, arrival: undefined, movement: base.arrival }),
      noonFlight("AA 175", { departure: { ...base.departure, scheduledTime: { utc: "2026-11-27 17:00Z", local: "2026-11-27 12:00-05:00" } } }),
      noonFlight("AA 176", { arrival: { ...base.arrival, scheduledTime: { utc: `${FIXTURE_DAY} 16:00Z`, local: `${FIXTURE_DAY} 08:00-08:00` } } }),
      noonFlight("AA 177", { arrival: { ...base.arrival, airport: { iata: "SFO" } } }),
      noonFlight("", { airline: null }),
      noonFlight("AA 178", { codeshareStatus: "IsCodeshared" }),
      noonFlight("AA 179", { isCargo: true }),
    ];
    assert.deepEqual(scheduleFromFids("JFK", "LAX", FIXTURE_DAY, [{ departures: unusable }], FETCHED_AT).rows, []);
    const noModel = scheduleFromFids("JFK", "LAX", FIXTURE_DAY, [{ departures: [noonFlight("AA 180", { aircraft: null, departure: { ...base.departure, terminal: null } })] }], FETCHED_AT);
    assert.deepEqual(noModel.rows[0].aircraft, {});
    assert.equal("terminal" in noModel.rows[0], false);
  });
});

// ── Flights: AeroDataBox adapter (no network: a fetch double) ───────────────

const API_KEY = "test-key-0123456789abcdef";

interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

/** A fetch double answering from a queue in the order asked, recording each request. */
function fetchDouble(answers: Array<() => Response>) {
  const calls: FetchCall[] = [];
  const queue = [...answers];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) } });
    const next = queue.shift();
    if (!next) throw new Error("fetch double: nothing left to answer");
    return next();
  };
  return { calls, fetchImpl };
}

const answer = (status: number, body?: unknown, headers?: Record<string, string>) => () =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

/** The fixture split into the two windows the adapter asks for. */
async function fixturePages(): Promise<[AdbFids, AdbFids]> {
  const all = await fixtureDepartures();
  const morning = all.filter((f) => (f.departure?.scheduledTime?.local ?? "") < `${FIXTURE_DAY} 12:00`);
  return [{ departures: morning }, { departures: all.filter((f) => !morning.includes(f)) }];
}

/** A provider over the double, with a sleep spy instead of waiting. */
function adapter(answers: Array<() => Response>, host: "rapidapi" | "direct" = "rapidapi") {
  const { calls, fetchImpl } = fetchDouble(answers);
  const sleeps: number[] = [];
  const provider = createAeroDataBoxProvider(
    { apiKey: API_KEY, host },
    {
      fetch: fetchImpl,
      now: clockAt(FETCHED_MS),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  );
  return { provider, calls, sleeps };
}

group("flights: aerodatabox adapter", () => {
  test("fidsUrls: the two windows of the local day, departures with their leg, operators and passengers only", () => {
    const query = "direction=Departure&withLeg=true&withCodeshared=false&withCargo=false&withPrivate=false&withCancelled=false";
    assert.deepEqual(fidsUrls("rapidapi", "JFK", FIXTURE_DAY), [
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/JFK/2026-11-26T00:00/2026-11-26T12:00?${query}`,
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/JFK/2026-11-26T12:00/2026-11-26T23:59?${query}`,
    ]);
    assert.equal(fidsUrls("direct", "JFK", FIXTURE_DAY)[0].startsWith("https://api.aerodatabox.com/flights/airports/iata/JFK/"), true);
  });

  test("fidsHeaders and aeroDataBoxConfig: the key goes where each host expects it, rapidapi by default", () => {
    assert.deepEqual(fidsHeaders({ apiKey: API_KEY, host: "rapidapi" }), { Accept: "application/json", "x-rapidapi-key": API_KEY, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" });
    assert.deepEqual(fidsHeaders({ apiKey: API_KEY, host: "direct" }), { Accept: "application/json", "X-Api-Key": API_KEY });
    assert.equal(aeroDataBoxConfig({}), null);
    assert.equal(aeroDataBoxConfig({ AERODATABOX_API_KEY: "  " }), null);
    assert.deepEqual(aeroDataBoxConfig({ AERODATABOX_API_KEY: ` ${API_KEY} ` }), { apiKey: API_KEY, host: "rapidapi" });
    assert.deepEqual(aeroDataBoxConfig({ AERODATABOX_API_KEY: API_KEY, AERODATABOX_HOST: "Direct" }), { apiKey: API_KEY, host: "direct" });
    assert.deepEqual(aeroDataBoxConfig({ AERODATABOX_API_KEY: API_KEY, AERODATABOX_HOST: "other" }), { apiKey: API_KEY, host: "rapidapi" });
  });

  test("a day: both windows fetched with the key in the headers only, the pages mapped like the fixture", async () => {
    const [morning, evening] = await fixturePages();
    const { provider, calls, sleeps } = adapter([answer(200, morning), answer(200, evening)]);
    assert.equal(provider.name, "aerodatabox");
    assert.deepEqual(await provider.fetchDay("JFK", "LAX", FIXTURE_DAY), fixtureDay());
    assert.deepEqual(calls.map((c) => c.url), fidsUrls("rapidapi", "JFK", FIXTURE_DAY));
    for (const call of calls) {
      assert.equal(call.headers["x-rapidapi-key"], API_KEY);
      assert.equal(call.headers["x-rapidapi-host"], "aerodatabox.p.rapidapi.com");
      assert.equal(call.url.includes(API_KEY), false, "the key is never in the URL");
    }
    assert.deepEqual(sleeps, []);
  });

  test("the direct gateway: X-Api-Key, no RapidAPI headers", async () => {
    const { provider, calls } = adapter([answer(204), answer(204)], "direct");
    await provider.fetchDay("JFK", "LAX", FIXTURE_DAY);
    assert.deepEqual(calls.map((c) => c.headers), [{ Accept: "application/json", "X-Api-Key": API_KEY }, { Accept: "application/json", "X-Api-Key": API_KEY }]);
    assert.equal(calls[0].url.startsWith("https://api.aerodatabox.com/"), true);
  });

  test("204 on both windows is a day with no rows", async () => {
    const { provider } = adapter([answer(204), answer(204)]);
    assert.deepEqual(await provider.fetchDay("JFK", "LAX", FIXTURE_DAY), {
      origin: "JFK", destination: "LAX", date: FIXTURE_DAY, provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: [], served: null,
    });
  });

  test("a 429 is retried once after Retry-After: capped at 5 s, 1 s when it says nothing", async () => {
    const [morning, evening] = await fixturePages();
    // The windows are asked together: the first answer is the first window's 429, the second the other window's page, the third the retry.
    let run = adapter([answer(429, undefined, { "retry-after": "2" }), answer(200, evening), answer(200, morning)]);
    assert.deepEqual(await run.provider.fetchDay("JFK", "LAX", FIXTURE_DAY), fixtureDay());
    assert.deepEqual(run.sleeps, [2000]);
    assert.equal(run.calls.length, 3);
    assert.equal(run.calls[2].url, run.calls[0].url, "the same window again");
    run = adapter([answer(429, undefined, { "retry-after": "30" }), answer(204), answer(204)]);
    await run.provider.fetchDay("JFK", "LAX", FIXTURE_DAY);
    assert.deepEqual(run.sleeps, [5000]);
    run = adapter([answer(429), answer(204), answer(204)]);
    await run.provider.fetchDay("JFK", "LAX", FIXTURE_DAY);
    assert.deepEqual(run.sleeps, [1000]);
  });

  test("retryAfterMs: seconds, an HTTP date, nothing, nonsense", () => {
    assert.equal(retryAfterMs(null, FETCHED_MS), 1000);
    assert.equal(retryAfterMs("", FETCHED_MS), 1000);
    assert.equal(retryAfterMs("3", FETCHED_MS), 3000);
    assert.equal(retryAfterMs("0", FETCHED_MS), 0);
    assert.equal(retryAfterMs("120", FETCHED_MS), 5000);
    assert.equal(retryAfterMs(new Date(FETCHED_MS + 2500).toUTCString(), FETCHED_MS), 2000);
    assert.equal(retryAfterMs(new Date(FETCHED_MS - 60_000).toUTCString(), FETCHED_MS), 0);
    assert.equal(retryAfterMs("soon", FETCHED_MS), 1000);
  });

  test("a second 429 is a provider failure", async () => {
    const { provider, sleeps } = adapter([answer(429, undefined, { "retry-after": "1" }), answer(204), answer(429)]);
    await assert.rejects(provider.fetchDay("JFK", "LAX", FIXTURE_DAY), (err: unknown) => err instanceof ProviderError && err.status === 429);
    assert.deepEqual(sleeps, [1000]);
  });

  test("a status other than 200 or 204 is a provider failure whose message never shows the key", async () => {
    const { provider } = adapter([answer(401, { message: `Invalid key ${API_KEY}` }), answer(204)]);
    await assert.rejects(provider.fetchDay("JFK", "LAX", FIXTURE_DAY), (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.status, 401);
      assert.match(err.message, /^AeroDataBox answered 401: Invalid key \[redacted\]$/);
      assert.equal(err.message.includes(API_KEY), false);
      return true;
    });
    const empty = adapter([answer(200), answer(204)]);
    await assert.rejects(empty.provider.fetchDay("JFK", "LAX", FIXTURE_DAY), /not JSON/);
  });

  test("a network error, or no answer within the timeout, is a provider failure", async () => {
    const down = adapter([
      () => {
        throw new Error("ECONNRESET");
      },
      answer(204),
    ]);
    await assert.rejects(down.provider.fetchDay("JFK", "LAX", FIXTURE_DAY), (err: unknown) => err instanceof ProviderError && /ECONNRESET/.test(err.message));
    const sleeps: number[] = [];
    const silent = createAeroDataBoxProvider(
      { apiKey: API_KEY, host: "rapidapi" },
      {
        timeoutMs: 20,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        fetch: (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          }),
      },
    );
    await assert.rejects(silent.fetchDay("JFK", "LAX", FIXTURE_DAY), (err: unknown) => err instanceof ProviderError && /no answer within 0.02 s/.test(err.message));
    assert.deepEqual(sleeps, []);
  });
});

// ── Flights: cache ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** A provider double answering the day asked for (or failing), counting calls. */
function providerDouble(answer: (to: string) => RouteDaySchedule | Error): ScheduleProvider & { calls: number } {
  const double = {
    name: "generator" as const,
    calls: 0,
    async fetchDay(_from: string, to: string) {
      double.calls += 1;
      const out = answer(to);
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return double;
}

/** The generator's day from JFK, fetched at `ms`. */
const dayAt = (ms: number, to = "LAX") => generatedSchedule({ origin: "JFK", destination: to, date: FIXTURE_DAY }, new Date(ms).toISOString());

/** A cache over a memory store, a movable clock and a provider that answers the day at the clock (or fails on request). */
function cacheRig(options: { durable?: boolean; capacity?: number } = {}) {
  const state = { clock: FETCHED_MS, failing: false };
  const store = createMemoryRouteDayStore();
  const warnings: string[] = [];
  const provider = providerDouble((to) => (state.failing ? new ProviderError("the provider is away") : dayAt(state.clock, to)));
  const cache = new RouteDayCache({
    store: options.durable === false ? undefined : () => store,
    now: () => state.clock,
    capacity: options.capacity,
    warn: (message) => warnings.push(message),
  });
  return { state, store, warnings, provider, cache };
}

group("flights: cache", () => {
  test("a miss asks the provider and keeps the day in memory and in the store; a hit asks nobody", async () => {
    const { state, store, warnings, provider, cache } = cacheRig();
    const first = await cache.get(JFK_LAX, provider);
    assert.equal(first.cached, false);
    assert.equal(provider.calls, 1);
    assert.deepEqual(first.schedule, dayAt(FETCHED_MS));
    assert.deepEqual(await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "generator"), {
      route: "JFK-LAX",
      date: FIXTURE_DAY,
      provider: "generator",
      fetchedAt: FETCHED_AT,
      expiresAt: new Date(FETCHED_MS + ROUTE_DAY_TTL_MS).toISOString(),
      payload: first.schedule,
    });
    assert.equal(cache.size, 1);
    state.clock += 60_000;
    const second = await cache.get(JFK_LAX, provider);
    assert.equal(second.cached, true);
    assert.deepEqual(second.schedule, first.schedule);
    assert.equal(provider.calls, 1);
    // Another process over the same store: a hit from the durable layer.
    const other = new RouteDayCache({ store: () => store, now: () => state.clock, warn: (m) => warnings.push(m) });
    const third = await other.get(JFK_LAX, provider);
    assert.equal(third.cached, true);
    assert.deepEqual(third.schedule, first.schedule);
    assert.equal(provider.calls, 1);
    assert.equal(other.size, 1);
    assert.deepEqual(warnings, []);
  });

  test("a paid provider is asked at most budgetPerHour times an hour; past it a stale day stands in, else the request fails with reason budget", async () => {
    const { state, store, warnings } = cacheRig();
    const paid = { name: "aerodatabox" as const, calls: 0, fetchDay: async (_from: string, to: string) => { paid.calls += 1; return dayAt(state.clock, to); } };
    const cache = new RouteDayCache({ store: () => store, now: () => state.clock, warn: (m) => warnings.push(m), budgetPerHour: () => 2 });
    // A day fetched 25 hours ago: past its TTL, well inside the 7-day ceiling.
    const staleAt = state.clock - ROUTE_DAY_TTL_MS - 60 * 60 * 1000;
    await store.putRouteDay(recordOf("JFK-BOS", FIXTURE_DAY, "aerodatabox", dayAt(staleAt, "BOS"), staleAt));
    await cache.get(JFK_LAX, paid);
    await cache.get({ ...JFK_LAX, to: "SFO" }, paid);
    assert.equal(paid.calls, 2);
    await assert.rejects(cache.get({ ...JFK_LAX, to: "MIA" }, paid), (err: unknown) => err instanceof ProviderError && err.reason === "budget");
    const stale = await cache.get({ ...JFK_LAX, to: "BOS" }, paid);
    assert.equal(stale.cached, true);
    assert.equal(stale.schedule.destination, "BOS");
    assert.equal(paid.calls, 2);
    assert.ok(warnings.some((m) => m.includes("budget")));
    assert.equal((await cache.get(JFK_LAX, paid)).cached, true, "a fresh day keeps answering");
    // The hour rolls on and the provider may be asked again.
    state.clock += 60 * 60 * 1000 + 1;
    await cache.get({ ...JFK_LAX, to: "MIA" }, paid);
    assert.equal(paid.calls, 3);
    // The generator is never counted.
    const { provider: free, cache: freeCache } = cacheRig();
    for (const to of ["SFO", "BOS", "MIA"]) await freeCache.get({ ...JFK_LAX, to }, free);
    assert.equal(free.calls, 3);
  });

  test("the key is the route, the date and the provider", async () => {
    const { provider, cache } = cacheRig();
    await cache.get(JFK_LAX, provider);
    await cache.get({ ...JFK_LAX, to: "SFO" }, provider);
    await cache.get({ ...JFK_LAX, date: addDays(FIXTURE_DAY, 1) }, provider);
    await cache.get(JFK_LAX, { ...provider, name: "fixture" });
    assert.equal(provider.calls, 4);
    assert.equal((await cache.get(JFK_LAX, provider)).cached, true);
    assert.equal(provider.calls, 4);
  });

  test("after 24 hours the provider is asked again and the record overwritten", async () => {
    const { state, store, provider, cache } = cacheRig();
    await cache.get(JFK_LAX, provider);
    state.clock = FETCHED_MS + ROUTE_DAY_TTL_MS - 1000;
    assert.equal((await cache.get(JFK_LAX, provider)).cached, true, "just inside the TTL");
    state.clock = FETCHED_MS + ROUTE_DAY_TTL_MS + 1000;
    const refreshed = await cache.get(JFK_LAX, provider);
    assert.equal(refreshed.cached, false);
    assert.equal(provider.calls, 2);
    assert.equal(refreshed.schedule.fetchedAt, new Date(state.clock).toISOString());
    const stored = await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "generator");
    assert.equal(stored?.fetchedAt, refreshed.schedule.fetchedAt);
    assert.equal(stored?.expiresAt, new Date(state.clock + ROUTE_DAY_TTL_MS).toISOString());
    assert.equal(store.size, 1);
  });

  test("a stale day within 7 days stands in when the provider fails, from memory or from the store", async () => {
    const { state, store, warnings, provider, cache } = cacheRig();
    const first = await cache.get(JFK_LAX, provider);
    state.clock = FETCHED_MS + 2 * DAY_MS;
    state.failing = true;
    const stale = await cache.get(JFK_LAX, provider);
    assert.equal(stale.cached, true);
    assert.deepEqual(stale.schedule, first.schedule);
    assert.equal(provider.calls, 2, "the provider was asked first");
    assert.deepEqual(warnings, [`route-day cache: generator failed (the provider is away); JFK-LAX ${FIXTURE_DAY} served as fetched ${FETCHED_AT}`]);
    const other = new RouteDayCache({ store: () => store, now: () => state.clock, warn: (m) => warnings.push(m) });
    const fromStore = await other.get(JFK_LAX, provider);
    assert.equal(fromStore.cached, true);
    assert.deepEqual(fromStore.schedule, first.schedule);
    assert.equal(provider.calls, 3);
  });

  test("nothing older than 7 days is served, even when the provider fails; it is replaced once the provider answers", async () => {
    const { state, store, provider, cache } = cacheRig();
    await cache.get(JFK_LAX, provider);
    state.clock = FETCHED_MS + ROUTE_DAY_MAX_AGE_MS + 1000;
    state.failing = true;
    await assert.rejects(cache.get(JFK_LAX, provider), (err: unknown) => err instanceof ProviderError && err.message === "the provider is away");
    assert.equal(cache.size, 0, "the old day is gone from memory");
    const other = new RouteDayCache({ store: () => store, now: () => state.clock, warn: () => undefined });
    await assert.rejects(other.get(JFK_LAX, provider), ProviderError);
    state.failing = false;
    const fresh = await cache.get(JFK_LAX, provider);
    assert.equal(fresh.cached, false);
    assert.equal(fresh.schedule.fetchedAt, new Date(state.clock).toISOString());
    assert.equal((await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "generator"))?.fetchedAt, fresh.schedule.fetchedAt);
  });

  test("a storage failure is noted and the provider asked; the answer still comes", async () => {
    const warnings: string[] = [];
    const broken: RouteDayStore = {
      getRouteDay: async () => {
        throw new Error("db away");
      },
      putRouteDay: async () => {
        throw new Error("db away");
      },
    };
    const provider = providerDouble(() => dayAt(FETCHED_MS));
    const cache = new RouteDayCache({ store: () => broken, now: clockAt(FETCHED_MS), warn: (m) => warnings.push(m) });
    const result = await cache.get(JFK_LAX, provider);
    assert.equal(result.cached, false);
    assert.equal(provider.calls, 1);
    assert.deepEqual(warnings, ["route-day cache: read failed, asking the provider (db away)", "route-day cache: write failed (db away)"]);
    assert.equal((await cache.get(JFK_LAX, provider)).cached, true, "memory still answers");
    assert.equal(provider.calls, 1);
  });

  test("requests for one route-day in flight share a fetch", async () => {
    const { provider, cache } = cacheRig();
    const [a, b, c] = await Promise.all([cache.get(JFK_LAX, provider), cache.get(JFK_LAX, provider), cache.get({ ...JFK_LAX, to: "SFO" }, provider)]);
    assert.equal(provider.calls, 2);
    assert.equal(a.schedule, b.schedule);
    assert.equal(c.schedule.destination, "SFO");
  });

  test("memory keeps the most recently used route-days (256 of them); without storage it works alone", async () => {
    assert.equal(MEMORY_CAPACITY, 256);
    const { provider, cache } = cacheRig({ durable: false, capacity: 2 });
    const [a, b, c] = [JFK_LAX, { ...JFK_LAX, to: "SFO" }, { ...JFK_LAX, to: "BOS" }];
    await cache.get(a, provider);
    await cache.get(b, provider);
    await cache.get(a, provider); // a is the most recently used now
    await cache.get(c, provider); // so b goes
    assert.equal(provider.calls, 3);
    assert.equal(cache.size, 2);
    assert.equal((await cache.get(a, provider)).cached, true);
    assert.equal((await cache.get(c, provider)).cached, true);
    assert.equal((await cache.get(b, provider)).cached, false);
    assert.equal(provider.calls, 4);
  });
});

// ── Supabase row mapping: route days (pure) ─────────────────────────────────

group("supabase row mapping: route days", () => {
  test("routeDayToRow / rowToRouteDay round-trip; Postgres timestamps and a JSON-string payload come back as the record", () => {
    const record = recordOf("JFK-LAX", FIXTURE_DAY, "aerodatabox", fixtureDay(), FETCHED_MS);
    const row = routeDayToRow(record);
    assert.deepEqual(row, {
      route: "JFK-LAX",
      date: FIXTURE_DAY,
      provider: "aerodatabox",
      fetched_at: FETCHED_AT,
      expires_at: new Date(FETCHED_MS + ROUTE_DAY_TTL_MS).toISOString(),
      payload: fixtureDay(),
    });
    assert.deepEqual(rowToRouteDay(row), record);
    assert.deepEqual(rowToRouteDay({ ...row, fetched_at: "2026-11-04T12:00:00+00:00", expires_at: "2026-11-05T07:00:00-05:00", payload: JSON.stringify(row.payload) }), record);
    assert.throws(() => rowToRouteDay({ ...row, payload: null }), /payload/);
    assert.throws(() => rowToRouteDay({ ...row, route: 5 }), /route/);
    assert.throws(() => rowToRouteDay(null), /not an object/);
  });
});

// ── File store: route days ──────────────────────────────────────────────────

group("file store: route days", () => {
  test("keeps route-days in route_days.json next to the data file; anything fetched over 7 days ago is dropped on sight", async () => {
    const store = createFileStore(join(tempDir, "days", "responses.json"));
    assert.equal(store.routeDaysPath, join(tempDir, "days", ROUTE_DAYS_FILE));
    assert.equal(await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "generator"), null);
    const now = Date.now();
    const old = recordOf("JFK-SFO", FIXTURE_DAY, "generator", dayAt(now - ROUTE_DAY_MAX_AGE_MS - 60_000, "SFO"), now);
    const fresh = recordOf("JFK-LAX", FIXTURE_DAY, "generator", dayAt(now), now);
    await store.putRouteDay(old);
    assert.equal(await store.getRouteDay("JFK-SFO", FIXTURE_DAY, "generator"), null, "over the ceiling: dropped on sight");
    assert.deepEqual(Object.keys(JSON.parse(await readFile(store.routeDaysPath, "utf8"))), [], "and gone from the file");
    await store.putRouteDay(old);
    await store.putRouteDay(fresh);
    assert.deepEqual(await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "generator"), fresh);
    assert.equal(await store.getRouteDay("JFK-SFO", FIXTURE_DAY, "generator"), null, "dropped by the next write too");
    assert.equal(await store.getRouteDay("JFK-LAX", FIXTURE_DAY, "fixture"), null, "another provider is another key");
    const raw = JSON.parse(await readFile(store.routeDaysPath, "utf8"));
    assert.deepEqual(Object.keys(raw), [`JFK-LAX|${FIXTURE_DAY}|generator`]);
    assert.deepEqual(await store.list(), [], "the responses file is separate");
  });
});

// ── Routes ──────────────────────────────────────────────────────────────────

type App = typeof import("../src/app").app;
let app: App;
const ADMIN_KEY = "test-admin-key-123";
/** Lower than the default so the test stays quick; set through the environment like a host would. */
const RATE_LIMIT = 30;

async function post(body: string, headers: Record<string, string> = {}) {
  return app.request("/responses", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function json(res: Response): Promise<Loose> {
  return (await res.json()) as Loose;
}

group("routes", () => {
  test("GET /health reports file storage", async () => {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { ok: true, storage: "file" });
  });

  test("POST a valid record → 200 with storage file and no-store caching", async () => {
    const res = await post(JSON.stringify(fixture()));
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { ok: true, storage: "file" });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("POST as text/plain (sendBeacon) → 200", async () => {
    const res = await post(JSON.stringify({ ...fixture(), seq: 8 }), { "content-type": "text/plain" });
    assert.equal(res.status, 200);
  });

  test("POST garbage → 400 with a short error code", async () => {
    let res = await post("{not json");
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "invalid_json");
    res = await post("");
    assert.equal(res.status, 400);
    res = await post(JSON.stringify({ foo: 1 }));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "missing_session_id");
    res = await post(JSON.stringify([1, 2, 3]));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "not_an_object");
    res = await post(JSON.stringify({ ...fixture(), variant: "C" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), { ok: false, storage: "file", error: "invalid_variant" });
  });

  test("POST too large → 413 (declared Content-Length, and a streamed body with no Content-Length)", async () => {
    const declared = await post("{}", { "content-length": "200000" });
    assert.equal(declared.status, 413);
    assert.equal((await json(declared)).error, "too_large");
    const big = { ...fixture(), post: { ...fixture().post, stillScaredOf: "x".repeat(150_000) } };
    const actual = await post(JSON.stringify(big));
    assert.equal(actual.status, 413);
    assert.equal((await json(actual)).error, "too_large");
  });

  test("GET without a key → 401", async () => {
    let res = await app.request("/responses");
    assert.equal(res.status, 401);
    assert.deepEqual(await json(res), { ok: false, storage: "file", responses: [], error: "unauthorized" });
    res = await app.request("/responses?key=wrong");
    assert.equal(res.status, 401);
    res = await app.request("/responses", { headers: { "x-admin-key": "" } });
    assert.equal(res.status, 401);
  });

  test("GET with ?key= and with x-admin-key → 200 with the stored record", async () => {
    const byQuery = await app.request(`/responses?key=${ADMIN_KEY}`);
    assert.equal(byQuery.status, 200);
    const body = await json(byQuery);
    assert.equal(body.ok, true);
    assert.equal(body.storage, "file");
    assert.equal(body.responses.length, 1);
    assert.deepEqual(body.responses[0], { ...fixture(), seq: 8 });

    const byHeader = await app.request("/responses", { headers: { "x-admin-key": ADMIN_KEY } });
    assert.equal(byHeader.status, 200);
    assert.deepEqual(await json(byHeader), body);
  });

  test("a stale save through the API does not overwrite a newer one", async () => {
    const res = await post(JSON.stringify({ ...fixture(), seq: 2, step: "setup" }));
    assert.equal(res.status, 200);
    const body = await json(await app.request("/responses", { headers: { "x-admin-key": ADMIN_KEY } }));
    assert.equal(body.responses[0].seq, 8);
    assert.equal(body.responses[0].step, "debrief");
  });

  test("POST is rate limited per IP → 429 with Retry-After", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const allowed = await post("{not json", headers);
      assert.equal(allowed.status, 400, `request ${i + 1} is still allowed`);
    }
    const limited = await post(JSON.stringify(fixture()), headers);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await json(limited), { ok: false, storage: "file", error: "rate_limited" });
    const other = await post("{not json", { "x-forwarded-for": "198.51.100.7" });
    assert.equal(other.status, 400, "another IP is unaffected");
  });

});

// ── Routes: sign-ups ────────────────────────────────────────────────────────

/** A client address of its own, so these tests never share a rate-limit bucket with the ones above. */
const SIGNUP_IP = { "x-forwarded-for": "203.0.113.50" };

async function postSignup(body: string, headers: Record<string, string> = {}) {
  return app.request("/signups", {
    method: "POST",
    headers: { "content-type": "application/json", ...SIGNUP_IP, ...headers },
    body,
  });
}

group("routes: sign-ups", () => {
  test("POST a valid sign-up → 200, then GET lists it (parsed)", async () => {
    const res = await postSignup(JSON.stringify({ ...signupFixture(), id: SIGNUP_ID.toUpperCase(), email: " Sam@Example.com ", extra: 1 }));
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { ok: true, storage: "file" });
    assert.equal(res.headers.get("cache-control"), "no-store");

    const list = await app.request(`/signups?key=${ADMIN_KEY}`);
    assert.equal(list.status, 200);
    const body = await json(list);
    assert.equal(body.ok, true);
    assert.equal(body.storage, "file");
    assert.deepEqual(body.signups, [signupFixture()]);
    const byHeader = await app.request("/signups", { headers: { "x-admin-key": ADMIN_KEY } });
    assert.deepEqual(await json(byHeader), body);
  });

  test("POST as text/plain → 200; a repeat from the same email keeps the first createdAt", async () => {
    const repeat = { ...signupFixture(), id: session(31), createdAt: "2026-10-22T08:00:00.000Z", firstName: "Samuel", interview: false };
    const res = await postSignup(JSON.stringify(repeat), { "content-type": "text/plain" });
    assert.equal(res.status, 200);
    const body = await json(await app.request("/signups", { headers: { "x-admin-key": ADMIN_KEY } }));
    assert.equal(body.signups.length, 1);
    assert.deepEqual(body.signups[0], { ...repeat, createdAt: signupFixture().createdAt, interview: true }, "and the earlier interview opt-in");
  });

  test("POST invalid → 400 with a short error code, nothing stored", async () => {
    let res = await postSignup("{not json");
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "invalid_json");
    res = await postSignup(JSON.stringify([1]));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "invalid_body");
    res = await postSignup(JSON.stringify({ ...signupFixture(), email: "not an email" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), { ok: false, storage: "file", error: "invalid_email" });
    res = await postSignup(JSON.stringify({ ...signupFixture(), source: "newsletter" }));
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "invalid_source");
    const body = await json(await app.request("/signups", { headers: { "x-admin-key": ADMIN_KEY } }));
    assert.equal(body.signups.length, 1);
  });

  test("POST too large → 413 (declared Content-Length, and a streamed body)", async () => {
    const declared = await postSignup("{}", { "content-length": "20000" });
    assert.equal(declared.status, 413);
    assert.equal((await json(declared)).error, "too_large");
    const actual = await postSignup(JSON.stringify({ ...signupFixture(), context: "x".repeat(12_000) }));
    assert.equal(actual.status, 413);
    assert.equal((await json(actual)).error, "too_large");
  });

  test("GET without a key → 401", async () => {
    let res = await app.request("/signups");
    assert.equal(res.status, 401);
    assert.deepEqual(await json(res), { ok: false, storage: "file", signups: [], error: "unauthorized" });
    res = await app.request("/signups?key=wrong");
    assert.equal(res.status, 401);
  });

  test("the rate limit is shared with /responses", async () => {
    // 203.0.113.9 used up its minute in the /responses tests above.
    const limited = await postSignup(JSON.stringify(signupFixture()), { "x-forwarded-for": "203.0.113.9" });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await json(limited), { ok: false, storage: "file", error: "rate_limited" });
  });
});

// ── Routes: flights ─────────────────────────────────────────────────────────

/** A client address of its own, so these tests never share a rate-limit bucket with the ones above. */
const FLIGHTS_IP = { "x-forwarded-for": "203.0.113.77" };

group("routes: flights", () => {
  const today = toISODate(new Date());
  const day = addDays(today, 10);
  const dayUrl = `/flights/day?from=JFK&to=LAX&date=${day}`;

  test("GET /flights/day with the generator: the shared schedule, cacheable for ten minutes, cached on the second call, kept next to DATA_FILE", async () => {
    routeDayCache.clear();
    const res = await app.request(dayUrl, { headers: FLIGHTS_IP });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=600");
    const body = await json(res);
    assert.equal(body.ok, true);
    assert.equal(body.cached, false);
    assert.ok(Math.abs(Date.parse(body.schedule.fetchedAt) - Date.now()) < 60_000, "fetchedAt is the server clock");
    assert.deepEqual(body.schedule, generatedSchedule({ origin: "JFK", destination: "LAX", date: day }, body.schedule.fetchedAt));
    const again = await json(await app.request(dayUrl, { headers: FLIGHTS_IP }));
    assert.equal(again.cached, true);
    assert.deepEqual(again.schedule, body.schedule);
    const raw = JSON.parse(await readFile(join(tempDir, "routes", ROUTE_DAYS_FILE), "utf8"));
    assert.deepEqual(Object.keys(raw), [`JFK-LAX|${day}|generator`]);
    assert.deepEqual(raw[`JFK-LAX|${day}|generator`].payload, body.schedule);
  });

  test("a bad query → 400 with one code, never cacheable", async () => {
    const expect = async (query: string, error: string) => {
      const res = await app.request(`/flights/day${query}`, { headers: FLIGHTS_IP });
      assert.equal(res.status, 400, query);
      assert.deepEqual(await json(res), { ok: false, error });
      assert.equal(res.headers.get("cache-control"), "no-store");
    };
    await expect("", "invalid_from");
    await expect(`?from=jfk&to=LAX&date=${day}`, "invalid_from");
    await expect(`?from=JFK&to=ZZZ&date=${day}`, "unknown_to");
    await expect(`?from=JFK&to=JFK&date=${day}`, "same_airport");
    await expect("?from=JFK&to=LAX&date=2026-11", "invalid_date");
    await expect(`?from=JFK&to=LAX&date=${addDays(today, -2)}`, "date_out_of_range");
    await expect(`?from=JFK&to=LAX&date=${addDays(today, 332)}`, "date_out_of_range");
    const edge = await app.request(`/flights/day?from=JFK&to=LAX&date=${addDays(today, -1)}`, { headers: FLIGHTS_IP });
    assert.equal(edge.status, 200, "yesterday is still a day");
  });

  test("a provider that cannot answer → 502 provider_error, never cacheable", async () => {
    try {
      process.env.FLIGHT_PROVIDER = "fixture";
      const noFixture = [1, 2].map((n) => addDays(today, n)).find((d) => d !== FIXTURE_DAY) ?? "";
      let res = await app.request(`/flights/day?from=JFK&to=LAX&date=${noFixture}`, { headers: FLIGHTS_IP });
      assert.equal(res.status, 502);
      assert.deepEqual(await json(res), { ok: false, error: "provider_error" });
      assert.equal(res.headers.get("cache-control"), "no-store");
      process.env.FLIGHT_PROVIDER = "aerodatabox"; // and no AERODATABOX_API_KEY
      res = await app.request(dayUrl, { headers: FLIGHTS_IP });
      assert.equal(res.status, 502);
      assert.deepEqual(await json(res), { ok: false, error: "provider_error" });
    } finally {
      delete process.env.FLIGHT_PROVIDER;
    }
  });

  test("shares the per-IP rate limit → 429 with Retry-After", async () => {
    const headers = { "x-forwarded-for": "203.0.113.78" };
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const allowed = await app.request(dayUrl, { headers });
      assert.equal(allowed.status, 200, `request ${i + 1} is still allowed`);
    }
    const limited = await app.request(dayUrl, { headers });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal((await json(limited)).error, "rate_limited");
  });
});

// ── Routes: no storage ──────────────────────────────────────────────────────

group("routes: no storage", () => {
  test("without DATA_FILE storage is none → 503 not_configured", async () => {
    delete process.env.DATA_FILE;
    assert.deepEqual(await json(await app.request("/health")), { ok: true, storage: "none" });
    const save = await post(JSON.stringify(fixture()));
    assert.equal(save.status, 503);
    assert.deepEqual(await json(save), { ok: false, storage: "none", error: "not_configured" });
    const list = await app.request("/responses", { headers: { "x-admin-key": ADMIN_KEY } });
    assert.equal(list.status, 503);
    assert.deepEqual(await json(list), { ok: false, storage: "none", responses: [], error: "not_configured" });
    const signup = await postSignup(JSON.stringify(signupFixture()));
    assert.equal(signup.status, 503);
    assert.deepEqual(await json(signup), { ok: false, storage: "none", error: "not_configured" });
    const signups = await app.request("/signups", { headers: { "x-admin-key": ADMIN_KEY } });
    assert.equal(signups.status, 503);
    assert.deepEqual(await json(signups), { ok: false, storage: "none", signups: [], error: "not_configured" });
  });

  test("without storage GET /flights/day still answers, from memory alone", async () => {
    routeDayCache.clear();
    const url = `/flights/day?from=JFK&to=LAX&date=${addDays(toISODate(new Date()), 12)}`;
    const first = await json(await app.request(url, { headers: FLIGHTS_IP }));
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    const second = await json(await app.request(url, { headers: FLIGHTS_IP }));
    assert.equal(second.cached, true);
    assert.deepEqual(second.schedule, first.schedule);
  });
});

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  tempDir = await mkdtemp(join(tmpdir(), "preflight-backend-test-"));
  try {
    // Routes: configure the environment first, then import the app (it reads NODE_ENV at import time).
    process.env.NODE_ENV = "test";
    process.env.ADMIN_KEY = ADMIN_KEY;
    process.env.DATA_FILE = join(tempDir, "routes", "responses.json");
    process.env.RATE_LIMIT_PER_MINUTE = String(RATE_LIMIT);
    for (const name of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]) {
      delete process.env[name];
    }
    ({ app } = await import("../src/app"));

    const failed = await run();
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
