# SpentX – Auto Detection Change Plan v6 – Production Release Finalization (review only, no code changed)

Updated with your 5 corrections and 6 final safety additions (Oct 21). Keeps Flutter + Hive + Supabase, existing UI design, all 8 locked rules, 7 phases. v4 adds Phase S – Security & Encryption. v5 applies your 8 production-release corrections. v6 makes S4, S5, S5b mandatory, requires all S1–S10 and Phases 0–6, adds real-device verification, and replaces the checklist.

Stack stays: Flutter + Hive + Supabase. Kotlin only for SMS receiver / notification listener / queues.
Size: S < 1 day, M 1–3 days, L 3+ days.

## Phase 0 – Data foundations (L)
1. Transaction gets: status (success/pending/failed/reversed/refunded/cancelled/unknown), review flags (Needs category / Needs account / Needs classification), channel (UPI/card/IMPS/NEFT/RTGS/ATM/wallet/cash), account can be empty (Unassigned), rule id + version, source event ids, link to original (refund/reversal).
   Files: transaction.dart, transaction_provider.dart, supabase_schema_map.dart, sync_service.dart
2. One shared "what counts in totals" rule (new: core/finance/countable.dart), used by spending, budgets, analytics, net worth, Home, Accounts:
   - COUNTS in spending: every confirmed (success) expense, including "Needs category" and "Unassigned account" ones.
   - NOT counted in any total: pending, failed, cancelled.
   - Refund / reversal: reduces the original transaction's effect (net), never counted as income.
   - ALL transactions stay visible in Activity, with a status badge (Pending, Failed, Refund, Needs category, Unassigned).
3. Account gets: aliases (other last-4s), linked debit cards, evidence state (candidate/confirmed/user), evidence count, created by (user/auto), standard bank key.
   Files: account_model.dart, accounts provider, sync
4. Source evidence store (one record per SMS/notification, hash only) – replaces/wraps dedupe registry; makes re-import safe.
   New: sms/evidence/source_evidence_store.dart; changed: sms_dedupe_registry.dart
5. Audit history (auto-add, undo, rule change, account auto-create). New: core/audit/audit_log.dart

## Phase 1 – Permissions & sources (M)
6. NEW SCREEN "Transaction Detection & Permissions": SMS status, Notification access status, Spent notifications switch, per-app picker (PhonePe, GPay, Paytm, bank apps), Retry / Open Settings, Android 16/17 restricted-settings help. Never re-asks after "Don't ask".
   New: detection_permissions_screen.dart; changed: settings_screen.dart, MainActivity
7. Notification listener: only apps you pick (off by default); SMS apps removed. No replies/dismissals.
   Changed: NotificationListenerService.kt, auto_detection_native_sync.dart
8. NEW history import: consent, date range (1/3/6/12 months), progress, cancel, summary (added / review / duplicate / ignored).
   New: sms_history_import.dart, history_import_screen.dart; changed: sms_inbox_catch_up.dart

## Phase 2 – Parsing, status, transfers (M–L)
9. Parser: card last-4 separate from account last-4, balance, channel, status, UTR/RRN, UPI ID pulled out of "To x@y On", beneficiary number never used as your account.
   Changed: transaction_parsed.dart, bank_sms_v4_parser.dart, payee_extractor.dart, sms_rule_engine.dart
10. Account type: "card ending" no longer = credit card; credit only on "credit card / avl limit / amount due"; "DC" or card + balance = debit card; PhonePe/Paytm not wallet unless SMS says wallet.
   Changed: bank_keywords.dart
11. Status (new: status_classifier.dart):
   - Pending / failed / cancelled: saved, visible in Activity, not counted anywhere. Pending → success later updates the same transaction (no duplicate).
   - Refund: see "Safety 3" below (reference-ID linking only, otherwise Needs review).
   - Reversal: cancels the original's financial effect (spend and balance) without deleting either record; no double counting.
12. Transfers (spending +0): CC bill payment, wallet top-up, ATM → Cash, cash deposit, own account ↔ own account, own UPI. New: transfer_classifier.dart
**Added 2026-10-21 (user requirement) – SMS and notification parsing** (plan heading is "Phase 2 – Parsing, status, transfers"; placed here as the closest phase):
- Reuse the existing Admin Panel bank SMS templates and SMS block rules stored in Supabase (existing tables to reuse: sms_template_rules, sms_block_rules, sms_detection_rules; rules_version for cache versioning).
- Support notification-only transactions from PayZapp, UPI apps, bank apps, credit card apps and wallets.
- Use controlled notification parsing rules where required.
- Support adding new bank SMS templates through the Admin Panel without an app update.
- Cache active rules locally for offline detection.
- Use the same transaction engine for SMS and notifications.
- Prevent duplicate transactions across sources.
- Handle bank SMS format changes safely: when HDFC or another bank changes its SMS format, check the existing admin templates (sms_template_rules) first, then the safe fallback parser. (Added 2026-10-21 (user requirement))
- If a financial message can't be confidently parsed, send it to Needs review. Never silently ignore it or create an incorrect transaction. (Added 2026-10-21 (user requirement))
- A new SMS template added in the Admin Panel syncs to the mobile app without an app update (rules_version-based cache refresh). (Added 2026-10-21 (user requirement))
- Regression tests using old, modified and unknown HDFC SMS formats. Preserve existing rules. (Added 2026-10-21 (user requirement))

## Phase 3 – Person, category, purpose, learning (L)
13. User rules get: merchant/person, Family flag, separate category + purpose override, revision. New "my UPI IDs" list. Unsure person payments = Needs classification, not counted until resolved.
   Changed: merchant.dart, merchant_learning_service.dart, merchant_provider.dart; new: self_upi_service.dart
14. Category order: your rule → global list (exact/prefix/pattern only, no fuzzy) → "Needs category" tag but STILL ADDED. Add EKART, Amazon Bill Pay, mandi.
   Changed: merchant_category_suggester.dart, merchant_category_engine.dart, merchant_rules.json
15. OTP merchant pairing: SKIPPED. OTP messages stay fully ignored and are never read for merchant names. Gateway names like "PAYTM PAYMENTS SERVICE" use the global list or "Needs category", and you teach the rule once.
16. Purpose order: your rule → Family contact → synced default purpose → Personal. Never empty. Syncs purposes.is_default.
17. Learning on: Quick Verify, category edit, purpose edit, fixing Needs category, naming a person, marking Family, fixing merchant. Global update never overwrites your rules.
**Added 2026-10-21 (user requirement) – Global merchant rules and user learning** (plan heading is "Phase 3 – Person, category, purpose, learning"; placed here as the closest phase):
- Reuse the existing Admin Panel global merchant rules, categories and aliases (existing tables to reuse: merchant_brands, merchant_brand_keys (aliases), merchant_keyword_rules, mcc_category_map, category_catalog, categories; user side: user_merchants, user_merchant_category; rules_version for sync).
- Admin-managed global rules apply to all users through synchronization.
- Individual users can create their own merchant category and purpose rules.
- User rules always take priority over global rules.
- Admin updates must never overwrite user choices or silently change historical transactions.

## Phase 4 – Accounts (M)
18. Match bank + last-4 + type + aliases + linked cards. Auto-create only if (A) 2 separate SMS for same bank+last-4, or (B) 1 SMS with last-4 + balance. Same bank, new last-4 → ask once "Is this your existing HDFC account or debit card?" (Yes = link, No = create/candidate). Unsure → added as Unassigned + review.
   Unassigned safety: an Unassigned transaction counts in spending (if a confirmed expense) but changes NO account balance and NO liquidity / net worth until you link it. When you link it, the balance updates once (no double apply). Unlinking reverses it.
   strict_account_matcher.dart → account_resolver.dart; changed: account_discovery_service.dart, pending_account_provider.dart, discovery_replay.dart
**Added 2026-10-21 (user requirement) – Phase 4 and Phase 5:**
- Both SMS and notification-only transactions follow the existing account matching, automatic addition, category, purpose, transfer, deduplication and Undo rules.
- Unknown accounts follow the existing Unassigned safety rules.

## Phase 5 – Auto-add, dedupe, notifications (M)
19. Notifications: "₹250 added • HDFC • Food" / "New account HDFC ••0987 added. ₹500 debit recorded." + Undo / "₹350 added • Needs category" + Review + Undo. Undo removes only that action (soft delete; auto-created account only if unused). Logged.
   Changed: sms_auto_save_gate.dart, sms_auto_save_policy.dart, sms_auto_save_undo.dart, sms_notification.dart
20. Dedupe order: UTR/ref + account + amount → source event id → account + amount + direction + merchant + time → unsure = keep both for review. Never amount only.
**Added 2026-10-21 (user requirement) – Phase 4 and Phase 5:**
- Both SMS and notification-only transactions follow the existing account matching, automatic addition, category, purpose, transfer, deduplication and Undo rules.
- Unknown accounts follow the existing Unassigned safety rules.

## Phase 6 – Privacy (S–M)
21. No raw SMS text stored on transactions in release builds (hash only); SMS text removed from release logs and crash reports; export/delete for detection data.

## UI changes
NEW: Detection & Permissions screen, History import, "Is this your HDFC account/debit card?" prompt, My UPI IDs list, Mark contact as Family.
CHANGED: Settings (link + Default purpose), transaction badges + filters (Needs category, Unassigned, Needs classification, Pending, Failed, Refund), Transaction details (status, Link account), Detected SMS "Needs attention" view, Accounts (aliases, linked cards, Auto-added chip + Undo), 3 notification formats. Same colours / light+dark.

## Final safety additions (v3)

### Safety 1 – Bank balances
- Two balances per account: calculated (from transactions) and bank-reported (latest "Avl bal" from SMS, with its time).
- Each transaction has a balance_applied flag + its own id; applying is idempotent, so the same transaction never changes a balance twice (re-sync, re-import, restart, link/unlink all safe).
- Linking an Unassigned transaction applies it exactly once; moving it to another account removes from old, adds to new, in one atomic step.
- Spending, budgets, net worth and account balances all use the same shared totals rule (countable.dart), so they never disagree.
- Reconciliation: if calculated ≠ bank-reported (beyond rounding) → "Balance not verified" warning on the account with the difference and a "Review" action. Never auto-overwrites your balance silently; you choose "Use bank balance" (adds a visible adjustment entry) or keep.
- UI: small warning chip on Account card + Accounts page.

### Safety 2 – Account matching
- Match key = bank + last-4 + account type + verified identity (account vs card, linked card list, aliases), not bank + last-4 alone.
- If two accounts/cards share the same last-4, or type is unclear → never guess: transaction added as Unassigned + "Which account?" picker.
- Debit vs credit decided only by explicit words (credit card / avl limit / amount due vs debit card / DC / A/c). Ambiguous card → ask once, remember answer.
- DB: no hard (bank, last4) unique constraint (see migration 2).

### Safety 3 – Refunds and reversals
- Link only by the original's reference ID / UTR / RRN (or an ID the bank SMS clearly quotes).
- Never auto-link using only merchant + amount + date. No reference → saved as "Refund – Needs review"; you pick the original (suggestions shown, nothing linked automatically).
- Partial and multiple refunds: original keeps refunded_amount; total refunds can never exceed the original; the extra goes to Needs review.
- Each refund/reversal applies its effect once (balance_applied flag), never twice.
- Reporting rule: refund reduces spending in the month the REFUND is received (same category as the original); the original month is not rewritten. Balance moves on the refund date. Unlinked refund in review: counted in balance (money really came in) but not in income or spending until resolved.
- Reversal: cancels the original's effect on both spending and balance, records kept.

### Safety 4 – Detection controls (clear wording in Settings)
- Detect OFF: SMS and notification collection stops completely. Nothing new is read; existing ledger untouched.
- Detect ON + Auto-add OFF: detected transactions wait in Detected SMS for your approval; they do NOT enter the ledger or totals until verified.
- Detect ON + Auto-add ON: added automatically following all 8 locked rules (flags like Needs category / Unassigned when unsure).
- Notification access note on the permissions screen: "Android lets notification access see notifications from all apps. SpentX only processes the apps you select below and ignores everything else."
- Denied or revoked permission: that source stops immediately; no workaround, no repeated prompts.

### Safety 5 – Offline and sync
- All add/edit/delete/link work offline in Hive; outbox syncs when internet returns.
- Stable UUID per transaction, created on the phone; source event id and reference used to stop server-side duplicates (upsert by id, unique ref key).
- Atomic local writes: transaction + balance change + evidence + audit saved together, or none.
- Conflicts: updated_at + revision; newer edit wins; a stale sync never overwrites a newer local record; real conflicting edits on financial fields go to a "Sync conflict" review instead of silent overwrite.
- User merchant rules: revision-based merge, user edits always beat global data, revision history kept.
- Supabase RLS: every new table and column under user_id = auth.uid() for select/insert/update/delete; audit and checked in migrations.
- Multiple devices: same transaction from two phones dedupes by reference/source event id.

### Safety 6 – Testing and migrations
Tests (in addition to the locked-rule tests):
- Bank samples: SBI, ICICI, Axis, Kotak, HDFC (63 real masked), other banks; credit cards, debit cards, UPI (GPay/PhonePe/Paytm), wallets (PayZapp, MobiKwik, Amazon Pay).
- Duplicate SMS, delayed SMS (hours later), SMS + notification for same payment, two same-amount payments.
- Permission granted → revoked → granted again; offline add then sync; two devices same account.
- Balance reconciliation: calculated vs bank-reported, link/unlink Unassigned, refunds partial/multiple, reversal.
Migrations:
- Before any SQL: you take a backup (Supabase dashboard backup or a provided export SQL that copies transactions, accounts, user_merchants, purposes into backup_* tables).
- Status backfill does not assume success (see migration 1).
- Each migration ships with a verify SQL (row counts before/after, no nulls in required fields, balances unchanged) and a rollback SQL (drops added columns/tables, restores from backup_* tables).
- Run order: backup → migration → verify → only then install the app version that uses it.
- Local Hive: versioned migration with a backup copy of each box before upgrade; on failure the old box is restored and the app keeps working.

## Locked rules – regression tests (one test file per rule, must stay green)
1. Purpose priority: user rule → Family → default purpose → Personal; never empty; purpose edit never changes category.
2. Account safety: exact match first; auto-create only with 2 events or balance SMS; beneficiary number never used; same-bank new last-4 asked once; Unassigned changes no balance.
3. Category priority: user rule → global list → Needs category (still added); global update never overwrites user rule.
4. UPI / people: display handle only, full UPI kept for matching; own UPI = transfer; Family contact = Family purpose; unsure person = Needs classification.
5. Permanent learning: Quick Verify, edits, Needs-category fix, Family mark all save rules; survive sync, reinstall, app update.
6. Missing merchant: genuine transaction always added and counted, never dropped.
7. Transfers: CC bill, wallet top-up, ATM → cash, own transfers = spending +0, one logical transfer.
8. Auto-add + notifications: 3 formats, no repeat alert on duplicate; safe Undo (only that action, account removed only if unused, audit kept).
Plus: duplicate protection (SMS + PhonePe = 1; two same-amount payments = 2; restart / re-import = no duplicates), status (pending/failed not counted, refund and reversal adjust the original), history import dedupe, permission denied/revoked paths.
Also a masked regression set from your real phone SMS (63 HDFC samples).

## Supabase SQL (files only, you run them)
1. tx_status_flags: status, review_flags, channel, nullable account_id, rule_id, rule_version, linked_original_id, source_event_ids, balance_applied (bool), refunded_amount; unique ref key. Backfill: manual/verified records = success; old SMS-detected records still pending review stay pending; anything unclear = "unknown" (shown, flagged), not assumed success.
2. account_evidence: aliases, linked_card_last4, evidence_state, evidence_count, created_by, bank_key, account_type, verified_identity. NO hard unique on (bank, last4) – same last-4 can be legit for an account and a card. Only a soft index for lookups; uniqueness on (user, bank_key, account_type, last4, verified_identity) where not deleted, checked against existing data first.
3. user_rules_v2: user_merchants kind, is_family, category_override, purpose_override, revision, upi_id_normalized + revisions table.
4. self_upi: new user_self_upi table.
5. audit_events (optional).
Purposes: no change (is_default already exists). Hive: new boxes/fields, old data read with safe defaults.
**Added 2026-10-21 (user requirement) – Database:**
- Inspect and reuse the existing Supabase tables.
- Don't create duplicate rule systems.
- Preserve existing data and access permissions.
- Don't run SQL without the user's approval.
- Existing tables to reuse (read-only check, Oct 21): SMS templates = sms_template_rules (273 rows); SMS block rules = sms_block_rules (0 rows); SMS detection rules = sms_detection_rules (0 rows); global merchant rules = merchant_brands (1628), merchant_keyword_rules (833), mcc_category_map (981); merchant aliases = merchant_brand_keys (5902); categories = category_catalog (107), categories; user rules = user_merchants (32), user_merchant_category (0); rule cache version = rules_version.

## Decisions (settled)
- SMS is the main source; notification detection is optional, per app you pick (off by default); SMS apps removed from the listener.
- No fuzzy matching: exact / prefix / pattern only.
- Needs category and Unassigned confirmed expenses COUNT in spending.
- Unassigned changes no account balance until linked.
- Keep 2 switches (Detect, Auto-add) + new Detection & Permissions screen.
- Keep Flutter + Hive + Supabase.
- OTP pairing skipped; OTPs never processed.
- Pending, failed, cancelled: saved and visible, never counted. Refund and reversal adjust the original.

## Development Speed & Quality – Strict Rule (Added 2026-10-21 (user requirement); the plan has no separate working-rules section, so it is placed after "Decisions (settled)")
- Work quickly and stay focused on the approved phase; avoid unnecessary planning, repeated analysis and unrelated changes.
- Reuse existing code.
- Don't skip, overlook or remove master-plan requirements.
- Keep production-quality code, security and financial accuracy.
- Run relevant tests, fix errors, verify; never claim 100% success without test evidence.
- Preserve the 8 locked rules, data and Soft UI.
- Keep reports short.
- Complete the approved phase, commit, stop and ask.
- Priority: fast execution, complete requirements, accurate implementation, proper testing.

## Google Play
SMS-based money management is a listed exception for SMS permission, subject to Google's review. Keep SMS-first. Needed: Permissions Declaration Form, demo video, in-app disclosure (the new permissions screen), privacy policy. Notification detection stays optional as extra coverage.


## Phase S – Security & Encryption (before Play release)

### Already in place (checked)
- All local Hive boxes encrypted (AES-256) in app, SMS worker and sync worker. Key: random 256-bit per install, stored via flutter_secure_storage (Android Keystore). No hardcoded keys.
- Native SMS queues: EncryptedSharedPreferences, Keystore AES-256-GCM.
- Android backup off (allowBackup=false, data excluded) – no restore-without-key risk.
- Only Supabase anon key in app; no service-role key.
- RLS enabled on all 59 tables (user tables = auth.uid()). Supabase disk encryption AES-256 by default.
- HTTPS only; cleartext blocked. OTPs never stored. Raw SMS not synced to server.
- Release signing never falls back to debug key; R8 shrinking on. PIN = PBKDF2 + salt.

### Gaps (priority)
1. HIGH – login refresh token stored in plain storage.
2. HIGH – plain→encrypted box upgrade deletes old data before new copy is written (crash = data loss).
3. HIGH – if Keystore key is lost, app makes a new key and local data stops opening (no recovery).
4. HIGH – main app and background worker open the same Hive files at once (corruption risk).
5. MEDIUM – full SMS text kept on phone (transactions, detected/ignored SMS, up to 20 per suggested account).
6. MEDIUM – no screenshot / recent-apps blocking.
7. MEDIUM – no Dart obfuscation; release key (key.properties) not created yet.
8. MEDIUM – Supabase advisor: 1 security-definer view, 17 functions callable by anon (admin ones guarded but should be revoked), 31 functions without fixed search_path, leaked-password protection off.
9. LOW – user ID and merchant list in plain prefs; no certificate pinning; old weak PIN hash on some installs.

### Changes
- S1 Encrypt login session (S): secure storage for Supabase session + PKCE verifier; copy old token, verify, delete plain. Files: auth_service.dart, new secure_session_storage.dart.
- S2 Safe encryption upgrade (M): read plain → write temp encrypted box → compare counts/keys/values → swap → delete plain last; on mismatch keep plain and retry; per-box marker; only main app migrates. File: hive_service.dart.
- S3 Key loss recovery + rotation (M): never create a new key if encrypted files exist; key check hash; if key truly lost → move boxes aside, re-download from Supabase, tell user (unsynced data warning); rotation via safe S2 steps. Files: hive_service.dart, sync_service.dart, small message screen.
- S4 One writer only (M): background worker writes to its own inbox box / native queue; main app merges on open (or file lock). Files: sms_background_init.dart, background_sms_processor.dart, background_data_sync.dart.
- S5 Less SMS text (S–M): no rawMessage on transactions in release (fingerprint + masked snippet); delete text from verified/ignored items after 30 days; max 3 samples per suggested account, deleted after replay or 14 days; move user ID / merchant list / bank list to encrypted store.
- S6 Screenshot block (S): FLAG_SECURE on PIN, transactions, accounts, detection popup, Detected SMS (or app-wide with Settings opt-out); hide recent-apps preview.
- S7 Release hardening (S): create upload key + key.properties (you back it up); build with --obfuscate --split-debug-info; debug log locked in release; strip error debugPrints; upgrade old PIN hashes, PBKDF2 100k+ for new.
- S8 Supabase hardening (S, SQL file, you run): view security_invoker = on; REVOKE EXECUTE FROM anon on admin/setup functions; search_path = public on 31 functions; move pg_trgm to extensions schema; dashboard: turn on leaked-password protection. Column-level encryption of UPI/phone deferred (RLS + disk encryption enough for Play).
- S9 Certificate pinning (optional, after launch).

### Tests
- Upgrade: N records plain → N encrypted, plain gone; crash mid-copy keeps plain data, next launch finishes.
- Key lost → restored from Supabase + message; key mismatch → no silent new key.
- Worker + app together → no corruption; worker decrypts with same key.
- Offline upgrade works; recovery waits for internet.
- Reinstall → clean start, re-download, nothing from backup.
- Session moved to secure storage, still signed in, no plain token left.
- Release logs contain no SMS text; screenshot block active.
- RLS: user B can't read user A on every user table; anon can't call admin functions.
- Existing user data preserved end to end after encryption changes (counts + balances before/after).

Order: S1 → S2 → S3 → S4 → S5 → S6, S7 → S8 → (S9 optional). About 1.5–2 weeks of agent work. Can run before or alongside detection Phase 0.


## v5 corrections to Phase S (these replace the matching S items above)

**S3 (replaced) – Key loss, never delete data**
- Never delete or overwrite encrypted local files after a key problem. Retry key read; if still missing, keep files untouched in a quarantine folder (kept until you choose to remove them in Settings, never automatic).
- Never generate a new key while encrypted files exist without user confirmation.
- Restore from Supabase only when safe: user signed in, server reachable, outbox status known. Restored data goes into fresh boxes; quarantined files stay.
- Clear warning before restore: "Some changes not yet synced may not be recoverable." Show the count of unsynced items if the outbox is readable.
- If the key comes back (e.g. Keystore glitch), quarantined data can be reopened and merged by stable IDs.

**S4 (replaced) – Background detection with a single writer**
- Detection and saving keep working with the app closed: SmsReceiver → encrypted native queue → WorkManager job.
- Single-writer rule: only one Dart engine owns the Hive files at a time, guarded by a cross-process file lock (lock file + owner check). 
  - App closed: the worker takes the lock, writes the transaction (atomic), runs dedupe, sends the notification, releases the lock.
  - App open: the worker does not touch Hive; it hands items to the running app via the native queue + broadcast, and the app saves them.
  - (v6: timeout-based lock expiry REMOVED – see v6 S4 below.)
- Queue items are only acknowledged after a successful save, so nothing is lost on a crash; dedupe stops repeats.

**S8 (expanded) – Full Supabase security audit**
- Audit every SECURITY DEFINER function, view, RPC grant and RLS policy (list owner, grants to anon/authenticated, what it touches).
- SECURITY DEFINER functions: set search_path = '' and use schema-qualified names (public.table, auth.uid()).
- Views: security_invoker = on.
- REVOKE EXECUTE FROM anon and PUBLIC by default; GRANT only to the roles that need it (share-link functions stay public by design).
- Tests: run as anon and as two different authenticated users against every table, view and RPC; expected results checked in a test SQL/script.
- Dashboard: leaked-password protection on; review auth rate limits.

**S2b (new) – Replace deprecated EncryptedSharedPreferences**
- androidx.security-crypto EncryptedSharedPreferences is deprecated. Replace with a supported approach: Android Keystore AES-256-GCM key (non-exportable) + our own small encrypted file store (or DataStore with Keystore-encrypted values).
- Migration: read old encrypted prefs → write new store → verify item counts → only then delete old. If anything fails, keep old and retry next launch. Queue items are never dropped.
- Also used for the session token (S1) on the native side if needed.

**S5b (new) – Backup and migration safety**
- Verify on device: allowBackup=false, data_extraction_rules exclude cloud AND device-to-device transfer, on Android 12+ and Android 16/17. Test with adb backup / bmgr where possible.
- Database: a real external backup before each migration (pg_dump or Supabase dashboard backup downloaded and kept off-server), not only in-database backup_* tables.
- Every migration: pre-check SQL, migration, verify SQL (counts, nulls, balances), rollback SQL; restore procedure tested once on a staging copy.

**S6b (new) – Local security: sessions and PIN**
- Session token in Keystore-backed secure storage (S1).
- PIN brute-force protection: attempt counter stored encrypted; delays after 5 failures (30s, 1m, 5m…), lockout after 10 requiring account login; counter survives app restart.
- PIN hash PBKDF2-SHA256 with 100k+ rounds (or Argon2) and salt; old weak hashes upgraded on next unlock.
- Optional device-backed protection: biometric unlock via Keystore key that requires user authentication.
- On sign-out: session cleared, PIN reset for that user.

**S7b (new) – Google Play compliance**
- Data Safety form: accurately list SMS-derived financial info, account info, phone, email; processed on device and synced to our server; encrypted in transit; user can delete.
- Privacy policy page (public URL) matching the Data Safety form.
- SMS permission declaration (money-management exception) + demo video; notification-access disclosure.
- In-app prominent disclosure before asking SMS / notification permission.
- Account and data deletion: in-app "Delete account" + a public web page for deletion requests (Play requirement); deletes server data and local data.

**S10 (expanded) – Verification**
- Release-build tests (not debug): security, migration, offline recovery, multi-device, Android 16 and 17 permission flows.
- Log leak scan: run release build through full flows and check logcat + crash reports for passwords, tokens, OTPs, account numbers, amounts, SMS text; must be zero.
- Key-loss test: quarantine kept, nothing deleted, restore with warning.
- Background test: app killed, SMS arrives → transaction saved once; app open at same time → no corruption.
- Supabase anon + authenticated access tests (S8).

## v6 – Production Release Finalization (replaces earlier S4/S5/S5b wording where different)

Scope for release: ALL of S1–S10 (incl. S2b, S5b, S6b, S7b) and detection Phases 0–6 are REQUIRED. Only S9 (certificate pinning) stays optional. Nothing is "production-ready" until it passes real-device + release-build verification (section V).

### S5 – SMS privacy (MANDATORY)
- Transactions keep only: amount, direction, date/time, account link, merchant/person, masked UPI handle + normalized UPI (for matching), reference/UTR, channel, status, a one-way fingerprint (hash) of the SMS. No raw SMS text on transactions.
- Review items (To verify / Ignored / account suggestions) may keep the SMS text only while needed for review, encrypted.
- Retention policy (automatic cleanup job, runs daily via WorkManager + on app start):
  - Verified or ignored item: text deleted after 30 days (fingerprint kept for dedupe).
  - Account-suggestion samples: max 3, deleted after replay or 14 days.
  - Native queue items: deleted immediately after successful save; failed items after 7 days.
  - Debug logs: off in release; any debug store auto-cleared after 7 days.
- Temporary SMS queues encrypted with the supported Keystore approach (S2b).
- OTP messages: dropped before any storage, never logged.
- Release logging: a single redacting logger; no SMS text, OTP, amount, account number, UPI ID, token or password in logcat, crash reports or Supabase. Supabase sync payload whitelist (no raw text fields at all).
- Tests: release build log scan = 0 leaks; retention job deletes on schedule; dedupe still works after text is deleted.

### S5b – Backup and migration safety (MANDATORY)
- Before every Supabase migration: external backup (pg_dump / downloaded dashboard backup) + a restore test on a staging copy; backup verified (row counts + checksum of key tables) before migrating.
- Every migration: pre-check → migrate → verify (counts, nulls, balances per account, user rule counts) → rollback script ready.
- Local (Hive + native) encryption migrations: copy → verify → swap → delete original LAST. Original never deleted before the encrypted copy is verified.
- Tests: forced failure mid-migration (crash/kill), rollback, recovery on next launch, migration while offline, migration with pending outbox items. Transactions, accounts, balances, user rules identical before/after.

### S4 – Background database safety (FIXED DESIGN, no timeout lock)
- Single-writer design: ONE writer process for Hive.
  - All SMS/notification events go first into the encrypted native queue (append-only, safe across processes).
  - Exactly one Dart writer consumes the queue: the app's main isolate when the app is running, otherwise a WorkManager unique job (ExistingWorkPolicy.KEEP, so two workers never run together).
  - Ownership uses an OS file lock (FileChannel.lock / flock) held for the whole writer session. The OS releases it automatically when the process dies, so there is NO timeout-based expiry and no chance of two writers.
  - If the app starts while the worker holds the lock, the app waits (read-only UI from last snapshot) until the worker finishes, then takes ownership; the worker never starts while the app holds it (it just leaves items in the queue).
- Works with app closed: SmsReceiver → native queue → unique WorkManager job → save transaction → notification. Also re-scheduled on BOOT_COMPLETED.
- Crash/restart safety: queue item acknowledged only after the transaction + evidence + dedupe record are committed in one atomic Hive write; on restart, un-acked items are reprocessed and dedupe (source event id / reference) prevents duplicates.
- Tests: kill app mid-save, reboot with items queued, app opened while worker running, 50 SMS burst, same SMS twice → exactly one transaction each, no corruption.
- Session refresh (added Oct 21, after S1): the main app and the background worker must never refresh the Supabase session at the same time (refresh tokens rotate, so a second refresh with the old token fails and can log the user out). One refresh owner at a time via the same cross-process lock; the worker uses the current stored token if still valid, otherwise defers (leaves items queued) instead of refreshing; a failed refresh in the worker never signs the user out or deletes the session. Tests: app and worker refresh together → exactly one refresh, both keep a valid session, no accidental logout; worker with expired token while app is running → defers, nothing lost.

### Security – all required
S1 session token secure storage · S2 safe Hive upgrade · S2b replace deprecated EncryptedSharedPreferences (Keystore AES-GCM) · S3 key loss without deletion · S4 single writer · S5 SMS privacy · S5b backups/migrations · S6 screenshot block · S6b PIN brute-force + session protection · S7 production signing (upload key, Play App Signing), obfuscation, release logging · S7b Play compliance (Data Safety, privacy policy, SMS + notification declarations, in-app + web account deletion) · S8 Supabase audit + fixes (search_path = '', schema-qualified, security_invoker views, anon revokes, leaked-password protection) · S10 verification.

### Detection – all required
Phases 0–6 with the 8 locked rules, SMS-first, optional per-app notifications, permanent learning, account safety, transfers, refunds/reversals, duplicate prevention, safe Undo, no silent overwrite of financial data.

### V – Real production verification (required before "ready")
- Devices: your AIN065 (Android 16) + at least one more brand (Samsung or Pixel); Android 17 via emulator/beta image if a physical device isn't available (reported honestly as emulator).
- Permissions: SMS and notification access denied / granted / revoked mid-use / restricted-settings flow.
- Offline add/edit → sync; two devices same account; background SMS with app closed; crash mid-save; reboot; app upgrade from current installed version with real data.
- All 8 locked-rule regression suites + duplicate, refund, Undo, balance reconciliation suites.
- Release-build (not debug) security + data-integrity tests: log leak scan, RLS anon/auth/cross-user tests, RPC grant tests, migration + rollback, key-loss quarantine.
- Results recorded per test (pass/fail, device, Android version, date). Anything not run is marked NOT TESTED, never assumed.

## Final production-release checklist (Oct 21, 2026 – before v6 implementation)

Legend: Implemented = in code today. Tests = what was actually run. Blocker = must be done before Play submission.

| Feature | Implemented | Tests performed | Result | Remaining problems | Blocker? |
|---|---|---|---|---|---|
| Local Hive encryption (AES, Keystore-held key) | Yes | Unit tests; code review | Pass (unit) | Unsafe plain→encrypted upgrade; key-loss handling | Blocker (S2, S3) |
| Native SMS queue encryption | Yes, deprecated library | Unit tests | Pass (unit) | Must move to supported Keystore approach | Blocker (S2b) |
| Session token protection | No (plain storage) | None | – | Refresh token unencrypted | Blocker (S1) |
| S1 session storage – NOT TESTED items (Oct 21) | Yes (S1 done) | Unit tests; device: session moved, still signed in, no plain token | Pass (unit + device move) | NOT TESTED: on-device token refresh after migration; on-device logout; release build; on-device background worker refresh | Verify (V) |
| Key-loss recovery without deletion | No | None | – | App gets stuck, new key made | Blocker (S3) |
| Single-writer background saving | No | None | – | App + worker write same files | Blocker (S4) |
| Background detection with app closed | Yes (current worker path) | Unit tests; earlier phone install | Not verified on device after recent changes | Concurrency risk until S4 | Blocker (S4 + V) |
| SMS privacy / minimal storage / retention | Partly (OTP dropped, raw not synced) | Unit tests | Pass (unit) | Raw text kept on phone; no retention job; no release log scan | Blocker (S5) |
| Backup & migration safety | No | None | – | No external backup/rollback procedure | Blocker (S5b) |
| Screenshot / recents protection | No | None | – | – | Blocker (S6) |
| PIN brute-force + stronger hash | Partly (PBKDF2 20k, no lockout) | Unit tests | Pass (unit) | No attempt limits | Blocker (S6b) |
| Production signing + obfuscation | Partly (no debug-key fallback) | Build config review | – | No upload key / key.properties; no obfuscation | Blocker (S7) |
| Play Data Safety, privacy policy, permission declarations | Unknown | None | – | Needs checking/creating | Blocker (S7b) |
| Account + data deletion (in-app + web) | Unknown | None | – | Needs checking/creating | Blocker (S7b) |
| Supabase RLS | Yes (59 tables enabled) | Read-only policy query | Enabled | No cross-user/anon test suite | Blocker (S8 tests) |
| Supabase functions/views/RPC hardening | No | Security advisor scan | 1 error, 17 anon-callable functions, 31 mutable search_path | Leaked-password protection off | Blocker (S8) |
| HTTPS/TLS | Yes | Code/manifest review | No http found | Not tested on device | Verify (V) |
| Android backup restrictions | Yes (config) | Config review | Looks correct | Not device-tested (cloud + D2D) | Verify (S5b/V) |
| Certificate pinning | No | – | – | – | Optional (S9) |
| Detection Phase 0 (models, totals, evidence, audit) | No | – | – | – | Blocker |
| Phase 1 (permissions screen, per-app notifications, history import) | No (2 switches exist) | – | – | – | Blocker |
| Phase 2 (parser, status, transfers) | Partly (parser exists) | Unit tests; 63 real HDFC SMS dry-run | 33% category hit; debit card mislabelled | Status/transfer logic missing | Blocker |
| Phase 3 (person/Family/UPI, category, purpose, learning) | Partly | Unit tests | Pass (unit) | Default purpose not synced; weak learning | Blocker |
| Phase 4 (account resolver, auto-create, Unassigned) | No (strict match only) | Unit tests of strict match | Pass (unit) | No auto-create/aliases | Blocker |
| Phase 5 (auto-add flags, notifications, dedupe order, Undo) | Partly (auto-save, 10-min Undo, dedupe) | Unit tests | Pass (unit) | New formats, ref-first dedupe, safe Undo audit | Blocker |
| Phase 6 (privacy cleanup, export/delete) | No | – | – | – | Blocker |
| 8 locked-rule regression suites | No | – | – | – | Blocker |
| Signup email-link fix (today) | Yes | Unit tests (374) | Pass (unit) | Not tested on phone; SQL not run | Verify on device |
| SMS popup single X / no re-show (today) | Yes | Unit tests (386) | Pass (unit) | Not tested on phone | Verify on device |
| Verify confirm popup (today) | Yes | Unit tests (391) | Pass (unit) | Not tested on phone | Verify on device |
| Real-device / Android 16 & 17 / release-build verification | No | – | – | – | Blocker (V) |
| Pending SQL for you | Files written | – | Not run | 20261011_* (4 files), 20261021_signup_phone.sql | Blocker |
| Phone testing – Phase 0 + Phase 1 (added Oct 21) | Code done; phone unreachable | Unit tests; emulator UI only (no account) | Not run on phone | NOT TESTED on AIN065: verified backup, install -r, still signed in, SMS + notification permission flows (deny / Don't ask / Settings / restricted settings), per-app notifications, past-SMS import on real inbox, logcat | Blocker (V) |
| Balance verification after Phase 0 (added Oct 21) | Shared totals rule in code; compat tests pass | Old-format fixtures give identical totals on old and new code; live server: all 75 transactions completed (read-only count) | Pass (unit) | NOT TESTED on phone: Home / Activity / Analytics / Accounts totals and every account balance unchanged vs the pre-install backup; re-check after Phase 0 SQL is run | Blocker (V) |

**Status: NOT ready for Google Play.** Unit tests pass, but nothing in the security or detection plan is production-verified. Release requires all blockers done and section V passed, then Play review.

### Suggested build order after approval
1. S5b backup procedures + S1, S2, S2b, S3 (data safety first)
2. S4 single writer
3. Detection Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 (with locked-rule tests per phase)
4. S5, S6, S6b
5. S8 Supabase fixes (SQL for you)
6. S7 signing/obfuscation + S7b Play compliance
7. V – full real-device + release-build verification, then update this checklist with real results.

### SQL status update (Oct 22, 2026, 08:36 IST — additions only)
- APPLIED on live by you (Oct 22, ~08:20–08:35 IST), verified read-only: `20261021120000_p0_tx_status_flags.sql`, `20261021120100_p0_account_evidence.sql`. Backup `~/spentx-backups/20261022T024741Z` taken first; BEFORE/AFTER snapshots identical (no existing row changed).
- Still pending (6): protect_user_roles post-step, signup_phone, p2_sms_rules_version, p3_user_rules_v2, p3_user_self_upi, p3_global_rules_additions.
- Release checklist: Phase 4 device test = NOT TESTED (phone).
- Phase 4 (Oct 22): new SQL file `20261022140000_p4_investment_totals_status.sql` (+ precheck / verify / rollback) — investment_totals counts only 'completed' rows (was counting pending / reversed / unknown). Written, not run. Pending SQL now 7.
