/*
 * Compares two on-time tables (the committed one and a fresh precompute) and prints a Markdown
 * summary: the pull-request body of the monthly refresh (.github/workflows/bts-refresh.yml;
 * docs/REAL_DATA.md, "Status: airline on-time from BTS"). Run from the repo root:
 *
 *   npx tsx backend/scripts/bts-summary.ts --old <old table.json> --new <new table.json>
 */
import { readFile, stat } from "node:fs/promises";
import { onTimePeriod, type OnTimeCell, type OnTimeTable } from "@preflight/shared/onTime";

function parseArgs(argv: string[]): { old: string; next: string } {
  let old = "";
  let next = "";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--old") old = argv[++i] ?? "";
    else if (a === "--new") next = argv[++i] ?? "";
    else throw new Error(`unknown argument ${a}`);
  }
  if (!old || !next) throw new Error("usage: bts-summary.ts --old <table.json> --new <table.json>");
  return { old, next };
}

const count = (n: number) => n.toLocaleString("en-US");
const cell = (c: OnTimeCell | undefined) => (c ? `${c[0].toFixed(1)}% (${count(c[1])})` : "—");

function change(a: OnTimeCell | undefined, b: OnTimeCell | undefined): string {
  if (!a && !b) return "";
  if (!a) return "new";
  if (!b) return "left out";
  const d = Math.round((b[0] - a[0]) * 10) / 10;
  return d === 0 ? "±0.0" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;
}

function routeFigures(t: OnTimeTable): number {
  return Object.values(t.routes).reduce((n, r) => n + Object.keys(r).length, 0);
}

async function main(): Promise<void> {
  const { old, next } = parseArgs(process.argv.slice(2));
  const a = JSON.parse(await readFile(old, "utf8")) as OnTimeTable;
  const b = JSON.parse(await readFile(next, "utf8")) as OnTimeTable;
  const [sizeA, sizeB] = [(await stat(old)).size, (await stat(next)).size];
  const codes = [...new Set([...Object.keys(a.carriers), ...Object.keys(b.carriers)])].sort();
  const periodA = onTimePeriod(a.from, a.to);
  const periodB = onTimePeriod(b.from, b.to);

  const lines = [
    `Refreshes version D's airline on-time table (\`backend/src/lib/onTime/bts-ontime.json\`) from the US DOT's monthly files (BTS TranStats, Reporting Carrier On-Time Performance).`,
    "",
    `- **Period**: ${periodA} → **${periodB}** (\`${a.from}\`–\`${a.to}\` → \`${b.from}\`–\`${b.to}\`). D's credit line will read "On-time: US DOT, BTS · ${periodB}".`,
    `- **Industry figure** (every reporting carrier): ${cell(a.industry)} → **${cell(b.industry)}** (${change(a.industry, b.industry)} points; D shows it rounded, ${Math.round(a.industry[0])}% → ${Math.round(b.industry[0])}%).`,
    `- **Routes**: ${count(Object.keys(a.routes).length)} → **${count(Object.keys(b.routes).length)}** with ${count(routeFigures(a))} → ${count(routeFigures(b))} carrier-route figures (≥ ${b.minRouteFlights} flights each).`,
    `- **Table size**: ${count(sizeA)} → ${count(sizeB)} bytes.`,
    "",
    "Each carrier's network figure (on-time share, scheduled flights):",
    "",
    "| Carrier | Before | After | Change |",
    "| --- | ---: | ---: | ---: |",
    ...codes.map((c) => `| ${c} | ${cell(a.carriers[c])} | ${cell(b.carriers[c])} | ${change(a.carriers[c], b.carriers[c])} |`),
    "",
    "\"Left out\" means the carrier did not report every month of the new period (its flights still count in the industry figure; D shows \"not available\"); \"new\" means it now reports every month.",
    "",
    "Checked in the workflow before this was opened: the precompute's own checks (twelve consecutive months, none repeated), `npm run test -w backend` (the bundled-table test among them) and `shared/scripts/check-on-time.ts`.",
    "",
    "Still by hand, if wanted: the example figures and the period in `docs/REAL_DATA.md` (\"Status: airline on-time from BTS\") describe the previous table.",
    "",
    "> **Merging this pull request deploys to production** (Vercel builds `main`). The live study's version D will show the new figures as soon as the deploy finishes; check the Vercel preview of this branch first.",
  ];
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
