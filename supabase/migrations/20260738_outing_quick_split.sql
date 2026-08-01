-- Hidden "quick split" outings: created automatically when a normal (non-trip)
-- transaction is split with friends from the Add Transaction form, so the
-- existing outing_expenses/settlements machinery can track who-owes-whom
-- without asking the user to manage a full trip. These must not show up in
-- the regular Outings list or outing pickers.

alter table public.outings
  add column if not exists is_quick_split boolean not null default false;

create index if not exists outings_user_quick_split_idx
  on public.outings (user_id, is_quick_split);
