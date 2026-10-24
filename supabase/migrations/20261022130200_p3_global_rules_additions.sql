-- Phase 3 item 14: global merchant rule additions (NOT RUN; data only,
-- apply manually after the precheck). Admin Panel tables, so every user
-- gets them at the next rule sync. Saved transactions are not changed.
--
-- * EKART (Flipkart's delivery arm; cash-on-delivery / UPI to the courier)
--   -> Shopping / Online Shopping.
-- * Amazon Bill Pay (Amazon Pay bill payments) -> Utilities / Bill Payment.
--   Plain "Amazon Pay" stays as it is (wallet, uncategorised).
-- * "mandi" already exists as a word rule (Food & Dining / restaurants).
--   Added: "sabzi mandi" / "vegetable mandi" / "fruit mandi" market wording
--   -> Groceries / Fruits & Vegetables (higher priority than the dish rule).
--
-- merchant_brand_keys rows are created by the existing
-- mcr_brand_sync_keys trigger; rules_version is bumped by the existing
-- version triggers.

begin;

insert into public.merchant_brands
  (canonical_name, normalized_name, category_slug, subcategory, confidence,
   aliases, upi_handles, country, is_active, source)
select v.canonical_name, v.normalized_name, v.category_slug, v.subcategory,
       v.confidence, v.aliases, v.upi_handles, 'IN', true, 'phase3'
from (values
  ('Ekart', 'EKART', 'shopping', 'ecommerce', 0.85::numeric,
   array['Ekart Logistics', 'Instakart Services', 'EKART LOGISTICS']::text[],
   array['ekart']::text[]),
  ('Amazon Bill Pay', 'AMAZON BILL PAY', 'utilities', 'bill_payment', 0.9::numeric,
   array['Amazon Pay Bill Payment', 'AMAZON BILLPAY', 'Amazon Bill Payment']::text[],
   array[]::text[])
) as v(canonical_name, normalized_name, category_slug, subcategory, confidence,
       aliases, upi_handles)
where not exists (select 1 from public.merchant_brands b
                   where b.normalized_name = public.mcr_normalize_merchant(v.normalized_name));

insert into public.merchant_keyword_rules
  (keyword, match_type, category_slug, subcategory, priority, applies_to,
   direction, is_active)
values
  ('sabzi mandi', 'contains', 'groceries', 'fruits_vegetables', 75, 'merchant', 'any', true),
  ('vegetable mandi', 'contains', 'groceries', 'fruits_vegetables', 75, 'merchant', 'any', true),
  ('fruit mandi', 'contains', 'groceries', 'fruits_vegetables', 75, 'merchant', 'any', true)
on conflict (keyword, match_type, applies_to) do nothing;

commit;
