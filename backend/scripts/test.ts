/*
 * Backend tests. Run from the repo root with `npx tsx backend/scripts/test.ts`
 * or `npm run test -w backend`. Exits non-zero on failure.
 *
 * No test runner, just node:assert and a tiny harness, so it works anywhere
 * tsx does. Covers: parseSessionRecord (accept, reject, sanitize), the local
 * file store (upsert, stale writes, ordering, concurrency), the Supabase row
 * mapping (pure), and the HTTP routes through Hono's app.request() against a
 * temporary data file.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_EVENTS, MAX_TEXT_CHARS, parseSessionRecord } from "@preflight/shared/record";
import type { DashboardEvent, SectionId, SectionStats, SessionRecord } from "@preflight/shared/types";
import { createFileStore } from "../src/lib/store/file";
import { recordToRow, rowToRecord } from "../src/lib/store/supabase";

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
    },
    email: "participant@example.com",
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
    };
    assert.deepEqual(expectOk(minimal), minimal);
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

  test("without DATA_FILE storage is none → 503 not_configured", async () => {
    delete process.env.DATA_FILE;
    assert.deepEqual(await json(await app.request("/health")), { ok: true, storage: "none" });
    const save = await post(JSON.stringify(fixture()));
    assert.equal(save.status, 503);
    assert.deepEqual(await json(save), { ok: false, storage: "none", error: "not_configured" });
    const list = await app.request("/responses", { headers: { "x-admin-key": ADMIN_KEY } });
    assert.equal(list.status, 503);
    assert.deepEqual(await json(list), { ok: false, storage: "none", responses: [], error: "not_configured" });
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
