-- Add more default categories to category_catalog (insert only; safe to run twice).
insert into public.category_catalog
  (slug, display_name, parent_slug, app_category, txn_type, icon, color_hex, sort_order, is_active)
values
  -- Expense
  ('subscriptions', 'Subscriptions', null, 'Subscriptions', 'expense', 'subscriptions',  '#7E57C2', 12, true),
  ('insurance',     'Insurance',     null, 'Insurance',     'expense', 'shield',         '#26A69A', 13, true),
  ('fitness',       'Fitness',       null, 'Fitness',       'expense', 'fitness_center', '#FF8A65', 14, true),
  -- Income
  ('freelancing',   'Freelancing',   'income', 'Freelancing',   'income', 'laptop_mac',     '#43A047', 103, true),
  ('business_income','Business',     'income', 'Business',      'income', 'storefront',     '#43A047', 104, true),
  ('refund',        'Refund',        'income', 'Refund',        'income', 'undo',           '#43A047', 105, true),
  ('cashback',      'Cashback',      'income', 'Cashback',      'income', 'redeem',         '#43A047', 106, true),
  ('bonus',         'Bonus',         'income', 'Bonus',         'income', 'emoji_events',   '#43A047', 107, true),
  ('rental_income', 'Rental Income', 'income', 'Rental Income', 'income', 'home_work',      '#43A047', 108, true),
  ('gift_received', 'Gift Received', 'income', 'Gift Received', 'income', 'card_giftcard',  '#43A047', 109, true)
on conflict (slug) do nothing;
