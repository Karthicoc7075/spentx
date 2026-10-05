-- Migration: 20261006_realtime_replica_identity.sql
-- Enables Supabase Realtime WebSocket broadcasting and full row replica identity
-- for transactions and related financial tables so mobile clients receive
-- INSERT, UPDATE, and DELETE events live while connected.

-- 1. Set REPLICA IDENTITY FULL so updates/deletes send full row data
-- and allow RLS/filters (e.g. user_id=eq.<uid>) to match on UPDATE/DELETE payloads.
alter table if exists public.transactions replica identity full;
alter table if exists public.transaction_splits replica identity full;
alter table if exists public.outings replica identity full;
alter table if exists public.outing_expenses replica identity full;
alter table if exists public.accounts replica identity full;

-- 2. Add tables to supabase_realtime publication if not already added
do $$
begin
  -- transactions
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'transactions')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
     ) then
    execute 'alter publication supabase_realtime add table public.transactions';
  end if;

  -- transaction_splits
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'transaction_splits')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_splits'
     ) then
    execute 'alter publication supabase_realtime add table public.transaction_splits';
  end if;

  -- outings
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'outings')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outings'
     ) then
    execute 'alter publication supabase_realtime add table public.outings';
  end if;

  -- outing_expenses
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'outing_expenses')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outing_expenses'
     ) then
    execute 'alter publication supabase_realtime add table public.outing_expenses';
  end if;

  -- accounts
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'accounts')
     and not exists (
       select 1 from pg_publication_tables 
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts'
     ) then
    execute 'alter publication supabase_realtime add table public.accounts';
  end if;
end $$;
