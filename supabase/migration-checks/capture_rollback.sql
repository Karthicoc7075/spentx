-- SpentX — capture rollback statements for the objects a migration touches.
-- READ-ONLY (only catalog reads). Run BEFORE the migration; save the
-- "stmt" column, in "ord" order, as rollback.sql for that migration.
-- Fill the five arrays below (names without schema; everything is public).
with params as (
  select
    array[/* e.g. 'handle_new_user' */ '']::text[]       as funcs,
    array['']::text[]    as triggers,
    array['']::text[] as policy_tables,
    array['']::text[] as constraints,
    array['']::text[]  as acl_tables
),
fn as (
  select p.oid, p.proname,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
         p.proacl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname::text = any (array(select unnest(funcs) from params))
),
stmts as (
  -- 1. functions: exact current body (CREATE OR REPLACE), then their grants
  select 10 as grp, fn.proname as obj,
         pg_get_functiondef(fn.oid) || ';' as stmt
  from fn
  union all
  select 11, fn.proname,
         'revoke all on function ' || fn.sig ||
         ' from public, anon, authenticated, service_role;' ||
         coalesce((
           select string_agg(' grant execute on function ' || fn.sig || ' to ' ||
                  case when a.grantee = 0 then 'public'
                       else quote_ident(r.rolname) end || ';', '')
           from aclexplode(fn.proacl) a
           left join pg_roles r on r.oid = a.grantee
           where a.privilege_type = 'EXECUTE'
             and coalesce(r.rolname, 'public') in
                 ('public', 'anon', 'authenticated', 'service_role')
         ), '')
  from fn
  where fn.proacl is not null
  union all
  -- 2. triggers by name: drop + exact current definition
  select 20, t.tgname,
         'drop trigger if exists ' || quote_ident(t.tgname) || ' on ' ||
         t.tgrelid::regclass::text || '; ' || pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname::text = any (array(select unnest(triggers) from params))
  union all
  -- 3. RLS: on/off + every policy on the listed tables
  select 30, c.relname,
         'alter table public.' || quote_ident(c.relname) ||
         case when c.relrowsecurity then ' enable' else ' disable' end ||
         ' row level security;'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname::text = any (array(select unnest(policy_tables) from params))
  union all
  select 31, pol.tablename,
         'drop policy if exists ' || quote_ident(pol.policyname) ||
         ' on public.' || quote_ident(pol.tablename) || '; create policy ' ||
         quote_ident(pol.policyname) || ' on public.' ||
         quote_ident(pol.tablename) || ' as ' || pol.permissive ||
         ' for ' || pol.cmd || ' to ' || array_to_string(pol.roles, ', ') ||
         coalesce(' using (' || pol.qual || ')', '') ||
         coalesce(' with check (' || pol.with_check || ')', '') || ';'
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename::text = any (array(select unnest(policy_tables) from params))
  union all
  -- 4. named CHECK/FK/UNIQUE constraints: exact current definition
  select 40, con.conname,
         'alter table ' || con.conrelid::regclass::text ||
         ' drop constraint if exists ' || quote_ident(con.conname) ||
         '; alter table ' || con.conrelid::regclass::text ||
         ' add constraint ' || quote_ident(con.conname) || ' ' ||
         pg_get_constraintdef(con.oid) || ';'
  from pg_constraint con
  join pg_namespace n on n.oid = con.connamespace and n.nspname = 'public'
  where con.conname::text = any (array(select unnest(constraints) from params))
  union all
  -- 5. table / view grants for anon, authenticated, service_role
  select 50, c.relname,
         'revoke all on public.' || quote_ident(c.relname) ||
         ' from anon, authenticated;' ||
         coalesce((
           select string_agg(' grant ' || lower(a.privilege_type) ||
                  ' on public.' || quote_ident(c.relname) || ' to ' ||
                  quote_ident(r.rolname) || ';', '' order by r.rolname, a.privilege_type)
           from aclexplode(c.relacl) a
           join pg_roles r on r.oid = a.grantee
           where r.rolname in ('anon', 'authenticated')
         ), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname::text = any (array(select unnest(acl_tables) from params))
)
select row_number() over (order by grp, obj, stmt) as ord, grp, obj, stmt
from stmts
order by grp, obj, stmt;
