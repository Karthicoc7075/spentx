-- ROLLBACK for 20261022130100_p3_user_self_upi.sql.
-- DESTRUCTIVE: drops every user's backed-up UPI ID list (each phone keeps
-- its own copy). Run only with explicit approval.

begin;
drop table if exists public.user_self_upi;
commit;
