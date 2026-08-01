-- Add optional display title for saved monthly plans (e.g. "July Smart 2026").
alter table public.monthly_plans
  add column if not exists title text;