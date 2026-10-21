-- POST-STEP for 20261004000100_protect_user_roles.sql (S5b).
-- Running that file as-is re-creates the missing trigger (the fix) but also
-- replaces protect_user_role() with its OLDER body (allow-list without
-- supabase_auth_admin). Run this right after it to put back the body that is
-- live today (from 20261011_admin_fixes.sql), captured read-only 2026-10-21 ~14:25 IST.
begin;
set local search_path = public, extensions;
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
