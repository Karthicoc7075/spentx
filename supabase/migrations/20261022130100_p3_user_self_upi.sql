-- Phase 3: "My UPI IDs" (NOT RUN; apply manually after
-- migration-checks/20261022130100_p3_user_self_upi/precheck.sql).
--
-- New owner-only table. Money between a user's own UPI IDs is a transfer.
-- The app keeps the list on the device until this exists, then backs it up.

begin;

create table if not exists public.user_self_upi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upi_id_normalized text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_self_upi_unique unique (user_id, upi_id_normalized),
  constraint user_self_upi_format check (
    upi_id_normalized = lower(upi_id_normalized)
    and upi_id_normalized ~ '^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$'
  )
);

alter table public.user_self_upi enable row level security;

drop policy if exists user_self_upi_select_own on public.user_self_upi;
create policy user_self_upi_select_own on public.user_self_upi
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists user_self_upi_insert_own on public.user_self_upi;
create policy user_self_upi_insert_own on public.user_self_upi
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists user_self_upi_update_own on public.user_self_upi;
create policy user_self_upi_update_own on public.user_self_upi
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_self_upi_delete_own on public.user_self_upi;
create policy user_self_upi_delete_own on public.user_self_upi
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_self_upi to authenticated;
revoke all on public.user_self_upi from anon;

commit;
