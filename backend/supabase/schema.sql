-- Pre-Flight Clarity — Supabase schema
--
-- Paste into the Supabase SQL editor (Project → SQL Editor) and run. Safe to
-- run more than once: every statement is idempotent. Two tables: `responses`
-- (study sessions, below) and `signups` (product-interest sign-ups, at the end).
--
-- One row per participant session. The flat columns hold the headline numbers
-- for quick queries in the Supabase UI; the full SessionRecord (see
-- shared/src/types.ts) lives in `record`. The API upserts on session_id with an
-- increasing `seq`; the trigger below ignores stale writes and keeps the
-- original created_at.
--
-- Row level security is enabled with NO policies on purpose: the anon and
-- authenticated roles can neither read nor write. Only the server, using the
-- service-role / secret key (which bypasses RLS), touches this table.

create table if not exists public.responses (
  session_id           uuid primary key,
  seq                  integer not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  step                 text,
  variant              text check (variant in ('A', 'B')),
  variant_source       text,
  is_test              boolean,
  device_type          text,
  pre_anxiety          smallint check (pre_anxiety between 0 and 10),
  pre_control          smallint check (pre_control between 0 and 10),
  pre_predictability   smallint check (pre_predictability between 0 and 10),
  post_anxiety         smallint check (post_anxiety between 0 and 10),
  post_control         smallint check (post_control between 0 and 10),
  post_predictability  smallint check (post_predictability between 0 and 10),
  delta_anxiety        smallint generated always as (post_anxiety - pre_anxiety) stored,
  delta_control        smallint generated always as (post_control - pre_control) stored,
  delta_predictability smallint generated always as (post_predictability - pre_predictability) stored,
  smoothness_score     smallint,
  dashboard_active_ms  integer,
  sections_opened      smallint,
  alert_tapped         boolean,
  check_frequency      text,
  email                text,
  record               jsonb not null
);

comment on table  public.responses is 'One row per Pre-Flight Clarity study session. Upserted by the API on session_id; stale writes (lower seq) are ignored by a trigger.';
comment on column public.responses.session_id is 'Session UUID generated in the browser.';
comment on column public.responses.seq is 'Save counter from the browser; increases on every save of the same session.';
comment on column public.responses.created_at is 'When the session started (from the first save; preserved on later saves).';
comment on column public.responses.updated_at is 'Server time of the latest accepted save.';
comment on column public.responses.completed_at is 'When the post-survey was submitted; null while in progress.';
comment on column public.responses.step is 'Step the participant was on at the latest save: welcome, pre, setup, dashboard, post or debrief.';
comment on column public.responses.variant is 'A = full dashboard, B = minimal (summary + turbulence only).';
comment on column public.responses.variant_source is 'random, or forced via ?v=A / ?v=B.';
comment on column public.responses.is_test is 'True for team test sessions (?test=1); exclude from analysis.';
comment on column public.responses.device_type is 'mobile, tablet or desktop.';
comment on column public.responses.pre_anxiety is 'Pre-survey anxiety rating, 0–10 (null = not answered).';
comment on column public.responses.pre_control is 'Pre-survey sense-of-control rating, 0–10.';
comment on column public.responses.pre_predictability is 'Pre-survey predictability rating, 0–10.';
comment on column public.responses.post_anxiety is 'Post-survey anxiety rating, 0–10.';
comment on column public.responses.post_control is 'Post-survey sense-of-control rating, 0–10.';
comment on column public.responses.post_predictability is 'Post-survey predictability rating, 0–10.';
comment on column public.responses.delta_anxiety is 'post_anxiety − pre_anxiety (generated; negative = anxiety dropped).';
comment on column public.responses.delta_control is 'post_control − pre_control (generated; positive = more in control).';
comment on column public.responses.delta_predictability is 'post_predictability − pre_predictability (generated; positive = more predictable).';
comment on column public.responses.smoothness_score is 'Smoothness score (0–100) of the generated flight the participant saw.';
comment on column public.responses.dashboard_active_ms is 'Time on the dashboard while the page was visible, ms.';
comment on column public.responses.sections_opened is 'Number of distinct dashboard sections the participant expanded.';
comment on column public.responses.alert_tapped is 'Whether the (non-functional) forecast-alert toggle was tapped.';
comment on column public.responses.check_frequency is 'Post-survey: how often they would check this before a real flight.';
comment on column public.responses.email is 'Optional follow-up email from the debrief screen.';
comment on column public.responses.record is 'The full SessionRecord as sent by the browser (shared/src/types.ts).';

-- Adding columns later? Use `alter table public.responses add column if not exists …` here,
-- so this file stays safe to re-run.

-- 2026-10-22: the "About your flying" screen and the travel-plans question.
alter table public.responses add column if not exists worries_most   text;
alter table public.responses add column if not exists anxiety_starts text;
alter table public.responses add column if not exists travel_impact  text;
comment on column public.responses.worries_most is 'Pre-survey: what worries them most about flying (turbulence, takeoff_landing, not_in_control, something_wrong, feeling_trapped, other).';
comment on column public.responses.anxiety_starts is 'Pre-survey: when the anxiety usually starts (at_booking, weeks_before, days_before, day_of, not_before).';
comment on column public.responses.travel_impact is 'Post-survey: how fear of flying changed travel plans in the past year, comma-joined (no, ground_instead, paid_more, skipped_trip).';

-- Stale writes: saves can arrive out of order (a sendBeacon on page hide can
-- land after the next save). Skip any update whose seq is lower than the
-- stored one, keep the original created_at (in the column and inside the
-- jsonb record) and stamp updated_at with the server clock.
create or replace function public.responses_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.seq < old.seq then
    return null; -- stale write: skip the update, keep the stored row
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  if old.record ? 'createdAt' then
    new.record := jsonb_set(new.record, '{createdAt}', old.record -> 'createdAt');
  end if;
  return new;
end;
$$;

drop trigger if exists responses_before_update on public.responses;
create trigger responses_before_update
  before update on public.responses
  for each row
  execute function public.responses_before_update();

-- Results page: newest first.
create index if not exists responses_created_at_idx on public.responses (created_at desc);

-- Server-only access: RLS on, no policies. The service-role key bypasses RLS;
-- the anon / authenticated roles (browser keys) get nothing.
alter table public.responses enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.responses from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.responses from authenticated;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Product-interest sign-ups (docs/INTEREST.md)
--
-- One row per email per source: "study" (the debrief screen) or "c" (version
-- C). The API upserts on (email_key, source): a repeat sign-up from the same
-- source replaces the row's details, and the trigger below keeps the original
-- created_at, an earlier first name and an earlier interview opt-in. The flat
-- columns are for quick queries; the full Signup (see
-- shared/src/types.ts) lives in `record`. Same access rule as responses: RLS
-- on, no policies, server only.

create table if not exists public.signups (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  source       text not null check (source in ('study', 'c')),
  placement    text not null,
  email        text not null,
  email_key    text generated always as (lower(btrim(email))) stored,
  first_name   text,
  waitlist     boolean not null default true,
  interview    boolean not null default false,
  session_id   uuid,
  variant      text check (variant in ('A', 'B')),
  is_test      boolean not null default false,
  participant  text,
  context      text,
  page         text,
  record       jsonb not null,
  constraint signups_email_key_source_key unique (email_key, source)
);

comment on table  public.signups is 'Product-interest sign-ups ("notify me when it''s live"), one row per email per source. Upserted by the API on (email_key, source); the original created_at is kept by a trigger.';
comment on column public.signups.id is 'Sign-up UUID generated in the browser (the latest one for this email and source).';
comment on column public.signups.created_at is 'When this email first signed up from this source (preserved on repeats).';
comment on column public.signups.updated_at is 'Server time of the latest accepted sign-up for this row.';
comment on column public.signups.source is 'study = the debrief screen of the A/B study; c = version C, the flight comparison tool.';
comment on column public.signups.placement is 'Screen the form was on: debrief, c_home, c_results, c_flight or c_compare (signups_placement_check).';
comment on column public.signups.email is 'Email as typed (trimmed).';
comment on column public.signups.email_key is 'lower(btrim(email)), generated; unique together with source.';
comment on column public.signups.first_name is 'Optional first name; null if none.';
comment on column public.signups.waitlist is 'Wants to be told when the product is live (the form''s primary action).';
comment on column public.signups.interview is 'Open to a short follow-up chat.';
comment on column public.signups.session_id is 'Study only: the session the sign-up belongs to (responses.session_id); null for version C.';
comment on column public.signups.variant is 'Study only: A or B; null for version C.';
comment on column public.signups.is_test is 'True for team test sessions (?test=1); exclude from analysis.';
comment on column public.signups.participant is 'Optional ?p= label of the study link; null if none.';
comment on column public.signups.context is 'What they were looking at, e.g. "JFK → LAX · Nov 26 · 2 flights in compare"; null if none.';
comment on column public.signups.page is 'Pathname the form was on, e.g. /c/compare.';
comment on column public.signups.record is 'The full Signup as sent by the browser (shared/src/types.ts).';

-- Known placements. Dropped and re-added on every run, so adding one is a
-- one-line edit here (shared/src/signup.ts SIGNUP_PLACEMENTS is the other copy).
alter table public.signups drop constraint if exists signups_placement_check;
alter table public.signups add constraint signups_placement_check
  check (placement in ('debrief', 'c_home', 'c_results', 'c_flight', 'c_compare'));

-- Repeat sign-ups: the upsert replaces the details, so keep the original
-- created_at (in the column and inside the jsonb record), stamp updated_at
-- with the server clock, and never lose what the first sign-up said: the forms
-- start blank, so an empty first name or an unticked interview box on the
-- repeat means "not asked again", not "take me off". Same rule as the file
-- store (backend/src/lib/store/file.ts).
create or replace function public.signups_before_update()
returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  new.first_name := coalesce(nullif(new.first_name, ''), old.first_name);
  new.interview := new.interview or old.interview;
  new.record := new.record || jsonb_build_object(
    'firstName', coalesce(new.first_name, ''),
    'interview', new.interview
  );
  if old.record ? 'createdAt' then
    new.record := jsonb_set(new.record, '{createdAt}', old.record -> 'createdAt');
  end if;
  return new;
end;
$$;

drop trigger if exists signups_before_update on public.signups;
create trigger signups_before_update
  before update on public.signups
  for each row
  execute function public.signups_before_update();

-- Results page: newest first.
create index if not exists signups_created_at_idx on public.signups (created_at desc);

-- Server-only access, like responses: RLS on, no policies, browser roles revoked.
alter table public.signups enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.signups from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.signups from authenticated;
  end if;
end
$$;
