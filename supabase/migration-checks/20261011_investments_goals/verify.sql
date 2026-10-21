-- VERIFY for supabase/migrations/20261011_investments_goals.sql (Phase S5b).
-- READ-ONLY. Every row must show ok = true. Then compare
-- supabase/backup/verify.sql (investments, savings_goals, goal_contributions,
-- balances_per_account data_md5).
-- Note: goal_contributions insert/update policies are dropped on purpose by
-- 20261011_security_audit_fixes.sql (writes go through the RPCs).

select 'tables' as check_name,
       to_regclass('public.investments') is not null
       and to_regclass('public.goal_contributions') is not null
       and to_regclass('public.investment_totals') is not null as ok,
       'investments, goal_contributions, investment_totals view' as detail
union all
select 'constraints',
       (select count(*) from pg_constraint
         where connamespace = 'public'::regnamespace
           and conname in ('investments_type_check', 'investments_name_check',
             'investments_amounts_check', 'savings_goals_target_positive',
             'savings_goals_saved_nonnegative', 'goal_contributions_amount_check',
             'goal_contributions_source_check', 'accounts_type_check')) = 8,
       '8 check constraints'
union all
select 'rls_enabled',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.investments'::regclass,
                       'public.goal_contributions'::regclass)),
       'RLS on investments + goal_contributions'
union all
select 'investment_policies',
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'investments'
           and policyname in ('investments_select_own', 'investments_insert_own',
                              'investments_update_own')) = 3,
       'own-row select/insert/update'
union all
select 'goal_contrib_select_policy',
       exists (select 1 from pg_policies where schemaname = 'public'
               and tablename = 'goal_contributions'
               and policyname = 'goal_contributions_select_own'),
       'own-row select'
union all
select 'anon_no_access',
       not has_table_privilege('anon', 'public.investments', 'select')
       and not has_table_privilege('anon', 'public.goal_contributions', 'select')
       and not has_table_privilege('anon', 'public.investment_totals', 'select'),
       'anon cannot read investments / contributions / totals'
union all
select 'touch_triggers',
       (select count(*) from pg_trigger where not tgisinternal
         and tgname in ('investments_touch_updated_at', 'tr_savings_goals_touch')) = 2,
       'updated_at triggers'
union all
select 'rpcs',
       to_regprocedure('public.add_goal_contribution(uuid,numeric,uuid,text,text,text)') is not null
       and to_regprocedure('public.remove_goal_contribution(uuid)') is not null,
       'add/remove_goal_contribution'
union all
select 'no_bad_rows',
       not exists (select 1 from public.investments
                   where length(btrim(name)) = 0 or invested_amount < 0)
       and not exists (select 1 from public.savings_goals where icon is null),
       'no blank investment names / negative invested / null goal icons';
