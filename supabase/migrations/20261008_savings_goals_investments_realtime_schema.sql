-- Migration: 20261008_savings_goals_investments_realtime_schema.sql
-- Enables comprehensive server sync, full replica identity, soft-deletes,
-- and Supabase Realtime CDC publication for Savings Goals, Projector Settings,
-- and Portfolio Investments.

-- 1. Upgrade savings_goals schema for soft-deletes and rich metadata
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'is_active'
  ) then
    alter table public.savings_goals add column is_active boolean not null default true;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'deleted_at'
  ) then
    alter table public.savings_goals add column deleted_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'target_date'
  ) then
    alter table public.savings_goals add column target_date date;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'color'
  ) then
    alter table public.savings_goals add column color text default 'indigo';
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'icon'
  ) then
    alter table public.savings_goals add column icon text default 'target';
  end if;
end $$;

-- 2. Performance indexes for fast real-time user lookups
create index if not exists idx_savings_goals_user_active on public.savings_goals (user_id, is_active);
create index if not exists idx_projector_settings_user_id on public.projector_settings (user_id);

-- 3. Set REPLICA IDENTITY FULL for instant websocket CDC relay of old & new rows
alter table if exists public.savings_goals replica identity full;
alter table if exists public.projector_settings replica identity full;
alter table if exists public.friends replica identity full;
alter table if exists public.friend_splits replica identity full;
alter table if exists public.monthly_plans replica identity full;

-- 4. Automatically touch updated_at timestamp on row changes
create or replace function public.touch_updated_at_savings_goals()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_savings_goals_touch on public.savings_goals;
create trigger tr_savings_goals_touch
before update on public.savings_goals
for each row execute function public.touch_updated_at_savings_goals();

drop trigger if exists tr_projector_settings_touch on public.projector_settings;
create trigger tr_projector_settings_touch
before update on public.projector_settings
for each row execute function public.touch_updated_at_savings_goals();

-- 5. Add all remaining financial tables to supabase_realtime publication
do $$
begin
  -- savings_goals
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'savings_goals')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'savings_goals'
     ) then
    execute 'alter publication supabase_realtime add table public.savings_goals';
  end if;

  -- projector_settings
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'projector_settings')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projector_settings'
     ) then
    execute 'alter publication supabase_realtime add table public.projector_settings';
  end if;

  -- friends
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'friends')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friends'
     ) then
    execute 'alter publication supabase_realtime add table public.friends';
  end if;

  -- friend_splits
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'friend_splits')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_splits'
     ) then
    execute 'alter publication supabase_realtime add table public.friend_splits';
  end if;

  -- monthly_plans
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'monthly_plans')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'monthly_plans'
     ) then
    execute 'alter publication supabase_realtime add table public.monthly_plans';
  end if;
end $$;
