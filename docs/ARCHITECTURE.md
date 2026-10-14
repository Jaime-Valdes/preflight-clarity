# Pre-Flight Clarity — architecture & build contract

Research prototype for a student startup (Allen, Arshad, Jaime, Krish) building
software for people with flight anxiety. The full brief is in
[`PROTOTYPE_BRIEF.md`](../PROTOTYPE_BRIEF.md). In one sentence: show anxious flyers
a calm, data-rich (fake but credible) dashboard about an upcoming flight and
**honestly** measure whether their anxiety, sense of control and sense of
predictability change.

> Risky assumption under test: more predictability and control before the
> flight (through rich, specific data) lowers stress and anxiety. "More data
> doesn't help" is a valid outcome. The prototype must never nudge.

## Monorepo

npm workspaces, three packages:

| Package | Folder | What | Runs / deploys |
| --- | --- | --- | --- |
| `@preflight/frontend` | `frontend/` | Next.js 16.4 app: participant flow, dashboard, team results page | `npm run dev -w frontend` → :3000 · Vercel (root dir `frontend`) |
| `@preflight/backend` | `backend/` | Hono 4 API on Node: receives session records, stores them (Supabase / local file), serves them to the results page | `npm run dev -w backend` → :8787 · Railway or any Node host (root dir empty, built from the repo root: `npm run build -w backend` / `npm run start:api`; the shared workspace is not on npm) |
| `@preflight/shared` | `shared/` | Plain TypeScript used by both: types, section registry, date helpers, forecast helpers, the fake-flight generator, record validation, stats, CSV | no build step; imported as `@preflight/shared/<module>` |

Import conventions:
- From `frontend/` or `backend/`: `import type { Flight } from "@preflight/shared/types"`, `import { generateFlight } from "@preflight/shared/fakeFlight"` (the package's `exports` map `./*` → `src/*.ts`).
- Inside `shared/src/`: relative imports only (`./types`), never `@preflight/shared/*` and never anything from the frontend or backend. Shared code must be pure: no React, no DOM, no Node-only APIs (Node globals are OK in `shared/scripts/`).
- Inside `frontend/`: `@/` is the frontend root (`@/lib/theme`, `@/components/ui/Card`).
- Dependencies are hoisted to the root `node_modules/`; `node_modules/next/dist/docs/` is the version-matched Next.js documentation.

Frontend ↔ backend: the browser calls `/api/<path>` on the web app, which `frontend/next.config.ts`
rewrites to `${API_URL}/<path>` on the backend (same-origin, so no CORS and `sendBeacon` works).
Server code in the frontend (the results page) calls `${process.env.API_URL}` directly and forwards the
admin key in an `x-admin-key` header. When `API_URL` is unset the app runs with no backend: sessions
stay in the participant's browser (`localStorage`) and the results page shows that browser's sessions.

## Stack

- **Next.js 16.4 (App Router, Turbopack) + React 19.3 + TypeScript**. Cache Components and Partial Prefetching are on.
- **Tailwind CSS 4.3** via `@tailwindcss/turbopack` (no `tailwind.config.*`; tokens live in `frontend/app/globals.css` `@theme`).
- **Recharts 3.10** for charts. **lucide-react 1.56** for icons (`import { Plane } from "lucide-react"`).
- **Hono 4** + `@hono/node-server` for the API; **`@supabase/supabase-js` 2.117** (backend only); `tsup` bundles the backend for production.
- No auth, no real flight APIs.

## Next.js 16.4 rules — this is NOT the Next.js you know

Bundled, version-matched docs: `node_modules/next/dist/docs/` (repo root). Key rules for `frontend/`:

1. **No clock or randomness during render** — in any component, server or client. `Date.now()`, argless `new Date()`, `Math.random()` and `crypto.randomUUID()` during render fail the prerender. Call them in `useEffect`, event handlers or on the server at request time. `performance.now()` is fine. Pass "today" into pure helpers (see `shared/src/dates.ts`).
2. **Request-time server reads go inside `<Suspense>`.** A server component that awaits `searchParams`, calls `cookies()`/`headers()`/`connection()`, or does uncached IO (fetching the backend) must render inside a `<Suspense fallback={…}>` boundary. Pattern:
   ```tsx
   export default function Page({ searchParams }: PageProps<"/results">) {
     return <Suspense fallback={<Skeleton />}><Results searchParams={searchParams} /></Suspense>;
   }
   async function Results({ searchParams }: { searchParams: PageProps<"/results">["searchParams"] }) {
     const { key } = await searchParams; …
   }
   ```
3. **No route segment config exports** (`dynamic`, `revalidate`, `fetchCache`, `runtime = "edge"`). They're incompatible with Cache Components.
4. `params`/`searchParams` are **Promises**. Global helper types `PageProps<"/route">` and `LayoutProps<"/">` come from `npx next typegen` (run by `npm run typecheck -w frontend`).
5. Client components that need the query string use `useQueryParam(name)` from `frontend/lib/hooks.ts` (avoids `useSearchParams` + Suspense).
6. React 19: `inert` is a boolean prop; refs are regular props (no `forwardRef`).

### Lint enforces the React Compiler rules

`npx eslint` fails on: `setState` called synchronously inside an effect (`react-hooks/set-state-in-effect`),
impure calls such as `Date.now()`/`Math.random()` in a component body (`react-hooks/purity`), and reading or
writing `ref.current` during render (`react-hooks/refs`). Sanctioned patterns:

- **Client-only values** (today's date, query params): `useTodayISO()`, `useQueryParam(name)`, `useHydrated()` from `frontend/lib/hooks.ts` (built on `useSyncExternalStore`; they return null/false during server render and hydration).
- **Client-only initialization** (random IDs, reading sessionStorage once, `new DashboardTracker(…)`): render the component only when `useHydrated()` is true, then initialize with a lazy initializer: `const [x] = useState(() => …)`. Lazy initializers pass lint, but must never run during server render.
- **Updates from the outside world** (visibility, scroll, timers, storage events): call `setState`/`dispatch` inside the subscription callback, never directly in the effect body.
- **Derived values**: compute during render (or `useMemo`) instead of syncing them into state with an effect.

## Routes and endpoints

Web app (`frontend/`):

| Route | What |
| --- | --- |
| `/` | Participant flow — one client state machine: welcome → pre-survey → flight setup → dashboard → post-survey → debrief. `?v=A` / `?v=B` force a variant; `?test=1` marks a team test session. |
| `/preview?origin=JFK&destination=LAX&date=2026-11-26&v=A` | Team demo of the dashboard alone. No surveys, saves nothing. |
| `/results?key=<ADMIN_KEY>` | Results: table, CSV export, pre-vs-post averages (overall and by variant), anxiety dropped/same/rose, calming vs anxiety-inducing section counts. |
| `/api/*` | Proxy to the backend (see above). The frontend has **no** route handlers of its own. |
| `/opengraph-image`, `/icon.svg` | Link-sharing image and favicon. |

API (`backend/`, JSON everywhere, `Cache-Control: no-store`):

| Endpoint | What |
| --- | --- |
| `GET /health` | `{ ok: true, storage: "supabase" \| "file" \| "none" }` |
| `POST /responses` | Upsert one `SessionRecord` by `sessionId` (body: JSON as `application/json` or `text/plain`; ≤ 100 KB). `200 {ok:true, storage}`; `400` invalid; `413` too large; `503 {error:"not_configured"}` when storage is `"none"`; `500 {error:"db_error"}`; `429 {error:"rate_limited"}` with `Retry-After: 60` (per IP, `RATE_LIMIT_PER_MINUTE`, default 1000). |
| `GET /responses` | All records newest first. Needs `x-admin-key: <ADMIN_KEY>` or `?key=`; `401` otherwise. `503` when storage is `"none"`. |

Storage adapter is chosen from the environment: Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) are set; otherwise a local JSON file when `DATA_FILE` is set (dev only — the API logs a warning); otherwise `"none"`.
`CORS_ORIGIN` sets the allowed origin for direct browser calls (default `*`; unneeded behind the `/api/*` rewrite).

## Folder map and ownership

Foundation files (written first; treat as **read-only** — if you need a change, say so in your report instead of editing):

| File | What |
| --- | --- |
| `shared/src/types.ts` | Every shared type: `Flight`, `SessionRecord`, `DashboardMetrics`, survey types, API responses… |
| `shared/src/sections.ts` | Section registry, `VARIANT_SECTIONS`, `PART_LABELS`, `partsForVariant()`, `isDashboardPart()` |
| `shared/src/dates.ts` | Pure date/time helpers (`daysUntil`, `daysBetween`, `formatTime12`, `formatDuration`, `formatOffset`, `countdownLabel`…) |
| `shared/src/forecast.ts` | `getForecastStatus(daysUntil, history)`, `summarizeFlight(flight, daysUntil)` |
| `frontend/lib/tracking.ts` | `DashboardTracker` class + `TrackerContext` / `useTracker()` |
| `frontend/lib/theme.ts` | Tones, `INTENSITY` colours, `PHASE_LABEL`, `SEAT_ZONE`, `CHART` styling, raw `COLORS` |
| `frontend/lib/hooks.ts` | `useHydrated()`, `useTodayISO()`, `useQueryParam()` — client-only values, lint-safe |
| `frontend/lib/cn.ts` | `cn(...classes)` |
| `frontend/components/ui/{Card,SectionCard,Pill,Stat,Button,Screen}.tsx` | UI primitives |
| `frontend/app/globals.css`, `frontend/app/layout.tsx` | Tokens, font (Manrope), metadata, viewport |
| `frontend/next.config.ts`, all `package.json` / `tsconfig.json` / `eslint.config.mjs` | Build config — never edit; don't add packages |
| `backend/src/{index,env,app}.ts`, `backend/src/lib/admin.ts` | Server bootstrap, Hono app, admin-key check (done) |

Owned files (each module's exported names/signatures are fixed by the stub that was in place; the owner replaces the stub):

| Owner | Files |
| --- | --- |
| Generator | `shared/src/random.ts`, `shared/src/airports.ts`, `shared/src/airlines.ts`, `shared/src/aircraft.ts`, `shared/src/names.ts`, `shared/src/fakeFlight.ts`, `shared/scripts/check-fake-flight.ts` |
| Dashboard core | `frontend/components/dashboard/Dashboard.tsx`, `DashboardHeader.tsx`, `SummaryCard.tsx`, `TurbulenceSection.tsx`, `PreviewClient.tsx`, `frontend/app/preview/page.tsx` (+ any `frontend/components/dashboard/turbulence/*`) |
| Sections: trust | `frontend/components/dashboard/PilotSection.tsx`, `AircraftSection.tsx`, `AirlineSection.tsx` |
| Sections: environment | `frontend/components/dashboard/WeatherSection.tsx`, `SoundsSection.tsx`, `AlertsSection.tsx` |
| Sections: control | `frontend/components/dashboard/SeatSection.tsx`, `CompareSection.tsx` |
| Study flow | `frontend/app/page.tsx`, `frontend/components/flow/*`, `frontend/lib/session.ts`, `frontend/lib/storage.ts` |
| Backend | `backend/src/routes/responses.ts`, `backend/src/lib/db.ts`, `backend/src/lib/store/*`, `shared/src/record.ts`, `backend/supabase/schema.sql`, `backend/scripts/test.ts` |
| Results | `frontend/app/results/*`, `frontend/components/results/*`, `frontend/lib/api.server.ts`, `shared/src/stats.ts`, `shared/src/csv.ts` |
| Polish | `frontend/app/opengraph-image.tsx`, `frontend/app/icon.svg`, `frontend/app/apple-icon.tsx`, `frontend/app/error.tsx`, `frontend/app/not-found.tsx`, `README.md` |

## Module contracts

```ts
// shared/src/airports.ts (generator)
export const AIRPORTS: readonly Airport[];
export const POPULAR_AIRPORT_CODES: readonly string[];
export function getAirport(code: string): Airport | undefined;
export function searchAirports(query: string, limit?: number): Airport[];   // empty query → popular
export function resolveAirport(value: string): Airport;                      // never throws; free text → synthetic (known:false)

// shared/src/fakeFlight.ts (generator)
export function normalizeInput(input: FlightInput): FlightInput;
export function generateFlight(input: FlightInput): Flight;                  // deterministic

// shared/src/record.ts (backend)
export type ParseResult = { ok: true; record: SessionRecord } | { ok: false; error: string };
export function parseSessionRecord(input: unknown): ParseResult;            // validates + sanitizes untrusted JSON

// backend/src/lib/db.ts (backend) — server only
export function storageKind(): StorageKind;                                  // "supabase" | "file" | "none"
export function upsertResponse(record: SessionRecord): Promise<void>;        // stale (lower seq) writes ignored
export function listResponses(): Promise<SessionRecord[]>;                   // newest first

// backend/src/lib/admin.ts (done)
export function isAdminKey(key: string | null | undefined): boolean;

// frontend/components/dashboard/<Name>Section.tsx (section agents) — 9 files
export function TurbulenceSection(props: SectionProps): JSX.Element;         // section BODY only
export function turbulenceTeaser(flight: Flight, ctx: SectionContext): string; // one calm line for the collapsed header
// …same pattern: PilotSection/pilotTeaser, AircraftSection/aircraftTeaser, AirlineSection/airlineTeaser,
// WeatherSection/weatherTeaser, SeatSection/seatTeaser, SoundsSection/soundsTeaser,
// CompareSection/compareTeaser, AlertsSection/alertsTeaser

// frontend/components/dashboard/Dashboard.tsx (dashboard core)
export interface DashboardProps {
  flight: Flight; variant: Variant;
  initialMetrics?: DashboardMetrics | null;            // resume after reload
  onCheckpoint?: (m: DashboardMetrics) => void;        // page hidden + every ~20 s
  onDone: (m: DashboardMetrics) => void;               // "I'm done exploring"
}
export function Dashboard(props: DashboardProps): JSX.Element;

// frontend/lib/storage.ts (study flow) — client only
export function saveSession(record: SessionRecord, opts?: { beacon?: boolean }): Promise<"remote" | "local">; // never throws
export function loadLocalResponses(): SessionRecord[];  // newest first
```

**Sections and tracking.** `Dashboard` owns each section's open state, wraps each body in
`<SectionCard>` and reports expand/collapse via `tracker.setSectionOpen(id, open)`. Section
bodies log extra interactions with `useTracker()?.event(type, sectionId, detail)`, e.g.
`event("seat_selected", "seat", "14C")`. The alerts toggle calls `useTracker()?.alertToggled(on)`.
Every section body must render without crashing for any generated flight (short-haul
narrow-body through 15-hour wide-body, any date).

Tracker guarantees worth knowing when analysing `events`: the log is capped at 300 entries, but
lifecycle events (`section_open/close`, `page_hidden/visible`, `alert_toggle`, `dashboard_resumed/done`,
and in variant A `flight_added/switched/shown`, `compare_open/close`, `whatif_opened/close`)
evict the oldest detail event rather than being dropped, so the timeline always has its shape. On
resume after a reload `tracker.openSections()` returns the sections that were open at the last
checkpoint (rebuilt from the log, no counters touched); `Dashboard` seeds its open set from it.
In variant A a section that only comes into or out of view because the participant switched flights
is logged with detail `"switch"` and is not an open, so `count(section_open without detail "switch")
== stats.opens` (in variant B no event has that detail). Section `openMs` pauses while the compare
view or the what-if sheet covers the dashboard (see `docs/EXPLORATION.md`). `maxScrollPct` is
re-based by the dashboard right before every checkpoint (share of the page as last laid out); a
restored value is only a floor.

**Headings and focus.** Each screen has exactly one `<h1>` (sr-only on the dashboard) that
`StudyFlow` focuses on screen change; `<SectionCard>` titles are `<h2>`, `BlockLabel` is `<h3>`.
The focus ring is `breeze-500` (3.8:1 on white): use `focus:ring-breeze-500` on inputs, never `breeze-400`.

## Design system

Mood: an aviation app crossed with a wellness app. Calm, premium, soft colours, generous whitespace.

- **Colours** (Tailwind classes from `frontend/app/globals.css`): `canvas` (app background), `surface` (cards), `line`/`line-strong` (borders), `ink-900/700/500/400/300` (text), `night-*` (deep navy: header, primary buttons), `calm-*` (sea-glass teal: smooth/positive), `breeze-*` (sky blue: info/light bumps), `dusk-*` (lavender: people/wellness), `sand-*` (soft sand: moderate bumps, gentle caution).
- **Never** use red, rose, orange, or Tailwind's default amber/yellow, and nothing that reads as a warning siren. Moderate turbulence uses `sand`. No error-red even for validation: use `sand` or `ink-500` hints.
- **Type**: Manrope. Titles `font-bold`, body `text-[15px]`/`text-sm` `text-ink-700`, captions `text-xs text-ink-500`. Use `tabular-nums` for numbers. Sentence case everywhere.
- **Shape**: cards `rounded-3xl` + `shadow-soft` + `ring-1 ring-line/80` (use `<Card>`); inner tiles `rounded-2xl`; pills `rounded-full` (use `<Pill tone>`). Spacing: 16–20px page gutters, `gap-3`/`gap-4` stacks.
- **Mobile first**: design at 390px wide; everything must work from 340px to desktop (the column centres at max 440px). Touch targets ≥ 44px. No horizontal scrolling of the page (a seat map or chart may scroll inside its own container).
- **Icons**: lucide-react, `size-4`/`size-5`, `strokeWidth` default. Decorative icons get `aria-hidden`.
- **Motion**: subtle (`transition-colors`, `animate-fade-up`), respects reduced motion (handled globally).
- **Copy**: calm, plain language, short sentences. No alarming words ("danger", "warning", "severe", "crash", "emergency", "risk"), no crash statistics, no exclamation marks in data. Don't lecture that flying is safe — these participants already know that (insight #1). Describe what will happen and why it's normal.

## Research-integrity rules (apply everywhere)

- **Neutral measurement**: survey wording is neutral and identical pre/post. Rating sliders start **unset** (no default thumb) and must be touched before continuing. Never show the pre-survey answers during the post-survey.
- **No nudging**: never say or imply the dashboard will reduce anxiety. No praise for answers, no "great!", no progress rewards tied to answers. Multi-selects include an explicit "None" / "Nothing" option with equal visual weight.
- **Honest data framing**: the consent and debrief screens say all data is illustrative; the dashboard carries a small, quiet "Prototype · illustrative data" footer.
- **Every session is saved** progressively (upsert by `sessionId` with an increasing `seq`): after the pre-survey, flight setup, dashboard (plus checkpoints and a `sendBeacon` on page hide), post-survey and debrief.

## Data model

One `SessionRecord` per session (see `shared/src/types.ts`). Supabase table `responses` keeps flat columns
for the headline numbers plus the full record as `jsonb` (`backend/supabase/schema.sql`). A trigger
ignores stale writes (lower `seq`).

## Verifying your work during the build

- Both dev servers are **already running**: web at http://localhost:3000 (Turbopack hot-reloads `frontend/` and `shared/` edits in the browser bundle; server-rendered output of `shared/` modules can stay stale until `next dev` restarts, which shows up as a hydration mismatch — restart it if you see one) and the API at http://localhost:8787 (`tsx watch` restarts on `backend/` and `shared/` edits; the web app proxies `/api/*` to it). Do **not** start other servers and do **not** run `next build` or `tsup`.
- Typecheck a package: `npx tsc --noEmit -p frontend` (or `-p shared`, `-p backend`), then filter to your files, e.g. `… 2>&1 | grep -E "^(frontend/components/flow|frontend/lib/session)"`. Errors in other people's files are expected while they work. (Frontend typecheck needs `npx next typegen` to have run once — it has.)
- Lint your files from the repo root: `npx eslint <paths>`.
- Screenshot in a phone viewport: `node frontend/scripts/shot.mjs <url> <out.png> [--full] [--desktop] [--click="text=Your pilots"]… [--storage=<file.json>]` and view the PNG with the Read tool. Save screenshots in the scratch directory given to you, never in the repo.
- Run shared scripts with `npx tsx shared/scripts/<file>.ts`; run one-off TypeScript the same way from your scratch dir (import repo modules by absolute path, or `@preflight/shared/*` works from anywhere under the repo).
- You may create a throwaway harness page at `frontend/app/dev/<your-agent-name>/page.tsx` to render your components in isolation. **Delete it before you finish.**
- Don't install packages and don't edit any `package.json`, `tsconfig.json`, `eslint.config.mjs` or `next.config.ts`.
