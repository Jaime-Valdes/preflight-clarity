# Pre-Flight Clarity

A research prototype for a student startup building software for people with flight anxiety.
It shows participants a calm, data-rich (fake but credible) dashboard about an upcoming flight and
measures whether their anxiety, sense of control and sense of predictability change.
The full brief is in [PROTOTYPE_BRIEF.md](PROTOTYPE_BRIEF.md); the technical design in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Monorepo layout

| Folder | What | Deploys to |
| --- | --- | --- |
| [`frontend/`](frontend/) | Next.js app: the participant flow, the dashboard, the team results page | Vercel (root directory `frontend`) |
| [`backend/`](backend/) | Hono API on Node: receives session records, stores them in Supabase, serves them to the results page | Railway / any Node host (root directory `backend`) |
| [`shared/`](shared/) | TypeScript shared by both: types, the fake-flight generator, pure helpers | — (imported as `@preflight/shared/*`) |

## Run it locally

```bash
npm install          # once, from the repo root (npm workspaces)
npm run dev          # web on http://localhost:3000, api on http://localhost:8787
```

`frontend/.env.local` and `backend/.env` hold local settings (see the `.env.example` files).
Without Supabase the API stores sessions in `backend/data/responses.json`; without a backend at all,
the web app keeps sessions in the browser's localStorage.

Useful commands (from the root): `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

## Deploy

1. **Frontend → Vercel**: import this repo, set *Root Directory* to `frontend`, keep "Include files outside the root directory" on. Environment variables: `API_URL` (your backend URL), `ADMIN_KEY`.
2. **Backend → Railway** (or similar): deploy from this repo with *Root Directory* `backend`; build `npm run build`, start `npm start`. Variables: `ADMIN_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **Supabase**: create a free project and run `backend/supabase/schema.sql` in the SQL editor.

Links to share: `/` (the study), `/?v=A` or `/?v=B` (force a variant), `/?test=1` (team test session),
`/preview?origin=JFK&destination=LAX&date=2026-11-26` (dashboard only), `/results?key=<ADMIN_KEY>` (team results).
