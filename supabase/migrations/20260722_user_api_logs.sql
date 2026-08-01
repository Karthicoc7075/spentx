-- ============================================================================
-- Universal API call logging: user_api_logs + admin reader RPCs + retention.
--
-- Every REST/RPC/auth call from the browser now flows through the Next.js
-- transparent proxy (/api/proxy/[...path]), which writes one row here per
-- call using the SERVICE ROLE client — the one deliberate, narrow use of the
-- service role for writes in this system. Route handlers log their own
-- invocations directly. Distinct from admin_action_logs on purpose: that
-- table records which admin action touched which data; this one records the
-- raw API traffic itself, for every actor.
--
-- Deviations from the planning doc, deliberate and documented:
--   * api_type additionally allows 'storage' and 'realtime' — storage
--     uploads flow through the same proxy and realtime subscription starts
--     are logged once per subscribe; mislabeling either as 'route_handler'
--     would make filtering worse.
--   * Timestamps are stored as timestamptz (UTC) per the doc; IST rendering
--     is display-layer only.
-- ============================================================================

create table if not exists public.user_api_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                       -- no FK: log rows must outlive accounts (same reasoning as admin_action_logs)
  user_email text,                    -- denormalized snapshot at call time
  user_name text,                     -- denormalized snapshot at call time
  actor_role text not null check (actor_role in ('user','admin','anonymous')),
  api_type text not null check (api_type in ('rest_select','rest_insert','rest_update','rest_delete','rpc','route_handler','auth','storage','realtime')),
  api_name text not null,             -- table for rest_*, function for rpc, path for route_handler/auth/storage
  method text,
  status text not null check (status in ('success','error')),
  status_code integer,
  error_message text,
  request_size_bytes integer,
  response_size_bytes integer,
  duration_ms integer,
  ip_address text,
  device text,
  browser text,
  os text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_api_logs_user_idx on public.user_api_logs (user_id, created_at desc);
create index if not exists user_api_logs_created_idx on public.user_api_logs (created_at desc);
create index if not exists user_api_logs_status_idx on public.user_api_logs (status, created_at desc);

alter table public.user_api_logs enable row level security;

-- Admin-only read. Request-level metadata (IP, user-agent) is more sensitive
-- than the user-facing activity feed — regular users get no access, not even
-- to their own rows.
drop policy if exists "user_api_logs_select_admin" on public.user_api_logs;
create policy "user_api_logs_select_admin" on public.user_api_logs
  for select using (public.is_admin());

-- No client-side insert path, ever. The service-role proxy bypasses RLS;
-- this false policy is a defense-in-depth statement of intent.
drop policy if exists "user_api_logs_insert_none_from_client" on public.user_api_logs;
create policy "user_api_logs_insert_none_from_client" on public.user_api_logs
  for insert with check (false);
-- Deliberately no update/delete policies — append-only, like the other logs.

-- ----------------------------------------------------------------------------
-- Dedicated filtered reader (multiple filter dimensions justify a dedicated
-- RPC over the generic admin_list_table).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_api_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_email_search text default null,
  p_actor_role text default null,
  p_status text default null,
  p_api_type text default null
) returns jsonb as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_result
  from (
    select *
    from public.user_api_logs
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
      and (p_email_search is null
           or user_email ilike '%' || p_email_search || '%'
           or user_name ilike '%' || p_email_search || '%')
      and (p_actor_role is null or actor_role = p_actor_role)
      and (p_status is null or status = p_status)
      and (p_api_type is null or api_type = p_api_type)
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) l;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_list_api_logs(integer, integer, timestamptz, timestamptz, text, text, text, text) to authenticated;
revoke execute on function public.admin_list_api_logs(integer, integer, timestamptz, timestamptz, text, text, text, text) from public, anon;

create or replace function public.admin_count_api_logs(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_email_search text default null,
  p_actor_role text default null,
  p_status text default null,
  p_api_type text default null
) returns bigint as $$
declare
  v_count bigint;
begin
  perform public.require_admin();

  select count(*) into v_count
  from public.user_api_logs
  where (p_from is null or created_at >= p_from)
    and (p_to is null or created_at <= p_to)
    and (p_email_search is null
         or user_email ilike '%' || p_email_search || '%'
         or user_name ilike '%' || p_email_search || '%')
    and (p_actor_role is null or actor_role = p_actor_role)
    and (p_status is null or status = p_status)
    and (p_api_type is null or api_type = p_api_type);

  return v_count;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_count_api_logs(timestamptz, timestamptz, text, text, text, text) to authenticated;
revoke execute on function public.admin_count_api_logs(timestamptz, timestamptz, text, text, text, text) from public, anon;

-- Make the table browsable in the admin Database Viewer too (read-only:
-- it is NOT added to the delete/update allow-lists).
create or replace function public.admin_allowed_tables()
returns text[] as $$
  select array[
    'users','accounts','purposes','categories','contributors',
    'transactions','transaction_splits','monthly_plans','budget_templates',
    'smart_views','friends','outings','outing_expenses','settlements',
    'purpose_shares','share_links','share_access_logs','audit_logs',
    'activity_logs','backup_history','account_balance_history',
    'global_settings','mail_templates','reflections','smart_alerts',
    'income_streams','income_targets','savings_goals','projector_settings',
    'ai_chat_messages','ai_insights','sms_template_rules',
    'sms_detection_rules','sms_block_rules','admin_action_logs',
    'user_api_logs'
  ];
$$ language sql immutable;

-- ----------------------------------------------------------------------------
-- Retention: 90 days (confirmed). Scheduled via pg_cron when available;
-- if pg_cron isn't enabled on this Supabase project the DO block below is a
-- no-op and cleanup can be run manually/externally via this same function.
-- ----------------------------------------------------------------------------
create or replace function public.cleanup_user_api_logs()
returns integer as $$
declare
  v_deleted integer;
begin
  delete from public.user_api_logs where created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$ language plpgsql security definer;

-- Not granted to authenticated/anon at all — service role / cron only.
revoke execute on function public.cleanup_user_api_logs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-user-api-logs-daily',
      '30 21 * * *',  -- 21:30 UTC = 03:00 IST daily
      $cron$select public.cleanup_user_api_logs()$cron$
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;
