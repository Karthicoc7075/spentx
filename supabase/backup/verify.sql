-- SpentX — backup / migration fingerprint (Phase S5b). READ-ONLY.
--
-- Run this:
--   * on LIVE right before taking a backup and right before a migration;
--   * on the RESTORED copy (staging) after a restore;
--   * on LIVE right after a migration.
-- Save each result (CSV/JSON) next to the backup file. Two runs of the same
-- data give identical rows. "row_md5" covers every column (detects any
-- change; it also changes when a migration adds a column). "data_md5" covers
-- the fixed key columns only, so it must be identical before and after a
-- migration that is not meant to change data.
-- Psql:  psql "$SPENTX_DB_URL" -X -A -F, -f supabase/backup/verify.sql

with
t as (
  select 'transactions' as tbl, count(*) as rows,
         count(*) filter (where deleted_at is null) as live_rows,
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')) as row_md5,
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.account_id,
             x.to_account_id, x.total_amount, x.type, x.transaction_date,
             x.status, x.deleted_at), '#' order by x.id), '')) as data_md5
  from public.transactions x
),
a as (
  select 'accounts', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.name, x.type,
             x.last4, x.opening_balance, x.is_active, x.deleted_at), '#'
             order by x.id), ''))
  from public.accounts x
),
um as (
  select 'user_merchants', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id,
             x.normalized_payee, x.title, x.purpose, x.category,
             x.is_auto_apply, x.is_trusted, x.deleted_at), '#' order by x.id), ''))
  from public.user_merchants x
),
p as (
  select 'purposes', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.name,
             x.is_default, x.is_active, x.deleted_at), '#' order by x.id), ''))
  from public.purposes x
),
c as (
  select 'categories', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.name, x.type,
             x.is_active, x.deleted_at), '#' order by x.id), ''))
  from public.categories x
),
u as (
  select 'users', count(*), count(*),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.email, x.role,
             x.default_account_id, x.setup_completed), '#' order by x.id), ''))
  from public.users x
),
i as (
  select 'investments', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.name, x.type,
             x.invested_amount, x.current_value, x.account_id, x.deleted_at), '#'
             order by x.id), ''))
  from public.investments x
),
g as (
  select 'savings_goals', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.name,
             x.target_amount, x.saved_amount, x.is_active, x.deleted_at), '#'
             order by x.id), ''))
  from public.savings_goals x
),
gc as (
  select 'goal_contributions', count(*), count(*) filter (where deleted_at is null),
         md5(coalesce(string_agg(md5(x::text), '' order by x.id), '')),
         md5(coalesce(string_agg(concat_ws('|', x.id, x.user_id, x.goal_id,
             x.amount, x.transaction_id, x.deleted_at, x.reversed_at), '#'
             order by x.id), ''))
  from public.goal_contributions x
),
-- Balance inputs per account: opening balance + live transaction sums by
-- type (in and out of the account, transfers included). Same numbers the
-- app's balance is built from.
bal as (
  select 'balances_per_account' as tbl,
         count(*) as rows,
         count(*) filter (where acc_deleted is null) as live_rows,
         md5(coalesce(string_agg(concat_ws('|', id, opening_balance, sums), '#'
             order by id), '')) as row_md5,
         coalesce(sum(opening_balance), 0)::text as data_md5
  from (
    select ac.id, ac.opening_balance, ac.deleted_at as acc_deleted,
           (select string_agg(concat(k.dir, ':', k.type, '=', k.total), ','
                              order by k.dir, k.type)
              from (
                select 'from' as dir, tx.type, sum(tx.total_amount) as total
                  from public.transactions tx
                 where tx.account_id = ac.id and tx.deleted_at is null
                 group by tx.type
                union all
                select 'to', tx.type, sum(tx.total_amount)
                  from public.transactions tx
                 where tx.to_account_id = ac.id and tx.deleted_at is null
                 group by tx.type
              ) k) as sums
      from public.accounts ac
  ) z
),
-- User rules: active learned merchant rules per user.
rules as (
  select 'user_rules', count(*), count(*) filter (where is_auto_apply),
         md5(coalesce(string_agg(concat_ws('|', user_id, normalized_payee,
             category, purpose, is_auto_apply), '#'
             order by user_id, normalized_payee, id), '')),
         count(distinct user_id)::text
  from public.user_merchants where deleted_at is null
),
nulls as (
  select 'null_checks', 0::bigint,
         (select count(*) from public.transactions where user_id is null
             or total_amount is null or transaction_date is null),
         'tx rows missing user_id/total_amount/transaction_date in live_rows',
         (select count(*) from public.accounts where user_id is null)::text
)
select * from t union all select * from a union all select * from um
union all select * from p union all select * from c union all select * from u
union all select * from i union all select * from g union all select * from gc
union all select * from bal union all select * from rules
union all select * from nulls
order by 1;
