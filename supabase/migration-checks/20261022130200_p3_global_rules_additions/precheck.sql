-- PRECHECK for supabase/migrations/20261022130200_p3_global_rules_additions.sql
-- (Phase 3, data only). READ-ONLY. Every row must show ok = true.

select 'category_slugs_exist' as check_name,
       (select count(*) = 6 from public.category_catalog
         where slug in ('shopping', 'ecommerce', 'utilities', 'bill_payment',
                        'groceries', 'fruits_vegetables')) as ok,
       'foreign keys of the new rows' as detail
union all
select 'brand_triggers_present',
       (select count(*) >= 2 from pg_trigger
         where tgrelid = 'public.merchant_brands'::regclass
           and tgname in ('merchant_brands_normalize', 'merchant_brands_sync_keys')),
       'keys are built by the existing trigger'
union all
select 'normalizer_exists',
       exists (select 1 from pg_proc where proname = 'mcr_normalize_merchant'),
       'used for the duplicate guard'
union all
select 'ekart_absent',
       not exists (select 1 from public.merchant_brands
                    where normalized_name = public.mcr_normalize_merchant('EKART')),
       'false = already added (insert is skipped)'
union all
select 'amazon_bill_pay_absent',
       not exists (select 1 from public.merchant_brands
                    where normalized_name = public.mcr_normalize_merchant('AMAZON BILL PAY')),
       'false = already added (insert is skipped)';
