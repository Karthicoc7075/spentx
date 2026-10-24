-- Phase 2 (SMS and notification parsing): version the admin SMS rule tables.
--
-- WHY: the app re-downloads sms_template_rules / sms_detection_rules /
-- sms_block_rules when their rules_version changes, so a template an admin
-- adds reaches every phone on its next open, without an app update. Today
-- only the merchant tables bump rules_version; the SMS tables do not, so the
-- app falls back to max(updated_at) (misses deletes and edits that keep
-- updated_at) plus its daily full refresh.
--
-- WHAT: reuses the EXISTING functions public.mcr_bump_rules_version() and
-- public.mcr_touch_updated_at() (already used by merchant_brands). No new
-- table, no new rule system, no data change, no RLS / grant change.
-- Additive and idempotent. Run precheck.sql first, verify.sql after.
-- Rollback: migration-checks/20261022120000_p2_sms_rules_version/rollback.sql

begin;

do $$
declare t text;
begin
  foreach t in array array['sms_template_rules', 'sms_detection_rules', 'sms_block_rules'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.mcr_touch_updated_at()',
      t || '_touch', t);

    execute format('drop trigger if exists %I on public.%I', t || '_ver_ins', t);
    execute format(
      'create trigger %I after insert on public.%I
         referencing new table as new_rows
         for each statement execute function public.mcr_bump_rules_version()',
      t || '_ver_ins', t);

    execute format('drop trigger if exists %I on public.%I', t || '_ver_upd', t);
    execute format(
      'create trigger %I after update on public.%I
         referencing new table as new_rows
         for each statement execute function public.mcr_bump_rules_version()',
      t || '_ver_upd', t);

    execute format('drop trigger if exists %I on public.%I', t || '_ver_del', t);
    execute format(
      'create trigger %I after delete on public.%I
         referencing old table as old_rows
         for each statement execute function public.mcr_bump_rules_version()',
      t || '_ver_del', t);

    -- Starting row so the app has a version to compare against.
    execute format(
      'insert into public.rules_version (table_name, version, row_count, updated_at)
         values (%L, 1, (select count(*) from public.%I where is_active), now())
       on conflict (table_name) do nothing',
      t, t);
  end loop;
end $$;

commit;
