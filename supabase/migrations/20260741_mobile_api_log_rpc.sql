-- ============================================================================
-- RPC for mobile API logging.
--
-- The user_api_logs table blocks all client inserts via RLS by design.
-- The web app uses the service role key via the Next.js proxy to bypass RLS.
-- The mobile app has no server proxy, so it needs a dedicated RPC that runs
-- with SECURITY DEFINER to bypass the insert block, while validating that the
-- caller can only insert rows attributed to themselves.
-- ============================================================================

create or replace function public.log_mobile_api_call(
  p_api_type text,
  p_api_name text,
  p_method text default null,
  p_status text default 'success',
  p_status_code integer default null,
  p_error_message text default null,
  p_duration_ms integer default null,
  p_request_size_bytes integer default null,
  p_response_size_bytes integer default null,
  p_platform text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
begin
  -- Must be authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  -- Look up user details for denormalized snapshot
  select email, name into v_user_email, v_user_name
  from public.users
  where id = v_user_id;

  insert into public.user_api_logs (
    user_id,
    user_email,
    user_name,
    actor_role,
    api_type,
    api_name,
    method,
    status,
    status_code,
    error_message,
    duration_ms,
    request_size_bytes,
    response_size_bytes,
    platform,
    app_version
  ) values (
    v_user_id,
    v_user_email,
    v_user_name,
    'user',
    p_api_type,
    left(p_api_name, 200),
    p_method,
    p_status,
    p_status_code,
    left(p_error_message, 500),
    p_duration_ms,
    p_request_size_bytes,
    p_response_size_bytes,
    p_platform,
    left(p_app_version, 50)
  );
end;
$$;

grant execute on function public.log_mobile_api_call(text, text, text, text, integer, text, integer, integer, integer, text, text) to authenticated;
revoke execute on function public.log_mobile_api_call(text, text, text, text, integer, text, integer, integer, integer, text, text) from public, anon;
