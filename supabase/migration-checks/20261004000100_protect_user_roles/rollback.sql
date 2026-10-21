-- ROLLBACK for 20261004000100_protect_user_roles.sql (S5b).
-- Returns live to the state captured 2026-10-21 ~14:25 IST: function body as today, trigger
-- ABSENT. WARNING: that state lets any signed-in user change their own role.
-- Use only if the trigger breaks something, and re-fix immediately.
begin;
set local search_path = public, extensions;
drop trigger if exists protect_user_role on public.users;
CREATE OR REPLACE FUNCTION public.protect_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') then
    if tg_op = 'INSERT' then
      if new.role is distinct from 'user' then
        raise exception 'Only trusted administrators may assign user roles'
          using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role then
      raise exception 'Only trusted administrators may change user roles'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$
;
revoke all on function public.protect_user_role() from public, anon, authenticated, service_role; grant execute on function public.protect_user_role() to authenticated; grant execute on function public.protect_user_role() to anon; grant execute on function public.protect_user_role() to service_role; grant execute on function public.protect_user_role() to public;
commit;
