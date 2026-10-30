-- Template requests v2. Anon and signed-in phones may only call the RPCs.
-- They cannot read or write the tables. Admins (is_admin()) can.
--
-- NOT run automatically. Apply by hand after
-- 20261025170000_p7_sms_template_requests.sql.
--
-- The phone sends a masked format (no digits) and a fake copy (same shape,
-- random values, at most 500 characters). The raw SMS is a separate support
-- table, admin-read only, at most 1000 characters. The device id is hashed
-- here; the raw id is never stored.
--
-- A daily limit or the global cap raises 'limit' (SQLSTATE SX429). The phone
-- keeps that request and tries again the next day.
--
-- Rollback (only with approval):
--   select cron.unschedule(jobid) from cron.job
--     where jobname = 'purge-sms-template-requests-daily';
--   drop function public.purge_sms_template_and_support();
--   drop function public.submit_support_sms(text, text, text, text);
--   drop function public.upsert_template_request(text, text, text, text, integer, text, text);
--   drop function public.template_fake_fits_masked(text, text);
--   drop table public.sms_support_requests;
--   drop table public.sms_outbound_daily;
--   drop table public.sms_template_request_devices;
--   alter table public.sms_template_requests drop column if exists fake_text;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------

alter table public.sms_template_requests
  add column if not exists fake_text text not null default '';

alter table public.sms_template_requests
  drop constraint if exists sms_template_requests_fake_text_len;
alter table public.sms_template_requests
  add constraint sms_template_requests_fake_text_len
  check (char_length(fake_text) <= 500);

-- One row per (format, device). Anon has a null user_id. The hash is
-- sha256(device id); the id itself is not stored.
create table if not exists public.sms_template_request_devices (
  request_id uuid not null references public.sms_template_requests (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references auth.users (id) on delete set null,
  count integer not null default 1 check (count >= 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (request_id, device_hash)
);

-- One row per accepted send. Daily limits and the 30-day purge read this.
create table if not exists public.sms_outbound_daily (
  id bigint generated always as identity primary key,
  day date not null,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid,
  kind text not null check (kind in ('template', 'support')),
  created_at timestamptz not null default now()
);

create index if not exists sms_outbound_daily_device_idx
  on public.sms_outbound_daily (day, device_hash, kind);
create index if not exists sms_outbound_daily_user_idx
  on public.sms_outbound_daily (day, user_id, kind);

-- Full SMS, only after the user taps "Send this SMS to SpentX support".
create table if not exists public.sms_support_requests (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 1000),
  bank text not null default '' check (char_length(bank) <= 64),
  sender text not null default '' check (char_length(sender) <= 64),
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sms_support_requests_created_idx
  on public.sms_support_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- Privileges: no direct table access except admins.
-- The p7 insert policy let any signed-in user insert a row. That path is
-- closed; writes go through the security-definer RPCs only.
-- ---------------------------------------------------------------------------

alter table public.sms_template_requests enable row level security;
alter table public.sms_template_request_reporters enable row level security;
alter table public.sms_template_request_devices enable row level security;
alter table public.sms_outbound_daily enable row level security;
alter table public.sms_support_requests enable row level security;

drop policy if exists "template requests insert own" on public.sms_template_requests;

drop policy if exists "template requests admin delete" on public.sms_template_requests;
create policy "template requests admin delete" on public.sms_template_requests
  for delete to authenticated using (public.is_admin());

drop policy if exists "template reporters admin delete" on public.sms_template_request_reporters;
create policy "template reporters admin delete" on public.sms_template_request_reporters
  for delete to authenticated using (public.is_admin());

drop policy if exists "template devices admin read" on public.sms_template_request_devices;
create policy "template devices admin read" on public.sms_template_request_devices
  for select to authenticated using (public.is_admin());

drop policy if exists "template outbound admin read" on public.sms_outbound_daily;
create policy "template outbound admin read" on public.sms_outbound_daily
  for select to authenticated using (public.is_admin());

drop policy if exists "support sms admin read" on public.sms_support_requests;
create policy "support sms admin read" on public.sms_support_requests
  for select to authenticated using (public.is_admin());

revoke all on table public.sms_template_requests from public, anon, authenticated;
revoke all on table public.sms_template_request_reporters from public, anon, authenticated;
revoke all on table public.sms_template_request_devices from public, anon, authenticated;
revoke all on table public.sms_outbound_daily from public, anon, authenticated;
revoke all on table public.sms_support_requests from public, anon, authenticated;

grant select, update, delete on public.sms_template_requests to authenticated;
grant select, delete on public.sms_template_request_reporters to authenticated;
grant select on public.sms_template_request_devices to authenticated;
grant select on public.sms_outbound_daily to authenticated;
grant select on public.sms_support_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Same shape check as SmsFaker.fitsMasked. Empty fake text is allowed
-- (the phone sends only the masked line when the copy would not fit).
-- ---------------------------------------------------------------------------

create or replace function public.template_fake_fits_masked(
  p_fake text,
  p_masked text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_fake text;
  v_masked text;
  v_parts text[];
  n integer;
  v_pos integer;
  v_idx integer;
  i integer;
  piece text;
  last_piece text;
  last_at integer;
begin
  if p_fake is null or length(btrim(p_fake)) = 0 then
    return true;
  end if;
  v_fake := btrim(regexp_replace(p_fake, '\s+', ' ', 'g'));
  v_fake := regexp_replace(v_fake, '[0-9]', '#', 'g');
  v_masked := btrim(regexp_replace(coalesce(p_masked, ''), '\s+', ' ', 'g'));
  if v_masked = '' or v_masked ~ '[0-9]' then
    return false;
  end if;
  v_parts := regexp_split_to_array(
    v_masked,
    '<(?:ACCT|BAL|AMT|REF|UPI|URL|NAME|DATE|TIME|NUM)>'
  );
  n := coalesce(array_length(v_parts, 1), 0);
  if n = 0 then
    return false;
  end if;
  if n = 1 then
    return v_fake = v_masked;
  end if;
  if length(v_parts[1]) > 0
     and left(v_fake, length(v_parts[1])) is distinct from v_parts[1] then
    return false;
  end if;
  -- v_pos is the 0-based index just after the previous literal, matching
  -- SmsFaker.fitsMasked. The next literal must start at least one character
  -- later, so a token always stands for something.
  v_pos := length(v_parts[1]);
  for i in 2 .. n - 1 loop
    piece := v_parts[i];
    if piece = '' then
      v_pos := v_pos + 1;
      if v_pos > length(v_fake) then
        return false;
      end if;
    else
      if v_pos + 1 > length(v_fake) then
        return false;
      end if;
      v_idx := position(piece in substring(v_fake from (v_pos + 2)));
      if v_idx = 0 then
        return false;
      end if;
      v_pos := v_pos + v_idx + length(piece);
    end if;
  end loop;
  last_piece := v_parts[n];
  if last_piece = '' then
    return length(v_fake) >= v_pos + 1;
  end if;
  if right(v_fake, length(last_piece)) is distinct from last_piece then
    return false;
  end if;
  last_at := length(v_fake) - length(last_piece);
  return last_at >= v_pos + 1;
end;
$$;

revoke all on function public.template_fake_fits_masked(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared limit check. Raises 'limit' / SX429 and writes nothing.
-- Anon: 5 per device per day. Signed in: 10 per user per day, and 10 per
-- device per day (earlier anon sends on that device count). Plus one global
-- cap for every phone and both kinds.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_template_request(
  p_format_hash text,
  p_masked_text text,
  p_bank text default '',
  p_sender text default '',
  p_count integer default 1,
  p_fake_text text default '',
  p_device_id text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_hash text := lower(btrim(coalesce(p_format_hash, '')));
  v_text text := btrim(coalesce(p_masked_text, ''));
  v_fake text := coalesce(p_fake_text, '');
  v_device text := lower(btrim(coalesce(p_device_id, '')));
  v_devhash text;
  v_day date := (timezone('utc', now()))::date;
  v_device_sends integer;
  v_user_sends integer;
  v_global integer;
begin
  -- p_count is the phone's own tally. Each accepted call adds 1 to the row.
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad format hash' using errcode = '22023';
  end if;
  if char_length(v_text) not between 1 and 1000 or v_text ~ '[0-9]' then
    raise exception 'text must be masked' using errcode = '22023';
  end if;
  if char_length(v_fake) > 500 then
    raise exception 'text must be masked' using errcode = '22023';
  end if;
  if btrim(v_fake) = '' then
    v_fake := '';
  elsif not public.template_fake_fits_masked(v_fake, v_text) then
    raise exception 'text must be masked' using errcode = '22023';
  end if;
  if v_device !~ '^[0-9a-f]{32}$' then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  v_devhash := encode(extensions.digest(convert_to(v_device, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext('sms-outbound-global'));
  perform pg_advisory_xact_lock(hashtext('sms-outbound:' || v_devhash));

  select count(*) into v_global
    from public.sms_outbound_daily
    where day = v_day;
  if v_global >= 5000 then
    raise exception 'limit' using errcode = 'SX429';
  end if;

  select count(*) into v_device_sends
    from public.sms_outbound_daily
    where day = v_day and device_hash = v_devhash and kind = 'template';

  if v_uid is null then
    if v_device_sends >= 5 then
      raise exception 'limit' using errcode = 'SX429';
    end if;
  else
    select count(*) into v_user_sends
      from public.sms_outbound_daily
      where day = v_day and user_id = v_uid and kind = 'template';
    if v_user_sends >= 10 or v_device_sends >= 10 then
      raise exception 'limit' using errcode = 'SX429';
    end if;
  end if;

  insert into public.sms_template_requests (
    format_hash, masked_text, fake_text, bank, sender, count, user_count, created_by
  )
  values (
    v_hash,
    v_text,
    v_fake,
    left(coalesce(p_bank, ''), 64),
    left(coalesce(p_sender, ''), 64),
    1,
    case when v_uid is null then 0 else 1 end,
    v_uid
  )
  on conflict (format_hash) do update set
    count = public.sms_template_requests.count + 1,
    last_seen = now(),
    fake_text = case
      when excluded.fake_text <> '' then excluded.fake_text
      else public.sms_template_requests.fake_text
    end
  returning id into v_id;

  if v_uid is not null then
    insert into public.sms_template_request_reporters (request_id, user_id, count)
    values (v_id, v_uid, 1)
    on conflict (request_id, user_id) do update
      set count = public.sms_template_request_reporters.count + 1,
          last_seen = now();

    update public.sms_template_requests q set
      user_count = (
        select count(*)::integer
        from public.sms_template_request_reporters
        where request_id = v_id
      ),
      updated_at = now()
    where q.id = v_id;
  end if;

  insert into public.sms_template_request_devices (request_id, device_hash, user_id, count)
  values (v_id, v_devhash, v_uid, 1)
  on conflict (request_id, device_hash) do update
    set count = public.sms_template_request_devices.count + 1,
        last_seen = now(),
        user_id = coalesce(excluded.user_id, public.sms_template_request_devices.user_id);

  insert into public.sms_outbound_daily (day, device_hash, user_id, kind)
  values (v_day, v_devhash, v_uid, 'template');
end;
$$;

drop function if exists public.upsert_template_request(text, text, text, text, integer);

revoke all on function public.upsert_template_request(text, text, text, text, integer, text, text)
  from public;
grant execute on function public.upsert_template_request(text, text, text, text, integer, text, text)
  to anon, authenticated;

create or replace function public.submit_support_sms(
  p_text text,
  p_bank text default '',
  p_sender text default '',
  p_device_id text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
  v_device text := lower(btrim(coalesce(p_device_id, '')));
  v_devhash text;
  v_day date := (timezone('utc', now()))::date;
  v_device_sends integer;
  v_user_sends integer;
  v_global integer;
begin
  if char_length(v_text) not between 1 and 1000 then
    raise exception 'text too long' using errcode = '22023';
  end if;
  if v_device !~ '^[0-9a-f]{32}$' then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  v_devhash := encode(extensions.digest(convert_to(v_device, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext('sms-outbound-global'));
  perform pg_advisory_xact_lock(hashtext('sms-outbound:' || v_devhash));

  select count(*) into v_global
    from public.sms_outbound_daily
    where day = v_day;
  if v_global >= 5000 then
    raise exception 'limit' using errcode = 'SX429';
  end if;

  select count(*) into v_device_sends
    from public.sms_outbound_daily
    where day = v_day and device_hash = v_devhash and kind = 'support';

  if v_uid is null then
    if v_device_sends >= 5 then
      raise exception 'limit' using errcode = 'SX429';
    end if;
  else
    select count(*) into v_user_sends
      from public.sms_outbound_daily
      where day = v_day and user_id = v_uid and kind = 'support';
    if v_user_sends >= 10 or v_device_sends >= 10 then
      raise exception 'limit' using errcode = 'SX429';
    end if;
  end if;

  insert into public.sms_support_requests (body, bank, sender, device_hash, user_id)
  values (
    v_text,
    left(coalesce(p_bank, ''), 64),
    left(coalesce(p_sender, ''), 64),
    v_devhash,
    v_uid
  );

  insert into public.sms_outbound_daily (day, device_hash, user_id, kind)
  values (v_day, v_devhash, v_uid, 'support');
end;
$$;

revoke all on function public.submit_support_sms(text, text, text, text) from public;
grant execute on function public.submit_support_sms(text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Drop support SMS older than 30 days and reviewed (added/ignored) template
-- requests with no activity for 30 days. Open ('new') requests are kept. 21:30 UTC = 03:00 IST.
-- Unschedule first when the job is already there (re-run safe).
-- ---------------------------------------------------------------------------

create or replace function public.purge_sms_template_and_support()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sms_template_requests
    where last_seen < now() - interval '30 days'
      and status in ('added', 'ignored'); -- open ('new') requests stay until reviewed
  delete from public.sms_support_requests
    where created_at < now() - interval '30 days';
  delete from public.sms_outbound_daily
    where created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.purge_sms_template_and_support()
  from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select jobid from cron.job
    where jobname = 'purge-sms-template-requests-daily'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'purge-sms-template-requests-daily',
  '30 21 * * *',
  $cron$select public.purge_sms_template_and_support()$cron$
);
