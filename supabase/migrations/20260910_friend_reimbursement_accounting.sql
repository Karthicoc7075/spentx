-- Friend repayments are ledger movements, not earned income.
-- Keep them as income-typed rows for correct account balance direction, while
-- tagging them so every web calculation can classify them as reimbursements.

update public.transactions as t
set tags = array_append(coalesce(t.tags, '{}'::text[]), 'reimbursement')
where t.type = 'income'
  and (
    exists (
      select 1
      from public.transaction_splits as ts
      where ts.transaction_id = t.id
        and lower(trim(coalesce(ts.category_id, ''))) in
          ('friend returns', 'friend repayment', 'repayment')
    )
    or exists (
      select 1
      from unnest(coalesce(t.tags, '{}'::text[])) as existing_tag
      where existing_tag in ('settlement:receive', 'friend_return', 'friend-return')
    )
  )
  and not ('reimbursement' = any(coalesce(t.tags, '{}'::text[])));

-- Older outgoing settlements sometimes used Miscellaneous. Add a stable tag
-- so they are not treated as personal spending after category translation.
update public.transactions as t
set tags = array_append(coalesce(t.tags, '{}'::text[]), 'settlement')
where t.type = 'expense'
  and (
    lower(trim(coalesce(t.merchant, ''))) like 'settlement:%'
    or lower(trim(coalesce(t.merchant, ''))) like 'settlement %'
  )
  and not ('settlement' = any(coalesce(t.tags, '{}'::text[])));
