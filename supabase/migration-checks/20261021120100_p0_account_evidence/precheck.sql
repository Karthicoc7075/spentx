-- PRECHECK for supabase/migrations/20261021120100_p0_account_evidence.sql
-- (Phase 0). READ-ONLY. Every row must show ok = true; otherwise stop.

select 'not_yet_applied' as check_name,
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'accounts'
                      and column_name in ('aliases', 'linked_card_last4',
                        'evidence_state', 'evidence_count', 'created_by',
                        'bank_key', 'verified_identity')) as ok,
       'false = already (partly) applied: run verify.sql instead' as detail
union all
select 'no_name_conflicts',
       not exists (select 1 from pg_constraint
                    where conrelid = 'public.accounts'::regclass
                      and conname in ('accounts_evidence_state_check',
                        'accounts_created_by_check', 'accounts_evidence_count_check'))
       and not exists (select 1 from pg_indexes where schemaname = 'public'
                        and indexname in ('accounts_user_bank_last4_idx',
                          'accounts_user_identity_uidx')),
       'none of the new constraint / index names exist yet'
union all
select 'deleted_at_exists',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'accounts'
                  and column_name = 'deleted_at'),
       'partial indexes use deleted_at'
union all
select 'rls_enabled', (select relrowsecurity from pg_class
                        where oid = 'public.accounts'::regclass),
       'accounts RLS on (covers the new columns)'
union all
-- Shared (type, last4) among live accounts is allowed (soft index only);
-- shown so the identity rule can be checked against real data.
select 'shared_type_last4 (info)', true,
       (select count(*) from (select user_id, type, last4 from public.accounts
                               where deleted_at is null and last4 is not null
                                 and btrim(last4) <> ''
                               group by 1, 2, 3 having count(*) > 1) d)::text
       || ' (user, type, last4) groups with more than one live account'
union all
select 'accounts (info)', true,
       (select count(*) from public.accounts)::text || ' accounts, '
       || (select count(*) from public.accounts where deleted_at is null)::text
       || ' live — all will read as evidence_state user, created_by user';
