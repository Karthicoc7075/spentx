-- Allow 'archived' in outings status check constraint
alter table public.outings
  drop constraint if exists outings_status_check;

alter table public.outings
  add constraint outings_status_check
  check (status in ('active', 'completed', 'archived', 'cancelled'));

comment on column public.outings.status is
  'Outing status lifecycle: active, completed, archived, or cancelled.';
