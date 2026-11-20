-- Cloud9 — version D's route-day schedule cache (docs/REAL_DATA.md, step 1), 2026-11-19.
--
-- The new SQL alone, for the owner to run once in the Supabase SQL editor before step 1 ships.
-- backend/supabase/schema.sql carries the same statements. Safe to run more than once.
--
-- Until this runs, GET /flights/day still answers: the API logs the failed read or write and keeps
-- the day in its in-memory cache only, so each server instance calls the provider on its own.
--
-- One row per route, local departure date and provider: the RouteDaySchedule
-- GET /flights/day answered with (shared/src/schedule.ts) as jsonb, when it was
-- fetched and when its 24-hour TTL ends. The API upserts on (route, date,
-- provider) and refreshes an expired row on the next request. AeroDataBox's
-- terms allow keeping its contents for at most 7 days, so the trigger below
-- drops every row fetched longer ago than that on each write, and the API
-- never serves one. Same access rule as the other tables: RLS on, no
-- policies, server only.

create table if not exists public.route_days (
  route       text not null,
  date        date not null,
  provider    text not null,
  fetched_at  timestamptz not null,
  expires_at  timestamptz not null,
  payload     jsonb not null,
  primary key (route, date, provider)
);

comment on table  public.route_days is 'Cached nonstop schedules for version D, one row per route, local date and provider. Written by the API; rows fetched over 7 days ago are dropped by a trigger.';
comment on column public.route_days.route is 'ORIGIN-DESTINATION IATA codes, e.g. JFK-LAX.';
comment on column public.route_days.date is 'Local departure date at the origin.';
comment on column public.route_days.provider is 'generator (the illustrative timetable), aerodatabox, or fixture (tests).';
comment on column public.route_days.fetched_at is 'When the rows were fetched from the provider.';
comment on column public.route_days.expires_at is 'fetched_at + 24 h: the API refreshes the row after this.';
comment on column public.route_days.payload is 'The RouteDaySchedule as answered (shared/src/schedule.ts).';

create or replace function public.route_days_prune()
returns trigger
language plpgsql
as $$
begin
  delete from public.route_days where fetched_at < now() - interval '7 days';
  return null;
end;
$$;

drop trigger if exists route_days_prune on public.route_days;
create trigger route_days_prune
  after insert or update on public.route_days
  for each statement
  execute function public.route_days_prune();

-- Server-only access, like the other tables: RLS on, no policies, browser roles revoked.
alter table public.route_days enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.route_days from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.route_days from authenticated;
  end if;
end
$$;
