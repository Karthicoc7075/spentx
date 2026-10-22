# SpentX – Supabase SQL Status (live project vdhayvlweuglpvzweunq)

Checked read-only on 2026-10-22 (~10:20–10:40 IST) with SELECT-only catalog queries and the Supabase security advisor. No SQL was written to the database. Live has no `supabase_migrations.schema_migrations` table (files were applied through the SQL editor), so status is inferred from catalog objects. All paths below are relative to `<root>/supabase/`.

## Applied (confirmed on live)
| File | Evidence (2026-10-22) |
|---|---|
| `migrations/20261021120000_p0_tx_status_flags.sql` | Applied by the user 2026-10-22 ~08:20–08:35 IST. All 10 new transaction columns present (review_flags, channel, rule_id, rule_version, source_event_ids, linked_original_id, link_kind, refunded_amount, ref_key, balance_applied); index `transactions_user_ref_key_uidx` present. |
| `migrations/20261021120100_p0_account_evidence.sql` | Applied 2026-10-22, same window. All 7 account columns present. |
| `migrations/20261004000100_protect_user_roles.sql` (main file) | Trigger `protect_user_role` on `public.users` present. **But** the function `protect_user_role()` still has the OLDER body (no `supabase_auth_admin` in its allow-list), so `migration-checks/20261004000100_protect_user_roles/post_step_restore_function.sql` is still pending. |
| `migration-checks/20261005000200_high_severity_user_data_fixes/apply_missing_parts.sql` | Applied: `sync_share_link_access()` has the DELETE branch; `get_shared_transactions()` has `search_path=""`. |
| Everything up to `20261012_*` | Applied per `migration-checks/STATUS-2026-10-21.md` (read-only audit Oct 21), except the PENDING items below. |

Phase 0 data integrity: `migration-checks/p0_snapshot_BEFORE_2026-10-22.txt` and `p0_snapshot_AFTER_2026-10-22.txt` were re-compared on 2026-10-22: all 31 result rows are identical (only the header text differs). The backup taken before the migrations is in `~/spentx-backups/20261022T024741Z`, outside the repo.

## Applied on Live (Confirmed by User 2026-10-22 ~20:14 IST)
All 9 previously pending migrations have been manually applied by the user in the Supabase Dashboard SQL Editor:
1. `migration-checks/20261004000100_protect_user_roles/post_step_restore_function.sql` — **APPLIED**
2. `migrations/20261021_signup_phone.sql` — **APPLIED**
3. `migrations/20261022130000_p3_user_rules_v2.sql` — **APPLIED**
4. `migrations/20261022130100_p3_user_self_upi.sql` — **APPLIED**
5. `migrations/20261022130200_p3_global_rules_additions.sql` — **APPLIED**
6. `migrations/20261022120000_p2_sms_rules_version.sql` — **APPLIED**
7. `migrations/20261022140000_p4_investment_totals_status.sql` — **APPLIED**
8. `migrations/20261022150000_p0_ref_key_live_index.sql` — **APPLIED**
9. `migrations/20261022160000_s8_supabase_security_hardening.sql` — **APPLIED**

Pending migrations on live: **0**. All database migrations and S8 hardening are now live on Supabase.

## Existing rule tables (row counts, live, 2026-10-22)
| Table | Rows |
|---|---|
| sms_template_rules | 273 |
| sms_block_rules | 0 |
| sms_detection_rules | 0 |
| merchant_brands | 1628 |
| merchant_brand_keys | 5902 |
| merchant_keyword_rules | 833 |
| mcc_category_map | 981 |
| category_catalog | 107 |
| categories | 7 |
| user_merchants | 32 |
| user_merchant_category | 0 |
| rules_version | 4 |
| (context) transactions / accounts | 75 / 16 |

RLS: 57 public tables, 0 with RLS off.

## Outstanding RLS / security issues (advisor, 2026-10-22) – fix in S8
- ERROR: view `monthly_plan_actuals` is SECURITY DEFINER (no `security_invoker=on`).
- WARN: 17 SECURITY DEFINER functions executable by `anon` (list in SPENTX_REMAINING_WORK.md → S8).
- WARN: 58 SECURITY DEFINER functions executable by `authenticated` (audit each one).
- WARN: 30 functions with a mutable search_path (the plan said 31).
- WARN: extension `pg_trgm` installed in `public`.
- WARN: leaked-password protection disabled (Dashboard → Auth).
- INFO: `share_invite_deliveries` has RLS enabled but no policies (deny-all; confirm intended).

## Process (the user runs SQL manually in the Dashboard SQL editor)
1. **Backup** (Free plan: no dashboard backup / PITR):
   ```bash
   cd "/Users/karthi/Documents/SpentX Web/spentx-web copy 3"
   bash -c 'read -rsp "Paste DB URL: " SPENTX_DB_URL; echo; export SPENTX_DB_URL; bash supabase/backup/backup.sh'
   ```
   - Paste the session-pooler URI at the hidden prompt. Never write the URL into any file, command line or chat.
   - The output goes to `~/spentx-backups/<UTC stamp>/` (public.dump, auth_users.sql, verify-live.csv, manifest). Copy it off the machine.
2. **Snapshot**: run `migration-checks/p0_snapshot.sql`, keep the result as BEFORE.
3. **Precheck**: `migration-checks/<name>/precheck.sql`. Every row must show ok = true; otherwise stop.
4. **Migration**: paste the whole file once and Run. Never run part of a file or run it twice.
5. **Verify**: `migration-checks/<name>/verify.sql` (all ok), then the snapshot again for AFTER and compare.
6. **Rollback** (only if verify fails): `migration-checks/<name>/rollback.sql`.

Guides: `migration-checks/P0_RUN_GUIDE.md`, `migration-checks/MIGRATION_TEMPLATE.md`, `backup/RESTORE.md`. The restore test on a staging copy (`backup/restore_staging.sh`) is NOT TESTED.

Note: the SQL files created after commit `f0dae45` (Phase 0–4 migrations and checks, P0 guide, snapshots, `20261012_goal_investment_sync.sql`) are **untracked** in the root git repo.
