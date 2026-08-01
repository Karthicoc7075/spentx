-- Multi-UPI per friend (GPay / PhonePe / bank handles, etc.).
-- Schema already had friends.upi + friends.upi_ids; this hardens defaults,
-- backfills, and lookup indexes.

alter table public.friends
  alter column upi_ids set default '{}';

update public.friends
set upi_ids = '{}'
where upi_ids is null;

alter table public.friends
  alter column upi_ids set not null;

comment on column public.friends.upi is
  'Primary / preferred UPI VPA (usually first of upi_ids).';
comment on column public.friends.upi_ids is
  'All UPI handles for this friend across apps (gpay, phonepe, bank, etc.).';

-- Merge single upi into upi_ids when missing from the array.
update public.friends f
set upi_ids = array_append(coalesce(f.upi_ids, '{}'), btrim(f.upi))
where f.upi is not null
  and btrim(f.upi) <> ''
  and not exists (
    select 1
    from unnest(coalesce(f.upi_ids, '{}')) as u
    where lower(btrim(u)) = lower(btrim(f.upi))
  );

-- Primary upi from first array entry when empty.
update public.friends
set upi = upi_ids[1]
where (upi is null or btrim(upi) = '')
  and cardinality(upi_ids) > 0;

create index if not exists friends_user_upi_idx
  on public.friends (user_id, upi)
  where upi is not null and btrim(upi) <> '';

create index if not exists friends_upi_ids_gin_idx
  on public.friends using gin (upi_ids);
