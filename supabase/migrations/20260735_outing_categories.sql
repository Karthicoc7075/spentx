-- Per-user outing categories (Trip, Temple, Other, custom…).
-- outings.type already stores the free-text category name on each outing.
-- This table is the shared picker list for web + mobile.

create table if not exists public.outing_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outing_categories_name_not_blank check (btrim(name) <> '')
);

-- Case-insensitive unique name per user
create unique index if not exists outing_categories_user_name_uidx
  on public.outing_categories (user_id, lower(btrim(name)));

create index if not exists outing_categories_user_sort_idx
  on public.outing_categories (user_id, sort_order, name);

comment on table public.outing_categories is
  'User-scoped outing type/category picker (Trip, Other, custom). Outings store name in outings.type.';

alter table public.outing_categories enable row level security;

drop policy if exists "outing_categories_select_own" on public.outing_categories;
create policy "outing_categories_select_own"
  on public.outing_categories for select
  using (auth.uid() = user_id);

drop policy if exists "outing_categories_insert_own" on public.outing_categories;
create policy "outing_categories_insert_own"
  on public.outing_categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "outing_categories_update_own" on public.outing_categories;
create policy "outing_categories_update_own"
  on public.outing_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "outing_categories_delete_own" on public.outing_categories;
create policy "outing_categories_delete_own"
  on public.outing_categories for delete
  using (auth.uid() = user_id and is_system = false);

-- Seed defaults for every existing user that has none yet.
insert into public.outing_categories (user_id, name, sort_order, is_system)
select u.id, d.name, d.sort_order, true
from auth.users u
cross join (
  values
    ('Trip', 1),
    ('Temple', 2),
    ('Restaurant', 3),
    ('Movies', 4),
    ('Family', 5),
    ('Work', 6),
    ('Other', 100)
) as d(name, sort_order)
where not exists (
  select 1 from public.outing_categories oc where oc.user_id = u.id
);

-- Touch updated_at helper (optional reuse if trigger exists)
create or replace function public.outing_categories_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists outing_categories_set_updated_at on public.outing_categories;
create trigger outing_categories_set_updated_at
  before update on public.outing_categories
  for each row execute function public.outing_categories_touch_updated_at();
