-- ROLLBACK for 20261022130200_p3_global_rules_additions.sql.
-- Removes only the rows this file added (brand keys cascade). Phones drop
-- them at the next rule sync; saved transactions are not changed.

begin;
delete from public.merchant_brands
 where source = 'phase3' and canonical_name in ('Ekart', 'Amazon Bill Pay');
delete from public.merchant_keyword_rules
 where keyword in ('sabzi mandi', 'vegetable mandi', 'fruit mandi')
   and match_type = 'contains' and applies_to = 'merchant';
commit;
