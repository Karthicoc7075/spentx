-- Default categories now come ONLY from public.category_catalog (app + web
-- + admin). Active top-level expense/income rows and the children of
-- `income` are the picker defaults, one per txn_type + app_category.
--
-- Run AFTER 20261025200000_category_catalog_more.sql. Safe to run twice.
-- Nothing is deleted; no user rows (public.categories / transactions) are
-- touched. Every change bumps rules_version (existing catalog triggers), so
-- apps re-download the catalog on their next sync.

begin;

-- 1) Rows the old global_settings list had that the catalog lacked.
insert into public.category_catalog
  (slug, display_name, parent_slug, app_category, txn_type, icon, color_hex, sort_order, is_active)
values
  ('goal',               'Goal',                 null,     'Goal',                 'expense', 'flag',     '#5C6BC0', 17,  true),
  ('friend_returns',     'Friend Returns',       'income', 'Friend Returns',       'income',  'users',    '#43A047', 110, true),
  ('freelance_business', 'Freelance / Business', 'income', 'Freelance / Business', 'income',  'work',     '#43A047', 111, true)
on conflict (slug) do nothing;

-- 2) Insurance / Fitness already existed as sub-categories, so the earlier
--    insert skipped them. Make them top-level defaults.
update public.category_catalog
   set parent_slug = null, app_category = 'Insurance', display_name = 'Insurance', sort_order = 13
 where slug = 'insurance'
   and (parent_slug is not null or app_category is distinct from 'Insurance');

update public.category_catalog
   set parent_slug = null, app_category = 'Fitness', display_name = 'Fitness', sort_order = 14
 where slug = 'fitness'
   and (parent_slug is not null or app_category is distinct from 'Fitness');

-- 3) Software subscriptions belong with Subscriptions.
update public.category_catalog
   set app_category = 'Subscriptions'
 where slug = 'software_subscriptions'
   and app_category is distinct from 'Subscriptions';

-- 4) One spelling for gifts (old default name was 'Gifts Received').
update public.category_catalog
   set app_category = 'Gifts Received', display_name = 'Gifts Received'
 where slug = 'gift_received'
   and app_category is distinct from 'Gifts Received';

-- 5) Other Income last in the income list.
update public.category_catalog
   set sort_order = 199
 where slug = 'income' and sort_order <> 199;

commit;

-- 6) Admin editing of the catalog (Admin > Default categories).
--    Admin only, audited; "remove" deactivates (never deletes).
create or replace function public.admin_upsert_category_catalog(
  p_slug text, p_name text, p_type text, p_color text, p_icon text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_old_app text;
  v_name text := trim(coalesce(p_name, ''));
  v_next integer;
begin
  perform public.require_admin();

  if p_type not in ('income', 'expense') then
    raise exception 'type must be income or expense';
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9_]+$' then
    raise exception 'invalid slug';
  end if;
  if v_name = '' or length(v_name) > 60 then
    raise exception 'name is required (max 60 characters)';
  end if;
  if p_color is not null and p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'color must be #RRGGBB';
  end if;

  select to_jsonb(c), c.app_category into v_before, v_old_app
    from public.category_catalog c where c.slug = p_slug;

  if v_before is null then
    select coalesce(max(sort_order), 0) + 1 into v_next
      from public.category_catalog
     where txn_type = p_type
       and (parent_slug is null or parent_slug = 'income')
       and slug <> 'income';

    insert into public.category_catalog
      (slug, display_name, parent_slug, app_category, txn_type, icon, color_hex, sort_order, is_active)
    values
      (p_slug, v_name, case when p_type = 'income' then 'income' end, v_name, p_type,
       nullif(trim(coalesce(p_icon, '')), ''), p_color, v_next, true);
  else
    if (v_before->>'txn_type') is distinct from p_type then
      raise exception 'category % is %, not %', p_slug, v_before->>'txn_type', p_type;
    end if;
    update public.category_catalog
       set display_name = v_name,
           app_category = v_name,
           color_hex    = coalesce(p_color, color_hex),
           icon         = coalesce(nullif(trim(coalesce(p_icon, '')), ''), icon),
           is_active    = true
     where slug = p_slug;
    -- Keep sub-categories that pointed at the old name mapped to the new one.
    if v_old_app is not null and v_old_app <> v_name then
      update public.category_catalog
         set app_category = v_name
       where parent_slug = p_slug and app_category = v_old_app;
    end if;
  end if;

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before, after)
  values (auth.uid(), case when v_before is null then 'create' else 'update' end,
          'category_catalog', p_slug, v_before,
          (select to_jsonb(c) from public.category_catalog c where c.slug = p_slug));
end;
$$;

revoke all on function public.admin_upsert_category_catalog(text, text, text, text, text) from public, anon;
grant execute on function public.admin_upsert_category_catalog(text, text, text, text, text) to authenticated;

create or replace function public.admin_set_category_catalog_active(
  p_slug text, p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  perform public.require_admin();

  if p_slug in ('income', 'transfer', 'uncategorized', 'miscellaneous') and not p_active then
    raise exception 'category % is required by detection and cannot be removed', p_slug;
  end if;

  select to_jsonb(c) into v_before from public.category_catalog c where c.slug = p_slug;
  if v_before is null then
    raise exception 'category % not found', p_slug;
  end if;

  update public.category_catalog set is_active = p_active where slug = p_slug;

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before, after)
  values (auth.uid(), case when p_active then 'restore' else 'soft_delete' end,
          'category_catalog', p_slug, v_before,
          (select to_jsonb(c) from public.category_catalog c where c.slug = p_slug));
end;
$$;

revoke all on function public.admin_set_category_catalog_active(text, boolean) from public, anon;
grant execute on function public.admin_set_category_catalog_active(text, boolean) to authenticated;
