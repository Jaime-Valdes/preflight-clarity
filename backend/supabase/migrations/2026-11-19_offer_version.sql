-- Cloud9 — Flight Day Pack tracking: the offer's version on d_feedback rows and d_addon sign-ups, 2026-11-19.
--
-- The new SQL alone, for the owner to run once in the Supabase SQL editor before the branch ships.
-- backend/supabase/schema.sql carries the same statements. Safe to run more than once.
--
-- offer_version is "v2" from iteration 2 (the results pop-in and the after-pick dialog); rows from before have
-- null, which means v1. Additive: nullable columns, a check that allows only null or 'v2', and the sign-up
-- trigger keeping offerVersion in the record when a later sign-up from the same email doesn't send it.
-- Until this runs, the API saves rows without the column (the jsonb record keeps offerVersion).

alter table public.signups add column if not exists offer_version text;
comment on column public.signups.offer_version is 'd_addon only: the Flight Day Pack offer''s version, v2 from 2026-11-19; null means v1.';
alter table public.signups drop constraint if exists signups_offer_version_check;
alter table public.signups add constraint signups_offer_version_check
  check (offer_version is null or offer_version in ('v2'));

alter table public.d_feedback add column if not exists offer_version text;
comment on column public.d_feedback.offer_version is 'The Flight Day Pack offer''s version, v2 from 2026-11-19; null means v1.';
alter table public.d_feedback drop constraint if exists d_feedback_offer_version_check;
alter table public.d_feedback add constraint d_feedback_offer_version_check
  check (offer_version is null or offer_version in ('v2'));

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
  -- 2026-11-19: offerVersion too.
  new.record := jsonb_strip_nulls(jsonb_build_object(
    'priceArm', old.record -> 'priceArm',
    'armForced', old.record -> 'armForced',
    'offerPlacement', old.record -> 'offerPlacement',
    'flightDate', old.record -> 'flightDate',
    'utmSource', old.record -> 'utmSource',
    'utmMedium', old.record -> 'utmMedium',
    'utmCampaign', old.record -> 'utmCampaign',
    'offerVersion', old.record -> 'offerVersion'
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
