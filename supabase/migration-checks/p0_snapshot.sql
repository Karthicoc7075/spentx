-- SpentX — BEFORE / AFTER snapshot for the two Phase 0 migrations.
-- READ-ONLY (one SELECT). Run it before the first migration and again
-- after the second one. Every row must be IDENTICAL both times.
--
-- Only the columns that exist TODAY are fingerprinted, listed by name, so
-- the new Phase 0 columns do not change the result. If a value differs,
-- something changed existing data: stop and send both results.

with
fp(tbl, rows, fingerprint) as (
  select 'transactions', count(*), md5(coalesce(string_agg(row(
           id, user_id, schema_version, account_id, merchant, total_amount,
           type, payment_method, source, entry_source, transaction_date,
           month_key, description, note, receipt_url, reference, reference_id,
           status, has_splits, tags, outing_id, created_at, updated_at, upi,
           raw_identifier, is_active, deleted_at, title, has_items,
           to_account_id, transfer_type, detection_key, is_auto_detected,
           deleted_by)::text, '#' order by id), ''))
    from public.transactions
  union all
  select 'transaction_splits', count(*), md5(coalesce(string_agg(row(
           id, transaction_id, user_id, purpose_id, category_id,
           contributor_id, outing_id, amount, note, updated_at)::text, '#'
           order by id), ''))
    from public.transaction_splits
  union all
  select 'accounts', count(*), md5(coalesce(string_agg(row(
           id, user_id, name, type, last4, opening_balance,
           opening_balance_date, purpose_ids, is_default, can_delete,
           is_active, needs_rename, deleted_at, deleted_by, created_at,
           updated_at)::text, '#' order by id), ''))
    from public.accounts
  union all
  select 'account_purposes', count(*), md5(coalesce(string_agg(row(
           id, user_id, account_id, purpose_id, created_at)::text, '#'
           order by id), ''))
    from public.account_purposes
  union all
  select 'purposes', count(*), md5(coalesce(string_agg(row(
           id, user_id, name, color, is_default, can_delete, is_active,
           deleted_at, deleted_by, created_at, icon, updated_at)::text, '#'
           order by id), ''))
    from public.purposes
  union all
  select 'categories', count(*), md5(coalesce(string_agg(row(
           id, user_id, name, type, color, icon, can_delete, is_active,
           deleted_at, deleted_by, created_at, is_investment, updated_at)::text,
           '#' order by id), ''))
    from public.categories
  union all
  select 'user_merchants', count(*), md5(coalesce(string_agg(row(
           id, user_id, payee, normalized_payee, title, purpose, category,
           is_auto_apply, verified_at, created_at, updated_at, is_trusted,
           deleted_at)::text, '#' order by id), ''))
    from public.user_merchants
  union all
  select 'user_merchant_category', count(*), md5(coalesce(string_agg(row(
           id, user_id, normalized_merchant, category_slug, category_name,
           purpose, hits, last_used_at, created_at, updated_at)::text, '#'
           order by id), ''))
    from public.user_merchant_category
  union all
  select 'merchant_brands', count(*), md5(coalesce(string_agg(row(
           id, canonical_name, normalized_name, category_slug, subcategory,
           country, aliases, upi_handles, sms_patterns, mcc, confidence,
           source, is_active, created_at, updated_at)::text, '#' order by id), ''))
    from public.merchant_brands
  union all
  select 'merchant_brand_keys', count(*), md5(coalesce(string_agg(row(
           key, key_type, match_mode, brand_id)::text, '#'
           order by key, key_type, brand_id), ''))
    from public.merchant_brand_keys
  union all
  select 'merchant_keyword_rules', count(*), md5(coalesce(string_agg(row(
           id, keyword, match_type, category_slug, subcategory, priority,
           applies_to, direction, note, is_active, created_at, updated_at)::text,
           '#' order by id), ''))
    from public.merchant_keyword_rules
  union all
  select 'mcc_category_map', count(*), md5(coalesce(string_agg(row(
           mcc, description, category_slug, subcategory, is_mapped, is_active,
           created_at, updated_at)::text, '#' order by mcc), ''))
    from public.mcc_category_map
  union all
  select 'category_catalog', count(*), md5(coalesce(string_agg(row(
           slug, display_name, parent_slug, app_category, txn_type, icon,
           color_hex, sort_order, is_active, created_at, updated_at)::text, '#'
           order by slug), ''))
    from public.category_catalog
),
-- Per account: opening balance + live money in / out (transfers included),
-- i.e. what the balance is built from.
bal as (
  select ac.id,
         ac.opening_balance
         + coalesce(sum(case when tx.type = 'income' and tx.account_id = ac.id
                             then tx.total_amount end), 0)
         - coalesce(sum(case when tx.type in ('expense', 'transfer')
                              and tx.account_id = ac.id
                             then tx.total_amount end), 0)
         + coalesce(sum(case when tx.type = 'transfer' and tx.to_account_id = ac.id
                             then tx.total_amount end), 0) as balance,
         count(tx.id) as tx_rows
    from public.accounts ac
    left join public.transactions tx
      on (tx.account_id = ac.id or tx.to_account_id = ac.id)
     and tx.deleted_at is null
   group by ac.id, ac.opening_balance
)
select tbl as item, rows, fingerprint from fp
union all
select 'balance ' || left(id::text, 8), tx_rows, balance::text from bal
union all
select 'balances_all', count(*),
       md5(coalesce(string_agg(id || '=' || balance, '#' order by id), ''))
  from bal
union all
select 'tx_status_values', count(*),
       coalesce(string_agg(distinct status, ','), '')
  from public.transactions
order by 1;
