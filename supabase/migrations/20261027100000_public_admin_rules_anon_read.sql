-- Migration: Allow anonymous read access to public admin rules and catalogs
-- WHY: Allows offline mode / unauthenticated mobile apps to receive silent background updates
-- for SMS templates, merchant brands, and category catalogs without needing a cloud account.
-- Security: Read-only (SELECT) on public rule tables only; write operations remain strictly admin-only.

grant select on public.rules_version to anon;
grant select on public.sms_template_rules to anon;
grant select on public.sms_detection_rules to anon;
grant select on public.sms_block_rules to anon;
grant select on public.merchant_brands to anon;
grant select on public.merchant_brand_keys to anon;
grant select on public.merchant_keyword_rules to anon;
grant select on public.category_catalog to anon;
grant select on public.global_settings to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'rules_version' and policyname = 'rules_version_select_anon'
  ) then
    create policy rules_version_select_anon on public.rules_version for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sms_template_rules' and policyname = 'sms_template_rules_select_anon'
  ) then
    create policy sms_template_rules_select_anon on public.sms_template_rules for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sms_detection_rules' and policyname = 'sms_detection_rules_select_anon'
  ) then
    create policy sms_detection_rules_select_anon on public.sms_detection_rules for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sms_block_rules' and policyname = 'sms_block_rules_select_anon'
  ) then
    create policy sms_block_rules_select_anon on public.sms_block_rules for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'merchant_brands' and policyname = 'merchant_brands_select_anon'
  ) then
    create policy merchant_brands_select_anon on public.merchant_brands for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'merchant_brand_keys' and policyname = 'merchant_brand_keys_select_anon'
  ) then
    create policy merchant_brand_keys_select_anon on public.merchant_brand_keys for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'merchant_keyword_rules' and policyname = 'merchant_keyword_rules_select_anon'
  ) then
    create policy merchant_keyword_rules_select_anon on public.merchant_keyword_rules for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'category_catalog' and policyname = 'category_catalog_select_anon'
  ) then
    create policy category_catalog_select_anon on public.category_catalog for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'global_settings' and policyname = 'global_settings_select_anon'
  ) then
    create policy global_settings_select_anon on public.global_settings for select to anon using (true);
  end if;
end $$;
