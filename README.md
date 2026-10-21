# Pre-Flight Clarity

A research prototype for a student startup (Allen, Arshad, Jaime, Krish) building software for people
with flight anxiety. It shows participants a calm, data-rich (fake but credible) dashboard about an
upcoming flight and measures, honestly, whether their anxiety, sense of control and sense of
predictability change.

> **Risky assumption under test:** giving anxious flyers more predictability and control *before* the
> flight lowers their stress. "More data doesn't help" is a valid outcome. The prototype never nudges.

The full brief is in [PROTOTYPE_BRIEF.md](PROTOTYPE_BRIEF.md); the technical design, conventions and
rules every contributor follows are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Repo:
[github.com/Jaime-Valdes/preflight-clarity](https://github.com/Jaime-Valdes/preflight-clarity).

## Monorepo layout

| Folder | What | Deploys to |
| --- | --- | --- |
| [`frontend/`](frontend/) | Next.js app: the participant flow, the dashboard, the team results page | Vercel (root directory `frontend`) |
| [`backend/`](backend/) | Hono API on Node: receives session records, stores them in Supabase, serves them to the results page | Railway / any Node host (built from the repo root) |
| [`shared/`](shared/) | TypeScript shared by both: types, the fake-flight generator, pure helpers, stats, CSV | — (imported as `@preflight/shared/*`) |

npm workspaces, one `package-lock.json` at the root, Node 20.12 or newer.

## How a session works

One link, one phone, about 5–10 minutes:

1. **Welcome / consent** — "We're testing a prototype for nervous flyers. All data shown is illustrative."
   It also says the briefing is an example flight on a route they choose, shown as it would look the day
   before departure.
2. **Pre-survey** — anxiety, control and predictability about their next flight, each 0–10. Sliders start
   unset. Optional: route, how far away the flight is, how often they fly.
3. **Flight setup** — origin, destination and date. Airports come from the app's list (pick a suggestion;
   for a small airport, the nearest major one) and the date can be up to 330 days ahead, about as far as
   airlines publish schedules. The app generates a believable fake flight from them (airline, flight
   number, aircraft, forecast…), labelled "An example flight on your route". Deterministic: same inputs,
   same flight.
4. **Dashboard** — the main part, shown as the briefing would look **the day before the flight** (a quiet
   banner says so; the countdown stays true). Only information a real product could have by then appears
   (docs/FEASIBILITY.md): no pilot names, hours or ratings, no maintenance records. Header, smoothness
   score and, in variant A, nine collapsible sections (turbulence by phase, who flies your plane, aircraft,
   airline, weather, best seat, sounds and sensations, smoother options, forecast alerts). Time on page and
   every section open/close are recorded.
5. **Post-survey** — the same three sliders, which parts helped or worried them, how often they'd check
   it, what it would replace, what they'd still be scared of.
6. **Debrief** — reminder that the briefing was a day-before preview for an example flight and nothing was
   a real forecast; then the one product sign-up ("Want this for your real flights?" → **Notify me when
   it's live**): optional first name, email, and an unticked checkbox for a 15-minute follow-up chat. It is
   identical in A and B and only appears here, after every answer is saved, so the sign-up rate by variant
   is a clean business signal ([docs/INTEREST.md](docs/INTEREST.md)). The record keeps `waitlist` /
   `interview`, and the same sign-up is also stored in the `signups` table.

Progress lives in the browser tab (`sessionStorage`), so a reload resumes the same session at the same
screen. The record is saved to the backend after every step, every ~20 s on the dashboard, and with a
`sendBeacon` when the page is hidden — so even abandoned sessions show up in the results.

## Links to share

| Link | What |
| --- | --- |
| `/` | The study. Each participant is randomly assigned variant A or B. **This is the link to share.** |
| `/?v=A` · `/?v=B` | Force a variant (recorded as `variant_source = forced`). |
| `/?test=1` | Team test session: flagged `is_test` and hidden from the results by default. Use this for your own run-throughs. |
| `/c?test=1` | Version C in test mode for that browser tab: sign-ups you make are flagged as tests and hidden from the results by default. |
| `/preview?origin=JFK&destination=LAX&date=YYYY-MM-DD&v=A` | The dashboard alone, for demos. No surveys, saves nothing. |
| `/results?key=<ADMIN_KEY>` | Team results: table, CSV export, pre-vs-post numbers. |

The link preview (iMessage, WhatsApp, Slack…) shows a calm card: "A 5–10 minute study for nervous flyers ·
Student research prototype". The site is `noindex`, so search engines stay out.

## Run it locally

```bash
npm install                                    # once, from the repo root
cp frontend/.env.example frontend/.env.local   # API_URL, ADMIN_KEY
cp backend/.env.example  backend/.env          # ADMIN_KEY, DATA_FILE (or Supabase keys)
npm run dev                                    # web on http://localhost:3000, api on http://localhost:8787
```

- `npm run dev:web` / `npm run dev:api` run one side. The web app proxies `/api/*` to the API.
- Without Supabase the API keeps sessions in `backend/data/responses.json` (`DATA_FILE`, gitignored).
  `curl localhost:8787/health` tells you which storage is active: `supabase`, `file` or `none`.
- Without a backend at all (`API_URL` unset) the web app keeps sessions in the browser's `localStorage`
  and `/results` shows that browser's sessions only.
- Other commands, from the root: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run check`
  (all three), `npm run build`.

## Deploy

Three services. Do them in this order, because each one needs a value from the previous step.

### 1. Supabase (database)

1. Create a free project at [supabase.com](https://supabase.com) (any region; remember the database
   password, you won't need it again here).
2. Open **SQL Editor → New query**, paste the whole of
   [`backend/supabase/schema.sql`](backend/supabase/schema.sql) and run it. It is safe to run again later.
   It creates the `responses` table, a trigger that ignores stale writes, the `signups` table (product
   sign-ups from the debrief and version C), and turns on row level security with no policies, so browser
   keys can't read or write anything.
3. Open **Project Settings → API** (or **Data API**) and copy two values: the **Project URL**
   (`https://xxxx.supabase.co`) and the **secret / service_role key** (`sb_secret_…` or the legacy
   `eyJ…` service_role JWT). Never the anon / publishable key: the server-side key is the one that is
   allowed through RLS, and it must never reach the browser.

### 2. Backend → Vercel (second project, free)

1. [vercel.com](https://vercel.com) → **Add New → Project → Import** the same repo `Jaime-Valdes/preflight-clarity`.
2. **Root Directory**: `backend`. Keep "Include source files outside of the Root Directory" enabled.
   Framework preset: **Other**. `backend/vercel.json` sets the install/build commands and sends every path
   to one function (`backend/api/index.js` → `src/vercel.ts`).
3. **Environment Variables**: `ADMIN_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Deploy.
4. Check: `https://<backend-project>.vercel.app/health` → `{"ok":true,"storage":"supabase"}`.

Railway (below) works too, but isn't free.

### 2. Backend → Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → pick
   `Jaime-Valdes/preflight-clarity`.
2. In the service **Settings**:
   - **Root Directory**: leave empty. The API needs the repo root (the workspaces, the lockfile and
     `shared/`). Don't set it to `backend`: Railway then checks out `backend/` alone and `npm install`
     fails with `E404` for `@preflight/shared`, which is a workspace, not an npm package.
   - **Build Command**: `npm ci && npm run build -w backend` (tsup bundles the API *and* `shared/` into
     `backend/dist/`)
   - **Start Command**: `npm run start:api`
   - Optional — **Watch Paths**: `backend/**`, `shared/**`, `package.json`, `package-lock.json`, so
     frontend-only commits don't redeploy the API.
3. **Variables**: `ADMIN_KEY` (invent a long random string), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (the two values from step 1). `PORT` is provided by Railway; leave `DATA_FILE` unset.
4. **Settings → Networking → Generate Domain**. Note the URL, e.g. `https://preflight-api.up.railway.app`.
5. Check it: `curl https://<your-domain>/health` → `{"ok":true,"storage":"supabase"}`. If it says
   `"file"` or `"none"`, a variable is missing or misspelt.

### 3. Frontend → Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project → Import** the GitHub repo
   `https://github.com/Jaime-Valdes/preflight-clarity`.
2. **Root Directory**: `frontend`. Keep **"Include source files outside of the Root Directory in the Build
   Step"** enabled (the app imports `shared/` and the lockfile lives at the root). Framework preset:
   Next.js (detected).
3. **Environment Variables**: `API_URL` = the Railway URL from step 2 (no trailing slash) and
   `ADMIN_KEY` = exactly the same value as on Railway.
4. **Deploy**. Open the Vercel URL on your phone.

`API_URL` is read **at build time** (it becomes the `/api/*` rewrite in `frontend/next.config.ts`), so
whenever you add or change an environment variable, trigger a redeploy (**Deployments → ⋯ → Redeploy**);
saving the variable alone changes nothing. The link-preview image resolves its absolute URL from Vercel's
own environment, so `NEXT_PUBLIC_SITE_URL` is only needed if you host the frontend somewhere else.

## How data is stored

- **One record per session** — a `SessionRecord` (see [`shared/src/types.ts`](shared/src/types.ts)):
  session id, timestamps, variant and how it was assigned, `is_test`, device, pre-survey, flight inputs
  and a summary of the generated flight, dashboard metrics (active time, per-section opens and open time,
  alert toggle, scroll depth, event log), post-survey, optional email.
- **Progressive saves** — the browser upserts the same record by `sessionId` with an increasing `seq`
  after every step, on dashboard checkpoints and on page hide. The API validates and sanitizes every
  payload (`shared/src/record.ts`, 100 KB cap) and a Postgres trigger ignores any write with a lower
  `seq`, so out-of-order beacons can't overwrite newer data. `step` and `completed_at` tell you how far
  each session got.
- **Supabase** — table `public.responses`: flat columns for the headline numbers (ratings, deltas,
  variant, device, dashboard time…) for quick looks in the Supabase table editor, plus the full record as
  `jsonb` in `record`. Only the server (service-role key) can touch it.
- **Dev fallback** — no Supabase keys → `backend/data/responses.json` (gitignored, lost on redeploy).
- **No backend** — `API_URL` unset → records stay in the browser's `localStorage`
  (`pfc.responses.v1`), and `/results` reads them from there. Fine for solo testing, useless for a study.
- **Privacy** — no accounts; the first name and email on the debrief are optional, used only to say when
  the product is live and (if the box was ticked) to invite a follow-up chat. Test sessions are flagged,
  not deleted.
- **Sign-ups** — every "notify me when it's live" sign-up (debrief and version C) is also one `Signup`
  row: Supabase table `public.signups` (same `schema.sql`), `backend/data/signups.json` in dev, or the
  browser's `localStorage` (`pfc.signups.v1`) with no backend. Duplicate emails from the same source
  update the existing row.

## The results page

`/results?key=<ADMIN_KEY>` (the key is checked against `ADMIN_KEY` by the web app, and again by the API
when a backend is configured) shows, for the filtered sessions:

- a **table** of every session (newest first) and a **CSV export** with one row per session and every
  field flattened (`shared/src/csv.ts`), ready for a spreadsheet;
- **pre vs post** averages for anxiety, control and predictability — overall and **by variant**;
- the share of participants whose **anxiety dropped, stayed the same or rose**;
- how often each dashboard part was named as **calming** vs **anxiety-inducing**;
- engagement: time on the dashboard, which sections were opened and for how long, alert-toggle taps,
  "how often would you check this" and "what would it replace".

Default filters: completed sessions only, test sessions hidden, forced-variant sessions included.

**How to read it honestly**

- Report **n** with every number. With a handful of sessions, a one-point average change is noise.
- Pre and post are **self-reports taken minutes apart** in a test setting. A drop can be the novelty of a
  polished prototype, not a lasting effect. A drop that doesn't appear in variant B as well may just be
  "a lot to look at" working for a few minutes.
- Compare **A against B** before celebrating A: if the minimal version moves the numbers as much, the
  rich data is not what helps.
- Read the **free-text answers** ("still scared of…", "made me more anxious…") — the section counts say
  *what*, the text says *why*. Anxiety that *rose* for some people is a finding, not an outlier.
- Keep forced-variant and test sessions out of any number you share, unless you say so.
- "No change" is a real result. Write it down the same way you would write down a win.

## The A/B design

Each session is randomly assigned, 50/50, at the start (`crypto.getRandomValues`), and the assignment is
stored with the record (`variant`, `variant_source`):

| Variant | Dashboard |
| --- | --- |
| **A · Full** | Header, smoothness score and all nine sections: turbulence by phase, who flies your plane, aircraft, airline, weather, best seat, sounds & sensations, smoother options, forecast alerts. |
| **B · Minimal** | Header, smoothness score and the turbulence section only. |

Everything else (surveys, wording, order, visuals) is identical, so the only difference is *how much*
data the participant sees. `?v=A` / `?v=B` override the draw for demos and testing.

## Before you run the study

- [ ] `ADMIN_KEY` is set to the same long random value on Railway **and** Vercel, and `/results?key=…`
      opens with it (and shows nothing without it).
- [ ] `https://<api>/health` says `"storage":"supabase"`.
- [ ] You re-ran [`backend/supabase/schema.sql`](backend/supabase/schema.sql) in the Supabase SQL editor
      since the sign-up was added (it is re-runnable), so the `signups` table exists — otherwise debrief
      and version C sign-ups only land in the browser's `localStorage`.
- [ ] You did a full run on **your own phone** with `/?test=1` (both variants: `/?test=1&v=A`,
      `/?test=1&v=B`; open it in a fresh tab — over an in-progress real session in the same tab it
      starts a new test session and the old one stays in storage as incomplete), the whole thing
      took under 8 minutes, nothing looked broken, and the sessions
      appeared in `/results` (test sessions are hidden by default — switch the filter) and in the
      Supabase table editor.
- [ ] The CSV export opens cleanly in a spreadsheet.
- [ ] You tried a reload mid-dashboard and the session resumed.
- [ ] Share the **plain** link `https://<your-app>.vercel.app/` — no `?v=`, no `?test=1`.
- [ ] Decide up front how many participants you want per variant and when you'll stop.
