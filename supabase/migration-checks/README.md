# Migration checks (Phase S5b)

See `MIGRATION_TEMPLATE.md` for the procedure and `../backup/RESTORE.md` for
backup/restore. Status on live, checked read-only 2026-10-21 ~14:00 IST:

| migration | live status | precheck | verify | rollback |
|---|---|---|---|---|
| 20261021_signup_phone | **not applied** | ✓ all ok | fails as expected until applied | exact pre-migration function + backfill undo (tested on local PG17 copy) |
| 20261011_user_merchants_trust | applied | ✓ fingerprint | ✓ 6/6 ok | restores definitions captured 2026-10-21 |
| 20261011_security_audit_fixes | applied | ✓ fingerprint | ✓ 8/8 ok | same |
| 20261011_investments_goals | applied | ✓ fingerprint | ✓ 9/9 ok | same |
| 20261011_admin_fixes | applied | ✓ fingerprint | ✓ 6/6 ok | same |

Do **not** re-run the four 20261011 files: they are live, and re-running
`investments_goals` / `security_audit_fixes` re-creates trigger
`transactions_reverse_goal_contributions`, which
`20261012_goal_investment_sync.sql` dropped on purpose.
