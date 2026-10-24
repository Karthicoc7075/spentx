-- VERIFY after 20261022130200_p3_global_rules_additions.sql. READ-ONLY.

select 'ekart_brand_and_keys' as check_name,
       exists (select 1 from public.merchant_brands b
                join public.merchant_brand_keys k on k.brand_id = b.id
               where b.source = 'phase3' and b.canonical_name = 'Ekart'
                 and k.key_type = 'upi' and k.key = 'ekart') as ok
union all
select 'amazon_bill_pay_brand',
       exists (select 1 from public.merchant_brands
                where source = 'phase3' and canonical_name = 'Amazon Bill Pay'
                  and category_slug = 'utilities' and is_active)
union all
select 'mandi_market_rules',
       (select count(*) = 3 from public.merchant_keyword_rules
         where keyword in ('sabzi mandi', 'vegetable mandi', 'fruit mandi')
           and category_slug = 'groceries' and is_active)
union all
select 'rules_version_bumped',
       (select bool_and(updated_at > now() - interval '1 hour') from public.rules_version
         where table_name in ('merchant_brands', 'merchant_keyword_rules'));
