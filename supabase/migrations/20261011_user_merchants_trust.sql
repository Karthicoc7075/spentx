-- SpentX: personal merchant rules become the single source for SMS auto-save.
-- Idempotent. Run after 20260727_user_merchants.sql (and after the other
-- 20261011_* files). Not applied automatically.
--
-- * purpose / updated_at already exist from 20260727; re-asserted for safety.
-- * is_trusted: true only after the user verified a transaction with
--   "Remember category and purpose for this merchant" ticked. Editing the
--   category/purpose clears it until confirmed again (enforced in the app).
-- * deleted_at: soft delete so removals sync across the same user's devices.
-- RLS stays owner-only (auth.uid() = user_id).
-- The category-rules dataset's separate user_merchant_category table is NOT
-- used; that table can be dropped from the dataset SQL.

alter table public.user_merchants
  add column if not exists purpose text not null default 'Personal';
alter table public.user_merchants
  add column if not exists updated_at timestamptz not null default now();
alter table public.user_merchants
  add column if not exists is_trusted boolean not null default false;
alter table public.user_merchants
  add column if not exists deleted_at timestamptz;

create index if not exists user_merchants_user_active_idx
  on public.user_merchants (user_id)
  where deleted_at is null;

-- Keep updated_at current on every update.
create or replace function public.user_merchants_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_merchants_touch_updated_at on public.user_merchants;
create trigger user_merchants_touch_updated_at
  before update on public.user_merchants
  for each row execute function public.user_merchants_touch_updated_at();

alter table public.user_merchants enable row level security;

drop policy if exists "user_merchants_select_own" on public.user_merchants;
create policy "user_merchants_select_own"
  on public.user_merchants for select
  using (auth.uid() = user_id);

drop policy if exists "user_merchants_insert_own" on public.user_merchants;
create policy "user_merchants_insert_own"
  on public.user_merchants for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_merchants_update_own" on public.user_merchants;
create policy "user_merchants_update_own"
  on public.user_merchants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_merchants_delete_own" on public.user_merchants;
create policy "user_merchants_delete_own"
  on public.user_merchants for delete
  using (auth.uid() = user_id);

comment on column public.user_merchants.is_trusted is
  'User confirmed this rule with "Remember category and purpose". Required for SMS auto-save.';
comment on column public.user_merchants.deleted_at is
  'Soft delete; clients drop the local rule when set.';
