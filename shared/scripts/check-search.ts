/*
 * Checks for version C's search (shared/src/search.ts). Run with `npm run test -w shared`.
 * Starter checks; the generator extends them (see docs/VERSION_C.md, "Data contract").
 */
import { dayOverview, findOption, optionKey, searchFlights } from "../src/search";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

const QUERIES = [
  { origin: "JFK", destination: "LAX", date: "2026-11-26" },
  { origin: "SFO", destination: "NRT", date: "2027-01-12" },
  { origin: "LGA", destination: "BOS", date: "2026-12-03" },
  { origin: "LHR", destination: "JFK", date: "2027-06-20" },
];

for (const q of QUERIES) {
  const tag = `${q.origin}-${q.destination} ${q.date}`;
  const a = searchFlights(q);
  const b = searchFlights({ ...q });
  check(a.options.length >= 2, `${tag}: at least 2 options`);
  check(JSON.stringify(a) === JSON.stringify(b), `${tag}: deterministic`);
  const keys = a.options.map((o) => o.key);
  check(new Set(keys).size === keys.length, `${tag}: unique keys`);
  check(new Set(a.options.map((o) => o.flight.id)).size === keys.length, `${tag}: unique flight ids`);
  for (const o of a.options) {
    check(o.key === optionKey(o.flight), `${tag}: key matches flight number`);
    check(Number.isInteger(o.fareUsd) && o.fareUsd >= 39, `${tag}: fare is a whole number ≥ 39`);
    check(o.flight.alternatives.length === 0, `${tag}: no alternatives on C flights`);
    check(findOption(q, o.key) === o, `${tag}: findOption round-trip`);
  }
  const sorted = [...a.options].sort((x, y) => x.flight.departTime.localeCompare(y.flight.departTime));
  check(sorted.every((o, i) => o === a.options[i]), `${tag}: options by departure time`);
  const day = dayOverview(q, q.date);
  check(day.count === a.options.length, `${tag}: overview count`);
}

if (failures > 0) {
  console.error(`\n${failures} search check(s) failed.`);
  process.exit(1);
}
console.log("Search checks passed.");
