-- Client RLS grants ownership of a profile row, not permission to assign roles.
-- SECURITY INVOKER is intentional: an ordinary REST write runs as
-- authenticated, while the audited admin_update_row SECURITY DEFINER RPC and
-- trusted backend/bootstrap operations retain their privileged database role.
begin;

create or replace function public.protect_user_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
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
$$;

drop trigger if exists protect_user_role on public.users;
create trigger protect_user_role
before insert or update on public.users
for each row execute function public.protect_user_role();

commit;
