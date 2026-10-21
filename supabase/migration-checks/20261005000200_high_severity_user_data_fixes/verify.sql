-- VERIFY after 20261005000200 apply_missing_parts.sql (S5b). READ-ONLY. One statement.
select 'sync_handles_delete' as check_name,
       position('tg_op = ''DELETE''' in
         pg_get_functiondef('public.sync_share_link_access()'::regprocedure)) > 0 as ok,
       'sync_share_link_access() has the DELETE branch' as detail
union all
select 'trigger_on_update_or_delete',
       exists (select 1 from pg_trigger where tgname = 'sync_share_link_access'
               and tgrelid = 'public.purpose_shares'::regclass
               and (tgtype & 8) <> 0 and (tgtype & 16) <> 0),
       'AFTER UPDATE OR DELETE on purpose_shares'
union all
select 'shared_tx_redacts_private',
       position('all_shared' in
         pg_get_functiondef('public.get_shared_transactions(uuid)'::regprocedure)) > 0,
       'note/description/tags hidden when part of the transaction is private'
union all
select 'shared_tx_search_path',
       coalesce((select 'search_path=""' = any (proconfig) from pg_proc
                 where oid = 'public.get_shared_transactions(uuid)'::regprocedure), false),
       'SET search_path = '''''
union all
select 'no_revoked_links',
       not exists (select 1 from public.share_links sl join public.purpose_shares ps
                   on ps.link_token = sl.token and ps.owner_id = sl.owner_id
                   where ps.status = 'revoked'),
       'revoked shares have no bearer link';
