-- VERIFY for 20261021120100_p0_account_evidence (Phase 0). READ-ONLY.
-- Every row must show ok = true. Then run
-- supabase/migration-checks/p0_snapshot.sql (must equal the BEFORE result).
-- Optional extra: supabase/backup/verify.sql
-- (counts, balances per account, data_md5 equal to the backup).

select 'new_columns' as check_name,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'accounts'
           and column_name in ('aliases', 'linked_card_last4', 'evidence_state',
             'evidence_count', 'created_by', 'bank_key',
             'verified_identity')) = 7 as ok,
       '7 Phase 0 columns present' as detail
union all
select 'defaults_on_old_rows',
       (select count(*) from public.accounts
         where evidence_state <> 'user' or created_by <> 'user'
            or evidence_count <> 0 or aliases <> '{}'
            or linked_card_last4 <> '{}') = 0,
       'existing accounts are user-created, no evidence'
union all
select 'checks',
       (select count(*) from pg_constraint
         where conrelid = 'public.accounts'::regclass
           and conname in ('accounts_evidence_state_check',
             'accounts_created_by_check', 'accounts_evidence_count_check')) = 3,
       'evidence_state / created_by / evidence_count checks'
union all
select 'soft_lookup_not_unique',
       exists (select 1 from pg_indexes where schemaname = 'public'
                 and indexname = 'accounts_user_bank_last4_idx'
                 and indexdef not like 'CREATE UNIQUE%'),
       '(user, bank_key, last4) lookup index is not unique'
union all
select 'identity_unique',
       exists (select 1 from pg_indexes where schemaname = 'public'
                 and indexname = 'accounts_user_identity_uidx'
                 and indexdef like 'CREATE UNIQUE%'),
       'unique (user, bank_key, type, last4, verified_identity), live only'
union all
select 'rls_policy',
       exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'accounts' and policyname = 'accounts_own'),
       'accounts_own (user_id = auth.uid()) unchanged';
