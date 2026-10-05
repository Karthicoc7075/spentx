-- Run only in an isolated test database with the application migrations applied.
-- Fixtures and changes are rolled back. Never points at the deployed service.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','owner@example.test'),
 ('10000000-0000-4000-8000-000000000002','viewer@example.test');
insert into public.purposes(id,user_id,name,color) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Shared','#fff'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Private','#fff');
insert into public.transactions(id,user_id,account_id,merchant,total_amount,type,source,entry_source,transaction_date,month_key,note,description,tags)
select '30000000-0000-4000-8000-000000000001',user_id,id,'Shop',5000,'expense','manual','manual',now(),'2026-10','Private note','Private description',array['private']
from public.accounts where user_id='10000000-0000-4000-8000-000000000001' and is_default;
insert into public.transaction_splits(transaction_id,user_id,purpose_id,amount) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1000),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',4000);
insert into public.share_links(token,owner_id,purpose_id,purpose_name,viewer_email) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Shared','viewer@example.test');
insert into public.purpose_shares(id,owner_id,viewer_id,viewer_email,purpose_id,link_token,status,kind) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','viewer@example.test','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','active','email');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare n int; r record; begin
  update public.purpose_shares set purpose_id='20000000-0000-4000-8000-000000000002'
    where id='50000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; assert n=0, 'Viewer must not modify scope';
  assert not exists(select 1 from public.transactions where user_id='10000000-0000-4000-8000-000000000001'), 'Raw parent leaked';
  assert not exists(select 1 from public.transaction_splits where user_id='10000000-0000-4000-8000-000000000001'), 'Raw allocations leaked';
  select * into r from public.get_shared_transactions('40000000-0000-4000-8000-000000000001');
  assert r.amount=1000, 'Shared amount changed';
  assert r.note is null and r.description is null and r.tags is null, 'Private metadata leaked';
  assert not has_function_privilege(current_user,'public.reserve_share_invite(uuid,uuid)','execute'), 'Client can reserve arbitrary emails';
end $$;
reset role;
set local role service_role;
do $$ begin
  assert public.reserve_share_invite('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'), 'First invitation blocked';
  assert not public.reserve_share_invite('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'), 'Replay allowed';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  assert exists(select 1 from public.transactions where id='30000000-0000-4000-8000-000000000001'), 'Owner lost ledger access';
end $$;
insert into public.recurring_bills(user_id,id,data) values
 ('10000000-0000-4000-8000-000000000001','rent','{"id":"rent","amount":2000}');
update public.purpose_shares set expires_at=now()-interval '1 second' where id='50000000-0000-4000-8000-000000000001';
do $$ begin
  assert not exists(select 1 from public.get_shared_transactions('40000000-0000-4000-8000-000000000001')), 'Expired link still works';
end $$;
update public.purpose_shares set expires_at=null where id='50000000-0000-4000-8000-000000000001';
update public.purpose_shares set status='revoked' where id='50000000-0000-4000-8000-000000000001';
do $$ begin
  assert not exists(select 1 from public.share_links where token='40000000-0000-4000-8000-000000000001'), 'Revoke was not atomic';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  assert not exists(select 1 from public.get_shared_transactions('40000000-0000-4000-8000-000000000001')), 'Revoked projection leaked';
  assert not exists(select 1 from public.recurring_bills), 'Other account bills leaked';
end $$;
reset role;
-- Deleting/recreating invitations must not reset the sender's hourly budget.
delete from public.purpose_shares where id='50000000-0000-4000-8000-000000000001';
insert into public.share_invite_deliveries(owner_id)
select '10000000-0000-4000-8000-000000000001' from generate_series(1,9);
insert into public.purpose_shares(id,owner_id,viewer_email,purpose_id,kind) values
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','viewer@example.test','20000000-0000-4000-8000-000000000001','email');
set local role service_role;
do $$ begin
  assert (select count(*) from public.share_invite_deliveries)=10, 'Deleting a share reset email quota';
  assert not public.reserve_share_invite('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'), 'Hourly email limit bypassed';
end $$;
reset role;
rollback;
