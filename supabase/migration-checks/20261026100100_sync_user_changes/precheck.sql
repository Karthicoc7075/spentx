-- PRECHECK for supabase/migrations/20261026100100_sync_user_changes.sql
-- READ-ONLY. Run before the migration and keep the output.

select 'user_changes_exists (info)' as check_name, true as ok,
       coalesce(to_regclass('public.user_changes')::text, 'not yet') as detail
union all
select 'synced_tables_with_updated_at (info)', true,
       (select string_agg(table_name, ', ' order by table_name)
          from information_schema.columns
         where table_schema = 'public' and column_name = 'updated_at'
           and table_name in ('transactions', 'transaction_splits', 'transaction_items',
             'accounts', 'purposes', 'categories', 'contributors', 'user_merchants',
             'monthly_plans', 'outings', 'outing_expenses', 'outing_categories', 'friends',
             'friend_splits', 'friend_settlements', 'settlements', 'savings_goals',
             'investments', 'projector_settings', 'recurring_bills', 'user_self_upi', 'users'))
union all
select 'existing_before_update_touch (info)', true,
       (select string_agg(c.relname || '.' || tg.tgname, ', ' order by c.relname)
          from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
         where not tg.tgisinternal and c.relnamespace = 'public'::regnamespace
           and (tg.tgtype & 16) <> 0 and (tg.tgtype & 2) <> 0
           and (tg.tgname ilike '%touch%' or tg.tgname ilike '%updated_at%'))
union all
select 'realtime_tables (info)', true,
       (select string_agg(tablename, ', ' order by tablename)
          from pg_publication_tables where pubname = 'supabase_realtime')
union all
select 'rls_on_user_tables',
       (select bool_and(relrowsecurity) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('transactions', 'transaction_splits', 'accounts', 'purposes',
                           'categories', 'user_merchants', 'outings', 'friends', 'users')),
       'must stay true';
