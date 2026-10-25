-- Detection v2 Phase 7: template requests — masked formats of money SMS the
-- phones could not parse, so an admin can add a bank template.
--
-- Additive and non-destructive (new tables + one RPC; nothing dropped,
-- no existing row touched). NOT run automatically: Karthi runs it manually,
-- after 20261025150000_p5_account_bank_subtype.sql.
--
-- Privacy: only the masked text is stored (every digit is '#', amounts /
-- accounts / refs / names are placeholders). The RPC refuses any text that
-- still has a digit. No raw SMS, no amount, no account number.
--
-- Rollback (only with approval): drop function public.upsert_template_request;
-- drop table public.sms_template_request_reporters; drop table public.sms_template_requests;

create table if not exists public.sms_template_requests (
  id uuid primary key default gen_random_uuid(),
  format_hash text not null unique
    check (format_hash ~ '^[0-9a-f]{64}$'),
  masked_text text not null
    check (char_length(masked_text) between 1 and 1000 and masked_text !~ '[0-9]'),
  bank text not null default '' check (char_length(bank) <= 64),
  sender text not null default '' check (char_length(sender) <= 64),
  count integer not null default 1 check (count >= 0),
  user_count integer not null default 1 check (user_count >= 0),
  status text not null default 'new' check (status in ('new', 'added', 'ignored')),
  created_by uuid references auth.users (id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (format, user): counts are idempotent (a re-send never adds
-- twice) and one phone cannot inflate a format.
create table if not exists public.sms_template_request_reporters (
  request_id uuid not null references public.sms_template_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  count integer not null default 1 check (count between 0 and 1000),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists sms_template_requests_status_count_idx
  on public.sms_template_requests (status, count desc);
create index if not exists sms_template_request_reporters_user_idx
  on public.sms_template_request_reporters (user_id, first_seen);

alter table public.sms_template_requests enable row level security;
alter table public.sms_template_request_reporters enable row level security;

-- Users: insert their own request only (no read, update or delete).
drop policy if exists "template requests insert own" on public.sms_template_requests;
create policy "template requests insert own" on public.sms_template_requests
  for insert to authenticated with check (created_by = auth.uid());

-- Admins: read and set status.
drop policy if exists "template requests admin read" on public.sms_template_requests;
create policy "template requests admin read" on public.sms_template_requests
  for select to authenticated using (public.is_admin());
drop policy if exists "template requests admin update" on public.sms_template_requests;
create policy "template requests admin update" on public.sms_template_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "template reporters admin read" on public.sms_template_request_reporters;
create policy "template reporters admin read" on public.sms_template_request_reporters
  for select to authenticated using (public.is_admin());

-- Phone outbox -> server. p_count is the phone's running count for this
-- format (re-sent after it grows), so the reporter row keeps the highest.
create or replace function public.upsert_template_request(
  p_format_hash text,
  p_masked_text text,
  p_bank text default '',
  p_sender text default '',
  p_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_count integer := least(greatest(coalesce(p_count, 1), 1), 1000);
  v_hash text := lower(trim(coalesce(p_format_hash, '')));
  v_text text := trim(coalesce(p_masked_text, ''));
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad format hash' using errcode = '22023';
  end if;
  if char_length(v_text) not between 1 and 1000 or v_text ~ '[0-9]' then
    raise exception 'text must be masked' using errcode = '22023';
  end if;
  -- At most 200 new formats per user per day.
  if (select count(*) from public.sms_template_request_reporters
       where user_id = v_uid and first_seen > now() - interval '1 day') >= 200
     and not exists (
       select 1 from public.sms_template_request_reporters r
       join public.sms_template_requests q on q.id = r.request_id
       where r.user_id = v_uid and q.format_hash = v_hash) then
    return;
  end if;

  insert into public.sms_template_requests (format_hash, masked_text, bank, sender, count, user_count, created_by)
  values (v_hash, v_text, left(coalesce(p_bank, ''), 64), left(coalesce(p_sender, ''), 64), 0, 0, v_uid)
  on conflict (format_hash) do update set last_seen = now()
  returning id into v_id;

  insert into public.sms_template_request_reporters (request_id, user_id, count)
  values (v_id, v_uid, v_count)
  on conflict (request_id, user_id) do update
    set count = greatest(public.sms_template_request_reporters.count, excluded.count),
        last_seen = now();

  update public.sms_template_requests q set
    count = s.total,
    user_count = s.users,
    last_seen = now(),
    updated_at = now()
    -- status is left to the admin (an ignored format stays ignored).
  from (
    select sum(count)::integer as total, count(*)::integer as users
    from public.sms_template_request_reporters where request_id = v_id
  ) s
  where q.id = v_id;
end;
$$;

revoke all on function public.upsert_template_request(text, text, text, text, integer) from public, anon;
grant execute on function public.upsert_template_request(text, text, text, text, integer) to authenticated;

comment on table public.sms_template_requests is
  'Detection v2 Phase 7: masked SMS formats phones could not parse (no raw text, no digits). Admin review queue.';
