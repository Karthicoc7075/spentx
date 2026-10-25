-- Smart detection: "Remember category, purpose & description for this
-- merchant". Stores the remembered description on a user's merchant rule.
--
-- Additive and non-destructive: one nullable column. Existing rows stay
-- NULL (= no description). RLS on user_merchants is unchanged (owner-only).
-- Apps that predate this column keep working; the new app strips
-- `description` and retries when the column is missing (42703 / PGRST204).
--
-- NOT RUN. Run manually in the Supabase SQL editor. Safe to re-run.

alter table public.user_merchants
  add column if not exists description text;
