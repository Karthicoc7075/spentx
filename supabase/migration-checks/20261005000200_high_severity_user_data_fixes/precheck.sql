-- PRECHECK for 20261005000200 apply_missing_parts.sql (S5b). READ-ONLY. One statement.
select 'sync_fn_unchanged' as check_name,
       md5(pg_get_functiondef('public.sync_share_link_access()'::regprocedure))
         = 'e34aec892335a82ec4639e7015205276' as ok,
       'live sync_share_link_access() equals the copy in rollback.sql' as detail
union all
select 'gst_fn_unchanged',
       md5(pg_get_functiondef('public.get_shared_transactions(uuid)'::regprocedure))
         = 'a12007928e68253dda556597984c6162',
       'live get_shared_transactions(uuid) equals the copy in rollback.sql'
union all
select 'rest_of_file_live',
       to_regclass('public.recurring_bills') is not null
       and to_regclass('public.share_invite_deliveries') is not null
       and to_regprocedure('public.reserve_share_invite(uuid,uuid)') is not null,
       'recurring_bills, share_invite_deliveries, reserve_share_invite present'
union all
select 'revoked_links_to_delete (info)', true,
       (select count(*) from public.share_links sl join public.purpose_shares ps
          on ps.link_token = sl.token and ps.owner_id = sl.owner_id
        where ps.status = 'revoked')::text || ' links will be deleted (2026-10-21 ~14:25 IST: 0)';
