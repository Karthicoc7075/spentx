-- ============================================================================
-- Admin impersonation: session records + attribution columns + the one
-- server-substituted RPC the Add Transaction flow needs.
--
-- Design (mirrors the planning doc):
--   * NO Supabase Auth session is ever created for the target user. The
--     admin's own session drives every call; the transparent proxy detects
--     an impersonation header, validates the session row, executes with the
--     service role while FORCING the target user's scope server-side, and
--     attributes every call to both the target (user_id) and the real admin
--     (impersonated_by_admin_id). Nothing is silently indistinguishable
--     from the user's own activity.
--   * Deviations: dedicated 'impersonate_start'/'impersonate_end' actions
--     (clearer timeline than overloading view_row); record_id stays text
--     per this schema; sessions also expire after 30 min of inactivity,
--     enforced by the proxy, so a never-ended session cannot act forever.
-- ============================================================================

create table if not exists public.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_active_at timestamptz not null default now()
);

create index if not exists admin_impersonation_sessions_admin_idx
  on public.admin_impersonation_sessions (admin_id, started_at desc);

alter table public.admin_impersonation_sessions enable row level security;

drop policy if exists "admin_impersonation_sessions_admin_only" on public.admin_impersonation_sessions;
create policy "admin_impersonation_sessions_admin_only" on public.admin_impersonation_sessions
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Action vocabulary for the session timeline.
-- ----------------------------------------------------------------------------
alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in ('view_table','view_row','create','update','delete','export','password_reset','impersonate_start','impersonate_end'));

-- Ties every audited mutation made DURING a session to that session, so
-- one impersonation is reviewable as a single coherent timeline.
alter table public.admin_action_logs
  add column if not exists impersonation_session_id uuid;
create index if not exists admin_action_logs_impersonation_idx
  on public.admin_action_logs (impersonation_session_id, created_at desc)
  where impersonation_session_id is not null;

-- Every API call made during impersonation is attributed to BOTH parties.
alter table public.user_api_logs
  add column if not exists impersonated_by_admin_id uuid;
create index if not exists user_api_logs_impersonated_by_idx
  on public.user_api_logs (impersonated_by_admin_id, created_at desc)
  where impersonated_by_admin_id is not null;

-- ----------------------------------------------------------------------------
-- Session lifecycle RPCs.
-- ----------------------------------------------------------------------------
create or replace function public.admin_start_impersonation(p_target_user_id uuid)
returns uuid as $$
declare
  v_session_id uuid;
begin
  perform public.require_admin();

  if p_target_user_id = auth.uid() then
    raise exception 'cannot impersonate yourself';
  end if;
  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception 'target user not found';
  end if;

  insert into public.admin_impersonation_sessions (admin_id, target_user_id)
  values (auth.uid(), p_target_user_id)
  returning id into v_session_id;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id, impersonation_session_id)
  values (auth.uid(), 'impersonate_start', 'admin_impersonation_sessions',
          v_session_id::text, p_target_user_id, v_session_id);

  return v_session_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_start_impersonation(uuid) to authenticated;
revoke execute on function public.admin_start_impersonation(uuid) from public, anon;

create or replace function public.admin_end_impersonation(p_session_id uuid)
returns void as $$
declare
  v_target uuid;
begin
  perform public.require_admin();

  update public.admin_impersonation_sessions
  set ended_at = now()
  where id = p_session_id and admin_id = auth.uid() and ended_at is null
  returning target_user_id into v_target;

  if v_target is not null then
    insert into public.admin_action_logs
      (admin_id, action, table_name, record_id, target_user_id, impersonation_session_id)
    values (auth.uid(), 'impersonate_end', 'admin_impersonation_sessions',
            p_session_id::text, v_target, p_session_id);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_end_impersonation(uuid) to authenticated;
revoke execute on function public.admin_end_impersonation(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- Impersonation variant of create_transaction_with_splits. The original is
-- SECURITY INVOKER and scopes to auth.uid(), which is null for the service
-- role — so the proxy rewrites impersonated calls to this function and
-- injects p_user_id = the session's target itself (never a client value).
-- Executable ONLY by the service role: all client-facing roles are revoked.
-- ----------------------------------------------------------------------------
create or replace function public.impersonation_create_transaction_with_splits(
  p_user_id uuid,
  p_transaction jsonb,
  p_splits jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, status, has_splits, tags, outing_id
  )
  select
    p_user_id,
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
    (p_transaction->>'totalAmount')::numeric,
    p_transaction->>'type',
    coalesce(p_transaction->>'paymentMethod', 'UPI'),
    coalesce(p_transaction->>'source', 'manual'),
    coalesce(p_transaction->>'entrySource', 'manual'),
    (p_transaction->>'transactionDate')::timestamptz,
    p_transaction->>'monthKey',
    p_transaction->>'description',
    p_transaction->>'note',
    p_transaction->>'reference',
    p_transaction->>'referenceId',
    coalesce(p_transaction->>'status', 'completed'),
    jsonb_array_length(p_splits) > 1,
    array(select jsonb_array_elements_text(coalesce(p_transaction->'tags', '[]'::jsonb))),
    nullif(p_transaction->>'outingId', '')::uuid
  returning id into v_transaction_id;

  insert into public.transaction_splits (
    transaction_id, user_id, purpose_id, category_id, contributor_id, outing_id, amount, note
  )
  select
    v_transaction_id,
    p_user_id,
    (s->>'purposeId')::uuid,
    s->>'categoryId',
    nullif(s->>'contributorId', '')::uuid,
    nullif(s->>'outingId', '')::uuid,
    (s->>'amount')::numeric,
    s->>'note'
  from jsonb_array_elements(p_splits) s;

  return v_transaction_id;
end;
$$ language plpgsql security definer;

revoke execute on function public.impersonation_create_transaction_with_splits(uuid, jsonb, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Session timeline in the Action Log viewer: extend the reader with a
-- session filter (signature changes, so drop the old overload first).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_action_logs(integer, integer, text, uuid, uuid);

create or replace function public.admin_list_action_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null,
  p_admin_id uuid default null,
  p_target_user_id uuid default null,
  p_impersonation_session_id uuid default null
) returns jsonb as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_result
  from (
    select to_jsonb(l) || jsonb_build_object(
      'admin_email', au.email,
      'admin_name', au.name,
      'target_email', tu.email,
      'target_name', tu.name
    ) as row_json
    from public.admin_action_logs l
    left join public.users au on au.id = l.admin_id
    left join public.users tu on tu.id = l.target_user_id
    where (p_action is null or l.action = p_action)
      and (p_admin_id is null or l.admin_id = p_admin_id)
      and (p_target_user_id is null or l.target_user_id = p_target_user_id)
      and (p_impersonation_session_id is null or l.impersonation_session_id = p_impersonation_session_id)
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) sub;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_list_action_logs(integer, integer, text, uuid, uuid, uuid) to authenticated;
revoke execute on function public.admin_list_action_logs(integer, integer, text, uuid, uuid, uuid) from public, anon;

-- Keep the per-user filter working for the new table in the viewer.
create or replace function public.admin_table_user_col(p_table text)
returns text as $$
  select case
    when p_table = 'users' then 'id'
    when p_table in ('purpose_shares','share_links') then 'owner_id'
    when p_table in ('global_settings','mail_templates','sms_template_rules',
                     'sms_detection_rules','sms_block_rules') then null
    when p_table = 'admin_action_logs' then 'target_user_id'
    when p_table = 'admin_impersonation_sessions' then 'target_user_id'
    else 'user_id'
  end;
$$ language sql immutable;

-- Browsable in the Database Viewer (read-only — not in delete/update lists).
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
    'user_api_logs','admin_impersonation_sessions'
  ];
$$ language sql immutable;
