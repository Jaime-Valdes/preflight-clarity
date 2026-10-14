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

## Stack

- **Next.js 16.4 (App Router, Turbopack) + React 19.3 + TypeScript**. Cache Components and Partial Prefetching are on.
- **Tailwind CSS 4.3** via `@tailwindcss/turbopack` (no `tailwind.config.*`; tokens live in `app/globals.css` `@theme`).
- **Recharts 3.10** for charts. **lucide-react 1.56** for icons (`import { Plane } from "lucide-react"`).
- **Supabase** (`@supabase/supabase-js` 2.117) via a server API route; `localStorage` fallback when no database is configured.
- Deployed on **Vercel**. No auth, no real flight APIs.

## Next.js 16.4 rules — this is NOT the Next.js you know

Bundled, version-matched docs: `node_modules/next/dist/docs/`. Key rules for this repo:

1. **No clock or randomness during render** — in any component, server or client. `Date.now()`, argless `new Date()`, `Math.random()` and `crypto.randomUUID()` during render fail the prerender. Call them in `useEffect`, event handlers or route handlers. `performance.now()` is fine. Pass "today" into pure helpers (see `lib/dates.ts`).
2. **Request-time server reads go inside `<Suspense>`.** A server component that awaits `searchParams`, calls `cookies()`/`headers()`/`connection()`, or does uncached IO (Supabase) must render inside a `<Suspense fallback={…}>` boundary. Pattern:
   ```tsx
   export default function Page({ searchParams }: PageProps<"/results">) {
     return <Suspense fallback={<Skeleton />}><Results searchParams={searchParams} /></Suspense>;
   }
   async function Results({ searchParams }: { searchParams: PageProps<"/results">["searchParams"] }) {
     const { key } = await searchParams; …
   }
   ```
3. **No route segment config exports** (`dynamic`, `revalidate`, `fetchCache`, `runtime = "edge"`). They're incompatible with Cache Components. Route handlers that read the request are dynamic automatically.
4. `params`/`searchParams` are **Promises**. Global helper types `PageProps<"/route">`, `LayoutProps<"/">` and `RouteContext<"/api/…">` come from `npx next typegen` (already generated; re-run it if `tsc` can't find them).
5. Client components that need the query string use `useQueryParam(name)` from `lib/hooks.ts` (avoids `useSearchParams` + Suspense).
6. React 19: `inert` is a boolean prop; refs are regular props (no `forwardRef`).

### Lint enforces the React Compiler rules

`npx eslint` fails on: `setState` called synchronously inside an effect (`react-hooks/set-state-in-effect`),
impure calls such as `Date.now()`/`Math.random()` in a component body (`react-hooks/purity`), and reading or
writing `ref.current` during render (`react-hooks/refs`). Sanctioned patterns:

- **Client-only values** (today's date, query params): `useTodayISO()`, `useQueryParam(name)`, `useHydrated()` from `lib/hooks.ts` (built on `useSyncExternalStore`; they return null/false during server render and hydration).
- **Client-only initialization** (random IDs, reading sessionStorage once, `new DashboardTracker(…)`): render the component only when `useHydrated()` is true, then initialize with a lazy initializer: `const [x] = useState(() => …)`. Lazy initializers pass lint, but must never run during server render.
- **Updates from the outside world** (visibility, scroll, timers, storage events): call `setState`/`dispatch` inside the subscription callback, never directly in the effect body.
- **Derived values**: compute during render (or `useMemo`) instead of syncing them into state with an effect.

## Routes

| Route | What |
| --- | --- |
| `/` | Participant flow — one client state machine: welcome → pre-survey → flight setup → dashboard → post-survey → debrief. `?v=A` / `?v=B` force a variant; `?test=1` marks a team test session. |
| `/preview?origin=JFK&destination=LAX&date=2026-11-26&v=A` | Team demo of the dashboard alone. No surveys, saves nothing. |
| `/results?key=<ADMIN_KEY>` | Results: table, CSV export, pre-vs-post averages (overall and by variant), anxiety dropped/same/rose, calming vs anxiety-inducing section counts. |
| `POST /api/responses` | Upsert one `SessionRecord` (by `sessionId`). 503 + `{storage:"none"}` when Supabase isn't configured. |
| `GET /api/responses?key=<ADMIN_KEY>` | All records (admin). |
| `/opengraph-image`, `/icon.svg` | Link-sharing image and favicon. |

## Folder map and ownership

Foundation files (written first; treat as **read-only** — if you need a change, say so in your report instead of editing):

| File | What |
| --- | --- |
| `lib/types.ts` | Every shared type: `Flight`, `SessionRecord`, `DashboardMetrics`, survey types… |
| `lib/sections.ts` | Section registry, `VARIANT_SECTIONS`, `PART_LABELS`, `partsForVariant()` |
| `lib/tracking.ts` | `DashboardTracker` class + `TrackerContext` / `useTracker()` |
| `lib/forecast.ts` | `getForecastStatus(daysUntil, history)`, `summarizeFlight(flight, daysUntil)` |
| `lib/dates.ts` | Pure date/time helpers (`daysUntil`, `formatTime12`, `formatDuration`, `countdownLabel`…) |
| `lib/theme.ts` | Tones, `INTENSITY` colours, `PHASE_LABEL`, `SEAT_ZONE`, `CHART` styling, raw `COLORS` |
| `lib/cn.ts` | `cn(...classes)` |
| `lib/hooks.ts` | `useHydrated()`, `useTodayISO()`, `useQueryParam()` — client-only values, lint-safe |
| `components/ui/{Card,SectionCard,Pill,Stat,Button,Screen}.tsx` | UI primitives |
| `app/globals.css`, `app/layout.tsx` | Tokens, font (Manrope), metadata, viewport |

Owned files (each module's exported names/signatures are fixed by the stub that was in place; the owner replaces the stub):

| Owner | Files |
| --- | --- |
| Generator | `lib/random.ts`, `lib/airports.ts`, `lib/airlines.ts`, `lib/aircraft.ts`, `lib/names.ts`, `lib/fakeFlight.ts`, `scripts/check-fake-flight.ts` |
| Dashboard core | `components/dashboard/Dashboard.tsx`, `DashboardHeader.tsx`, `SummaryCard.tsx`, `TurbulenceSection.tsx`, `app/preview/page.tsx` (+ any `components/dashboard/turbulence/*`) |
| Sections: trust | `components/dashboard/PilotSection.tsx`, `AircraftSection.tsx`, `AirlineSection.tsx` |
| Sections: environment | `components/dashboard/WeatherSection.tsx`, `SoundsSection.tsx`, `AlertsSection.tsx` |
| Sections: control | `components/dashboard/SeatSection.tsx`, `CompareSection.tsx` |
| Study flow | `app/page.tsx`, `components/flow/*`, `lib/session.ts`, `lib/storage.ts` |
| Backend | `app/api/responses/route.ts`, `lib/db.ts`, `lib/admin.ts`, `lib/record.ts`, `supabase/schema.sql`, `.env.example` |
| Results | `app/results/*`, `components/results/*`, `lib/stats.ts`, `lib/csv.ts` |
| Polish | `app/opengraph-image.tsx`, `app/icon.svg`, `app/apple-icon.tsx`, `README.md` |

## Module contracts

```ts
// lib/airports.ts (generator)
export const AIRPORTS: readonly Airport[];
export const POPULAR_AIRPORT_CODES: readonly string[];
export function getAirport(code: string): Airport | undefined;
export function searchAirports(query: string, limit?: number): Airport[];   // empty query → popular
export function resolveAirport(value: string): Airport;                      // never throws; free text → synthetic (known:false)

// lib/fakeFlight.ts (generator)
export function normalizeInput(input: FlightInput): FlightInput;
export function generateFlight(input: FlightInput): Flight;                  // deterministic

// components/dashboard/<Name>Section.tsx (section agents) — 9 files
export function TurbulenceSection(props: SectionProps): JSX.Element;         // section BODY only
export function turbulenceTeaser(flight: Flight, ctx: SectionContext): string; // one calm line for the collapsed header
// …same pattern: PilotSection/pilotTeaser, AircraftSection/aircraftTeaser, AirlineSection/airlineTeaser,
// WeatherSection/weatherTeaser, SeatSection/seatTeaser, SoundsSection/soundsTeaser,
// CompareSection/compareTeaser, AlertsSection/alertsTeaser

// components/dashboard/Dashboard.tsx (dashboard core)
export interface DashboardProps {
  flight: Flight; variant: Variant;
  initialMetrics?: DashboardMetrics | null;            // resume after reload
  onCheckpoint?: (m: DashboardMetrics) => void;        // page hidden + every ~20 s
  onDone: (m: DashboardMetrics) => void;               // "I'm done exploring"
}
export function Dashboard(props: DashboardProps): JSX.Element;

// lib/storage.ts (study flow) — client only
export function saveSession(record: SessionRecord, opts?: { beacon?: boolean }): Promise<"remote" | "local">; // never throws
export function loadLocalResponses(): SessionRecord[];  // newest first

// lib/db.ts, lib/admin.ts (backend) — server only
export function isDbConfigured(): boolean;
export function upsertResponse(record: SessionRecord): Promise<void>;
export function listResponses(): Promise<SessionRecord[]>; // newest first
export function isAdminKey(key: string | null | undefined): boolean;
```

**Sections and tracking.** `Dashboard` owns each section's open state, wraps each body in
`<SectionCard>` and reports expand/collapse via `tracker.setSectionOpen(id, open)`. Section
bodies log extra interactions with `useTracker()?.event(type, sectionId, detail)`, e.g.
`event("seat_selected", "seat", "14C")`. The alerts toggle calls `useTracker()?.alertToggled(on)`.
Every section body must render without crashing for any generated flight (short-haul
narrow-body through 15-hour wide-body, any date).

## Design system

Mood: an aviation app crossed with a wellness app. Calm, premium, soft colours, generous whitespace.

- **Colours** (Tailwind classes from `app/globals.css`): `canvas` (app background), `surface` (cards), `line`/`line-strong` (borders), `ink-900/700/500/400/300` (text), `night-*` (deep navy: header, primary buttons), `calm-*` (sea-glass teal: smooth/positive), `breeze-*` (sky blue: info/light bumps), `dusk-*` (lavender: people/wellness), `sand-*` (soft sand: moderate bumps, gentle caution).
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

One `SessionRecord` per session (see `lib/types.ts`). Supabase table `responses` keeps flat columns
for the headline numbers plus the full record as `jsonb` (`supabase/schema.sql`). A trigger
ignores stale writes (lower `seq`).

## Verifying your work during the build

- A dev server is **already running at http://localhost:3000** (Turbopack hot-reloads your edits). Do **not** start another server and do **not** run `next build`.
- Typecheck only your files: `npx tsc --noEmit -p . 2>&1 | grep -E "^(lib/yourfile|components/yours)"`. Errors in other people's files are expected while they work.
- Lint your files: `npx eslint <your files>`.
- Screenshot in a phone viewport: `node scripts/shot.mjs <url> <out.png> [--full] [--click="text=Your pilots"]…` and view the PNG with the Read tool. Save screenshots in the scratch directory given to you, never in the repo.
- You may create a throwaway harness page at `app/dev/<your-agent-name>/page.tsx` to render your components in isolation. **Delete it before you finish.**
- Don't install packages and don't edit `package.json`.
