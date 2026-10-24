-- ROLLBACK for supabase/migrations/20261022120000_p2_sms_rules_version.sql
-- Removes only what the migration added (triggers + the three SMS
-- rules_version rows). No rule data is touched. The app then falls back to
-- max(updated_at) plus its daily full refresh. The reused functions stay
-- (merchant_brands uses them).

begin;

do $$
declare t text;
begin
  foreach t in array array['sms_template_rules', 'sms_detection_rules', 'sms_block_rules'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_ver_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_ver_upd', t);
    execute format('drop trigger if exists %I on public.%I', t || '_ver_del', t);
  end loop;
end $$;

delete from public.rules_version
 where table_name in ('sms_template_rules', 'sms_detection_rules', 'sms_block_rules');

commit;
