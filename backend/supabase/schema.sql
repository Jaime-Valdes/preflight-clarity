-- Pre-Flight Clarity — Supabase schema
--
-- Paste into the Supabase SQL editor (Project → SQL Editor) and run. Safe to
-- run more than once: every statement is idempotent.
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
