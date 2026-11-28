/*
 * Which months the route-history workflow (.github/workflows/route-history.yml) processes. Run from the repo root:
 *
 *   npx tsx backend/scripts/route-history/months.ts [--months YYYY-MM | YYYY-MM..YYYY-MM] [--today YYYY-MM-DD]
 *
 * Without --months: the last complete month (UTC), unless backend/route-history/months already has
 * it. With --months: exactly those months, even ones already there (to rebuild them), at most 24
 * and only complete ones. Prints the list; inside GitHub Actions also writes `months` (a JSON
 * array) and `any` (true | false) to $GITHUB_OUTPUT.
 */
import { appendFile, readdir } from "node:fs/promises";

const MONTHS_DIR = "backend/route-history/months";
const MAX_MONTHS = 24;

const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const toIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

export function planMonths(spec: string, today: string, have: ReadonlySet<string>): string[] {
  const lastComplete = toIndex(today.slice(0, 7)) - 1;
  if (!spec.trim()) {
    const m = fromIndex(lastComplete);
    return have.has(m) ? [] : [m];
  }
  const [from, to = from] = spec.trim().split("..").map((s) => s.trim());
  if (!isMonth(from) || !isMonth(to)) throw new Error(`--months ${spec}: expected YYYY-MM or YYYY-MM..YYYY-MM`);
  const a = toIndex(from);
  const b = toIndex(to);
  if (b < a) throw new Error(`--months ${spec}: the range runs backwards`);
  if (b > lastComplete) throw new Error(`--months ${spec}: ${fromIndex(b)} is not over yet (the last complete month is ${fromIndex(lastComplete)})`);
  if (b - a + 1 > MAX_MONTHS) throw new Error(`--months ${spec}: at most ${MAX_MONTHS} months a run`);
  return Array.from({ length: b - a + 1 }, (_, k) => fromIndex(a + k));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let spec = "";
  let today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--months") spec = argv[++i] ?? "";
    else if (argv[i] === "--today") today = argv[++i] ?? today;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  let files: string[] = [];
  try {
    files = await readdir(MONTHS_DIR);
  } catch {
    // none yet
  }
  const have = new Set(files.filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)));
  const months = planMonths(spec, today, have);
  console.log(months.length ? `months: ${months.join(", ")}` : "nothing to do: the last complete month is already in the table");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `months=${JSON.stringify(months)}\nany=${months.length > 0}\n`);
}

if (process.argv[1] && /months\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
