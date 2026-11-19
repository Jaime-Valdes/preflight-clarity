-- Cloud9 — version D's Flight Day Pack pricing test (docs/FLIGHT_DAY_PACK.md), 2026-11-18.
--
-- The new SQL alone, for the lead to apply once in the Supabase SQL editor. The same statements are
-- in backend/supabase/schema.sql (the full schema), so re-running that file later gives the same
-- result. Safe to run more than once: every statement is idempotent.
--
-- 1. signups: seven nullable columns for the d_addon sign-ups and the 'd_addon' placement.
--    Sign-ups from every other form leave them null, and a later sign-up from the same email and
--    source that doesn't send them leaves them as they were (the API only writes them when present).
-- 2. signups_before_update: also keeps the test's fields inside the jsonb record on such a repeat.
-- 3. d_feedback: one row per answered step (addon_join, addon_dismiss, pricing, general), server only.

-- 1. signups ------------------------------------------------------------------------------------

alter table public.signups add column if not exists price_arm       text;
alter table public.signups add column if not exists arm_forced      boolean;
alter table public.signups add column if not exists offer_placement text;
alter table public.signups add column if not exists flight_date     date;
alter table public.signups add column if not exists utm_source      text;
alter table public.signups add column if not exists utm_medium      text;
alter table public.signups add column if not exists utm_campaign    text;
comment on column public.signups.price_arm is 'd_addon only: the Flight Day Pack price shown, p499 ($4.99) or p1499 ($14.99) per trip.';
comment on column public.signups.arm_forced is 'd_addon only: true when the price was forced with ?arm= (team previews); null otherwise.';
comment on column public.signups.offer_placement is 'd_addon only: where the offer card was, after_pick or results.';
comment on column public.signups.flight_date is 'd_addon only: "Have a real flight coming up? When?", if answered.';
comment on column public.signups.utm_source is 'd_addon only: first-touch utm_source of the visitor''s version D session.';
comment on column public.signups.utm_medium is 'd_addon only: first-touch utm_medium of the visitor''s version D session.';
comment on column public.signups.utm_campaign is 'd_addon only: first-touch utm_campaign of the visitor''s version D session.';

alter table public.signups drop constraint if exists signups_price_arm_check;
alter table public.signups add constraint signups_price_arm_check
  check (price_arm is null or price_arm in ('p499', 'p1499'));
alter table public.signups drop constraint if exists signups_offer_placement_check;
alter table public.signups add constraint signups_offer_placement_check
  check (offer_placement is null or offer_placement in ('after_pick', 'results'));

-- The placement list gains 'd_addon' (schema.sql carries the same list).
alter table public.signups drop constraint if exists signups_placement_check;
alter table public.signups add constraint signups_placement_check
  check (placement in ('debrief', 'dashboard', 'c_home', 'c_results', 'c_flight', 'c_compare', 'd_home', 'd_results', 'd_flight', 'd_compare', 'd_addon'));

-- 2. signups_before_update ----------------------------------------------------------------------

create or replace function public.signups_before_update()
returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  new.first_name := coalesce(nullif(new.first_name, ''), old.first_name);
  new.interview := new.interview or old.interview;
  -- 2026-11-18: the Flight Day Pack's fields from an earlier d_addon sign-up stay in the record when
  -- the repeat doesn't carry them (its flat columns are not in the repeat's update at all).
  new.record := jsonb_strip_nulls(jsonb_build_object(
    'priceArm', old.record -> 'priceArm',
    'armForced', old.record -> 'armForced',
    'offerPlacement', old.record -> 'offerPlacement',
    'flightDate', old.record -> 'flightDate',
    'utmSource', old.record -> 'utmSource',
    'utmMedium', old.record -> 'utmMedium',
    'utmCampaign', old.record -> 'utmCampaign'
  )) || new.record;
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

-- 3. d_feedback ---------------------------------------------------------------------------------

create table if not exists public.d_feedback (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  session_id   uuid not null,
  price_arm    text not null,
  arm_forced   boolean not null default false,
  placement    text not null,
  kind         text not null,
  answers      jsonb not null,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  is_test      boolean not null default false,
  record       jsonb not null
);

comment on table  public.d_feedback is 'Version D''s Flight Day Pack test and general feedback (docs/FLIGHT_DAY_PACK.md): one row per answered step. Upserted by the API on id.';
comment on column public.d_feedback.id is 'Row UUID generated in the browser.';
comment on column public.d_feedback.created_at is 'When the step was answered (browser time; preserved on a repeat of the same save).';
comment on column public.d_feedback.updated_at is 'Server time of the latest accepted save.';
comment on column public.d_feedback.session_id is 'Version D''s per-tab session id (sessionStorage); joins the rows of one visit.';
comment on column public.d_feedback.price_arm is 'p499 ($4.99) or p1499 ($14.99) per trip, the price this visitor was shown.';
comment on column public.d_feedback.arm_forced is 'True when the price was forced with ?arm= (team previews); exclude from analysis.';
comment on column public.d_feedback.placement is 'after_pick or results (where the offer card was), or flight or compare (the general feedback link).';
comment on column public.d_feedback.kind is 'addon_join (after "Add"), addon_dismiss (after "No thanks"), pricing (the price questions) or general.';
comment on column public.d_feedback.answers is 'The answers, by kind (shared/src/types.ts): items/worthIt, reason/anythingElse, tooCheap/bargain/gettingExpensive/tooExpensive/plan, easier/moreUseful.';
comment on column public.d_feedback.utm_source is 'First-touch utm_source of the version D session; null if none.';
comment on column public.d_feedback.utm_medium is 'First-touch utm_medium of the version D session; null if none.';
comment on column public.d_feedback.utm_campaign is 'First-touch utm_campaign of the version D session; null if none.';
comment on column public.d_feedback.is_test is 'True for team test sessions (?test=1); exclude from analysis.';
comment on column public.d_feedback.record is 'The full row as sent by the browser (shared/src/types.ts DFeedback).';

alter table public.d_feedback drop constraint if exists d_feedback_kind_check;
alter table public.d_feedback add constraint d_feedback_kind_check
  check (kind in ('addon_join', 'addon_dismiss', 'pricing', 'general'));
alter table public.d_feedback drop constraint if exists d_feedback_placement_check;
alter table public.d_feedback add constraint d_feedback_placement_check
  check (placement in ('after_pick', 'results', 'flight', 'compare'));
alter table public.d_feedback drop constraint if exists d_feedback_price_arm_check;
alter table public.d_feedback add constraint d_feedback_price_arm_check
  check (price_arm in ('p499', 'p1499'));

-- A repeat of the same save keeps the original created_at (in the column and inside the record).
create or replace function public.d_feedback_before_update()
returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  if old.record ? 'createdAt' then
    new.record := jsonb_set(new.record, '{createdAt}', old.record -> 'createdAt');
  end if;
  return new;
end;
$$;

drop trigger if exists d_feedback_before_update on public.d_feedback;
create trigger d_feedback_before_update
  before update on public.d_feedback
  for each row
  execute function public.d_feedback_before_update();

-- Results page: newest first.
create index if not exists d_feedback_created_at_idx on public.d_feedback (created_at desc);

-- Server-only access, like responses and signups: RLS on, no policies, browser roles revoked.
alter table public.d_feedback enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.d_feedback from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.d_feedback from authenticated;
  end if;
end
$$;
