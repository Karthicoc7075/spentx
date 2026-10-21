-- ROLLBACK for supabase/migrations/20261011_user_merchants_trust.sql  (Phase S5b companion)
-- Generated from a READ-ONLY catalog capture of live (project vdhayvlweuglpvzweunq)
-- with supabase/migration-checks/capture_rollback.sql on 2026-10-21 ~14:00 IST.
--
-- STATUS on live (checked 2026-10-21 ~14:00 IST): ALREADY APPLIED (its objects exist).
-- No capture existed before it ran, so this file cannot rebuild the state
-- from before 2026-10-11. It restores the definitions captured from live on
-- 2026-10-21 ~14:00 IST — use it if a re-run or an edit of this migration changes them.
-- To go further back, restore from the pg_dump backup (supabase/backup/RESTORE.md).
-- Tables/columns this migration added are NOT dropped here (that loses data);
-- see the commented section at the end.
--
-- BEFORE running: take a backup (supabase/backup/backup.sh) and run
-- precheck.sql. If its fingerprint differs from the one below, this file
-- is stale: re-run capture_rollback.sql and regenerate it.
--   function fingerprint at capture: a0b9c719fcf4c70013385e4480005e4c (1 functions)
-- AFTER running: run supabase/backup/verify.sql and compare data_md5.

begin;
set local search_path = public, extensions;


-- ---- 1. Functions (exact captured bodies)
CREATE OR REPLACE FUNCTION public.user_merchants_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;


-- ---- 2. Function grants
revoke all on function public.user_merchants_touch_updated_at() from public, anon, authenticated, service_role; grant execute on function public.user_merchants_touch_updated_at() to authenticated; grant execute on function public.user_merchants_touch_updated_at() to anon; grant execute on function public.user_merchants_touch_updated_at() to service_role; grant execute on function public.user_merchants_touch_updated_at() to public;


-- ---- 3. Triggers
drop trigger if exists user_merchants_touch_updated_at on user_merchants; CREATE TRIGGER user_merchants_touch_updated_at BEFORE UPDATE ON public.user_merchants FOR EACH ROW EXECUTE FUNCTION user_merchants_touch_updated_at();


-- ---- 4. Row level security
alter table public.user_merchants enable row level security;


-- ---- 5. Policies
drop policy if exists user_merchants_delete_own on public.user_merchants; create policy user_merchants_delete_own on public.user_merchants as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));

drop policy if exists user_merchants_insert_own on public.user_merchants; create policy user_merchants_insert_own on public.user_merchants as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));

drop policy if exists user_merchants_select_own on public.user_merchants; create policy user_merchants_select_own on public.user_merchants as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));

drop policy if exists user_merchants_update_own on public.user_merchants; create policy user_merchants_update_own on public.user_merchants as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

commit;

-- ---- Objects this migration CREATED (not dropped; uncomment only with a
-- verified backup and only if the app no longer needs them):
-- alter table public.user_merchants drop column if exists is_trusted;   -- DATA LOSS
-- alter table public.user_merchants drop column if exists deleted_at;   -- DATA LOSS
-- alter table public.user_merchants drop column if exists purpose;      -- DATA LOSS (app uses it)
-- alter table public.user_merchants drop column if exists updated_at;   -- DATA LOSS (sync uses it)
-- drop trigger if exists user_merchants_touch_updated_at on public.user_merchants;
-- drop function if exists public.user_merchants_touch_updated_at();
-- drop index if exists public.user_merchants_user_active_idx;
