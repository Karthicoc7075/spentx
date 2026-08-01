-- Migration: 20260752_friend_returns_category.sql
-- Description: Adds a dedicated "Friend Returns" income category.
--
-- Money a friend pays back is counted as ordinary income (per product
-- decision — no special Settlements exclusion), but it needs its own
-- category so it can still be identified and called out separately in the
-- Income/Expense summary strip (web) and Activity summary card (mobile),
-- instead of being lumped into the generic "Other Income" bucket.
--
-- global_settings.default_categories is the single shared row every user's
-- category list is merged from (see fetchDefaultCategories/fetchCategories
-- in supabase-data.ts) — appending here reaches every existing user without
-- a per-user backfill.

update public.global_settings
set default_categories = default_categories || jsonb_build_array(
  jsonb_build_object(
    'id', 'cat-inc-9',
    'name', 'Friend Returns',
    'type', 'income',
    'color', '#22c55e',
    'icon', 'users',
    'order', 9
  )
)
where id = 'app'
  and not exists (
    select 1
    from jsonb_array_elements(default_categories) elem
    where elem->>'name' = 'Friend Returns'
  );
