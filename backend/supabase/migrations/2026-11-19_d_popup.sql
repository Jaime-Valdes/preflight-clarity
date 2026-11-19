-- Cloud9 — version D's waitlist dialog (placement 'd_popup'), iteration 2 of docs/FLIGHT_DAY_PACK.md, 2026-11-19.
--
-- The new SQL alone, for the owner to run once in the Supabase SQL editor before the branch is merged.
-- backend/supabase/schema.sql carries the same list. Safe to run more than once.

alter table public.signups drop constraint if exists signups_placement_check;
alter table public.signups add constraint signups_placement_check
  check (placement in ('debrief', 'dashboard', 'c_home', 'c_results', 'c_flight', 'c_compare', 'd_home', 'd_results', 'd_flight', 'd_compare', 'd_addon', 'd_popup'));
