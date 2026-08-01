-- Per-user verified SMS merchants (not global).
-- Mobile: first SMS from a payee → verify amount/title; after user confirms,
-- merchant is saved here. Next SMS from same payee auto-adds + "Added" notification.
-- Reinstall: pull restores merchants_box so learning is not lost.

create table if not exists public.user_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payee text not null,
  normalized_payee text not null,
  title text not null,
  purpose text not null default 'Personal',
  category text not null default 'Other',
  is_auto_apply boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_payee)
);

create index if not exists user_merchants_user_id_idx
  on public.user_merchants (user_id);

create index if not exists user_merchants_user_norm_idx
  on public.user_merchants (user_id, normalized_payee);

alter table public.user_merchants enable row level security;

-- Owner-only: never shared across users / not admin-global templates.
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

comment on table public.user_merchants is
  'User-scoped SMS merchant learning. After first verification, future SMS auto-add.';
