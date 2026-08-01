-- Fixes doubled outing expense totals: the auto-add-to-outing pipeline
-- (web's useOutingTransactionSync effect, mobile's SMS auto-add) reads
-- "does an outing_expenses row already exist for this transaction?" and
-- then inserts a new row with a fresh id if not. With no DB constraint
-- tying one transaction to at most one outing_expenses row, two clients
-- racing on the same transaction (e.g. a web tab reconciling while mobile
-- auto-adds the same SMS-detected spend) could both pass that check before
-- either insert landed, producing two expense rows for one real spend —
-- outing totals then show 2x the real amount on every client, since they
-- all just sum whatever rows exist.

-- 1) Collapse existing duplicates: keep the earliest row per
--    (user_id, linked_transaction_id), drop the rest.
delete from public.outing_expenses oe
using (
  select id,
         row_number() over (
           partition by user_id, linked_transaction_id
           order by created_at asc, id asc
         ) as rn
  from public.outing_expenses
  where linked_transaction_id is not null
) ranked
where oe.id = ranked.id
  and ranked.rn > 1;

-- 2) Prevent recurrence: a transaction can back at most one outing expense.
--    Manual expenses (linked_transaction_id null) are unaffected.
create unique index if not exists outing_expenses_user_linked_tx_uidx
  on public.outing_expenses (user_id, linked_transaction_id)
  where linked_transaction_id is not null;
