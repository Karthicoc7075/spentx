# SpentX Codebase Audit — Sync, Transactions, Wealth, Outings, Cross-Cutting

Audited against actual source, not docs. Docs (DATABASE.md, SYNC.md, FLUTTER_APP_DOCUMENTATION.md, etc.) were treated as hypotheses; where code and docs disagreed, code wins and the doc is flagged stale below.

Grouped by severity: **security** → **data-loss** → **data-corruption** → **UX** → **cosmetic**.

---

## SECURITY

### S1. PIN "hash" is reversible Base64, not a real hash — PIN recoverable instantly
**Status:** CONFIRMED
**Evidence:** `lib/core/services/pin_service.dart:21-23`
```dart
static String _hash(String pin, String salt) {
  return base64Url.encode(utf8.encode('$salt::$pin'));
}
```
Salt is a timestamp, not random: `pin_service.dart:27` — `DateTime.now().millisecondsSinceEpoch.toString()`. Stored in the plain, unencrypted `settings` Hive box (`pin_service.dart:19`, `main.dart:55`).

**Doc conflict:** `docs/app/DATABASE.md` correctly describes this. `docs/app/FLUTTER_APP_DOCUMENTATION.md` §14 falsely claims "secure storage" — **that doc is stale**.

**Fix:** Replace with PBKDF2/bcrypt/Argon2 + `Random.secure()` salt. Move `pin_hash`/`pin_salt` into the encrypted `vault` box (once wired up, see S2) instead of plain `settings`. Rate-limit PIN attempts since 4-digit PINs are inherently low-entropy regardless of KDF.

### S2. Encrypted `vault`/`HiveService`/`FlutterSecureStorage` is dead code; sensitive boxes are unencrypted
**Status:** CONFIRMED
**Evidence:** `lib/data/local/hive_service.dart:14-45` defines an AES-encrypted `vault` box keyed via `FlutterSecureStorage`, but zero call sites exist anywhere (`hiveServiceProvider` never read/watched). `main.dart:51-69` opens all real boxes — `transactions`, `detected_sms_box`, `settings`, etc. — via plain `Hive.openBox(name)` with no cipher. `detected_sms_storage.dart` confirms `detected_sms_box` stores bank name, last-4 digits, UPI ID, and raw SMS text in plaintext.

**Fix:** Either wire `HiveService.init()` into `main.dart` and migrate `transactions`/`detected_sms_box`/PIN fields into the AES-encrypted vault, or delete the dead vault code so it stops implying protection that doesn't exist.

### S3. In-app privacy claim contradicts working cloud sync
**Status:** CONFIRMED
**Evidence:** `lib/features/settings/data/spentx_master_app_prompt.dart:22` — `"All data stays on-device in Hive — no cloud sync."` Surfaced to users via Developer Options. Meanwhile `lib/core/sync/sync_service.dart` (1900+ lines) actively syncs transactions, accounts, categories, outings, etc. to Supabase, and sign-in via Supabase Auth is mandatory (`splash_screen.dart:71-73`).

**Severity note:** Compliance/App Store Data Safety risk — this is a verifiable, in-app, user-facing false claim about data handling.

**Fix:** Rewrite the claim to reflect that Supabase sync is required and Hive is a local cache/offline layer, not the sole store. Audit other privacy copy (About screen, store listing, Play Data Safety form) for the same stale framing.

### S4 (bonus). `get_shared_transactions()` RPC bypasses RLS by design
**Status:** COULDN'T FULLY VERIFY (flagged for dedicated review)
**Evidence:** `supabase/migrations/init.sql:745-770` — `security definer` function scoped only by a share-link token/expiry check. Deliberate tradeoff per code comments, but worth confirming every call site checks token expiry/revocation before trusting the bypass.

### S5 (bonus). `outing_expenses`/`settlements` RLS keyed on `user_id`, not on `outing_id` ownership
**Status:** COULDN'T VERIFY (needs full RLS policy text)
**Evidence:** `init.sql:963` — `outings_write_own` uses `created_by = auth.uid()`; child tables appear to check `user_id = auth.uid()` rather than validating the parent `outing_id` is actually owned by that user. No current client path sets an arbitrary `outing_id`, but there's no DB-level constraint preventing a spoofed cross-tenant `outing_id` on an otherwise-valid own-user row.
**Fix:** Add a constraint/trigger validating `outing_id`'s owner matches `user_id` on insert, or tighten RLS to join through the parent outing.

---

## DATA-LOSS

### D1. Deleted trips resurrect after any mobile push touching them
**Status:** CONFIRMED
**Evidence:** `lib/core/sync/supabase_schema_map.dart:493-520` (`OutingMap.toRemote`) hardcodes `isActive: true` on every push:
```dart
isActive: true, // never soft-delete via sync upsert
```
Mobile pull filters strictly `.eq('is_active', true)` (`sync_service.dart:1072-1076`). Web soft-deletes via `is_active=false` (`supabase-data.ts:2177-2186`).

**Repro:** Web user deletes a trip → `is_active=false`. Mobile, unaware, edits any field in that outing (even an unrelated expense note) → next push hardcodes `is_active: true` → server row resurrected → next pull on either device brings the "deleted" trip back.

**Fix:** Never write `is_active` from a content upsert — either omit it from the payload entirely (switch to a column-scoped partial update instead of full-row `.upsert()`), or fetch the current server `is_active` and echo it back before pushing.

### D2. Full-document outing push + prune-by-absence causes bidirectional expense/title loss
**Status:** CONFIRMED
**Evidence:** Every outing mutation round-trips the entire document via `_putAndSync` (`outing_provider.dart:592-597`, uses full `Outing.toJson()`). Push then prunes anything not in the pushing device's local snapshot: `sync_service.dart:558-654` (`_deleteMissingChildren`, settlement `.not('id','in',...)`).

**Repro (two-device conflict):** Device A (offline) adds expense X. Device B, unaware of X, edits only the outing title and pushes first — if X already exists server-side, B's prune step deletes X. If A pushes after B without ever pulling B's title change, A's stale title silently reverts B's edit. Loss can occur in either direction depending on push order — no merge exists.

**Fix:** Replace prune-by-absence with per-row tombstones (`deleted_at`/`is_deleted` set explicitly by the deleting device). Add per-row `updated_at`/version and diff against last-known-server-state instead of full-document replace; scope pruning to rows the pushing device is actually authoritative for.

### D3. Free-text `note='exp:<id>'` marker can cause mobile to delete a genuine web-created settlement
**Status:** CONFIRMED
**Evidence:** `supabase_schema_map.dart:625-668` builds settlement links purely from a string prefix (`'exp:$remoteExpenseId'`) in the `note` column — no dedicated FK/type column exists in `settlements` (`init.sql:366-377`). Prune query: `sync_service.dart:630-639` — `.like(SettlementMap.note, 'exp:%')` then deletes anything not in the pushing device's known set.

**Repro:** A web user manually records a settlement with a note literally starting "exp:..." (e.g. "exp: paid back for dinner"). It matches the prune filter; the next mobile push for that outing deletes this real, user-entered settlement.

**Fix:** Add `settlements.source_expense_id uuid references outing_expenses(id)` (or a `kind` flag), set only by the expense-repayment code path. Scope pruning to that column, never to pattern-matched free text.

### D4. Outing link on a transaction is silently and permanently dropped on FK failure
**Status:** CONFIRMED
**Evidence:** `sync_service.dart:539-556` (`_upsertTransactionWithOutingFallback`) retries once with `outing_id: null` on FK failure, with a comment claiming "outing link can re-attach later" — but no such reconciliation code exists anywhere in the codebase (grep confirmed). Worse: the pull-side merge (`toLocal`, reads `row[outingId]` directly) can overwrite even the *local* copy's outing link back to null on the next pull.

**Fix:** Add a `transactionOutingRelink` sync-queue entity that retries `UPDATE transactions SET outing_id = X` once the referenced outing successfully syncs (e.g., swept at the end of `_pushOutingDocument`). Stop the pull-merge from unconditionally overwriting a local outing id with server null while a pending relink exists.

### D5. Duplicate-transaction detection has no merchant/payee check — same-day, same-amount transactions silently dropped
**Status:** CONFIRMED
**Evidence:** `lib/features/sms/detected/auto_rule_engine.dart:93-141` (`_isDuplicate`) matches on `referenceId` OR (`amount` + `day` + `month`), excluding pending items — no merchant/payee field anywhere in the key.

**Repro:** ₹500 lunch at Cafe A and a separate ₹500 UPI payment to a friend, same day, neither SMS carrying a reference number — the second is silently flagged duplicate and dropped with zero user-facing warning.

**Fix:** Require merchant/payee or UPI ID as an additional match component whenever `referenceId` is absent. Never fully suppress on amount+date alone; route ambiguous matches to pending-verification for user confirmation instead of silent drop.

### D6. Account renames orphan the old remote row (duplicate accounts, split net worth)
**Status:** CONFIRMED
**Evidence:** `SyncIds.forAccount` derives the remote id from the lowercased/trimmed name (`supabase_schema_map.dart:70-105`). Renaming (`premium_settings_screen.dart:742` → `updateAccount`) re-derives a brand-new id from the new name (`sync_service.dart:225-268`, `_resolveRemoteAccountId`) since no case-insensitive match is found for the changed name — it inserts a second row rather than updating the first. The original row survives forever, still holding transactions that pointed at it pre-rename.

**Fix:** Mint a real UUID (`uuid.v4()`) once at account-creation time, store it immutably on the local model, and always push/update using that stored id — never re-derive from name. Apply identically to categories/purposes/friends/contributors, which use the same pattern and will hit this the moment a rename UI exists for them.

### D7. Settlement IDs keyed on positional list index — deleting an earlier payment overwrites/corrupts a later one's remote row
**Status:** CONFIRMED
**Evidence:** `SyncIds.forSettlement(uid, expenseId, memberId, index)` (`supabase_schema_map.dart:80-83`) where `index` is recomputed fresh from the current in-memory list position on every push (`sync_service.dart:598-617`), not a stable payment id.

**Repro:** 3 payments at index 0/1/2 pushed once. User deletes payment at index 0. Next push re-indexes remaining payments to 0/1 — the payment now at index 0 derives the SAME remote id the deleted payment used to have, silently overwriting that row's amount/date; the prune step then deletes the now-unreferenced index-2 id, but the intermediate overwrite has already corrupted history.

**Fix:** Mint a stable `paymentId` (uuid) once per payment at creation time; derive `forSettlement(uid, expenseId, memberId, paymentId)` from that instead of list position.

---

## DATA-CORRUPTION

### C1. Split-type mismatch: web "custom" splits silently collapse to "solo" on mobile, then get permanently overwritten
**Status:** CONFIRMED
**Evidence:** DB allows 5 split types (`init.sql:358`: `equally, solo, custom, percentage, shares`). Web's TS `SplitType` models only 3 (`src/types/index.ts:798`) but `custom` is live and used today (`AddOutingExpenseDialog.tsx:134`). Mobile's enum has only 2 (`outing_provider.dart:23`: `solo, equally`). Mobile's pull mapper (`supabase_schema_map.dart:598-622`) does a boolean ternary — anything other than the literal string `'equally'` becomes `0` (solo), silently discarding the actual per-member custom split amounts. Worse, mobile's push mapper (`supabase_schema_map.dart:586`) can only ever write back `'equally'` or `'solo'` — so once mobile touches such an outing, its next full-document push (per D2) **permanently destroys** the original custom/percentage/shares configuration server-side.

**Fix:** Expand mobile's enum to cover all 5 DB values (or at least an opaque passthrough state it preserves without editing). Change both mappers from boolean ternary to a full switch, and until mobile can edit non-equally/solo splits, its push should skip rewriting `split_type`/`splits` for expense types it doesn't understand rather than overwrite them.

### C2. Web's `updateTransaction` collapses multi-split transactions to one row on any edit; mobile push cements this
**Status:** CONFIRMED (schema/RPC supports multi-split; no live UI trigger creates >1 today, but a real collapse bug exists in the edit path, and mobile's design would make it permanent)
**Evidence:** Web's `create_transaction_with_splits` RPC genuinely supports N rows (`init.sql:776-825`), but `updateTransaction` (`supabase-data.ts:872-896`) always does `DELETE all splits` → `INSERT one split row` regardless of which field changed. Mobile always upserts exactly one split row with a deterministic id and hardcodes `hasSplits: false` (`supabase_schema_map.dart:326,334-352`) — it also only ever reads the *first* split row on pull (`sync_service.dart:902-931`), so genuine multi-split data would be silently reduced to one view and, on next mobile push, one row.

**Fix:** Stop web's `updateTransaction` from unconditionally deleting all split rows on unrelated field edits — only touch splits when purpose/category/amount actually change. Make mobile's split-upsert `has_splits`-aware: refuse to touch/collapse splits on a transaction where `has_splits=true` until mobile supports multi-purpose editing.

### C3. `has_splits` is hardcoded `false` on every mobile-originated transaction, despite a split row always being created
**Status:** CONFIRMED (bonus finding)
**Evidence:** `supabase_schema_map.dart:326` — `hasSplits: false` is never conditional, even though a `transaction_splits` row is always written (`sync_service.dart:347-354`). If any web code branches on `has_splits` to decide whether to query the splits table, mobile-authored purpose/category data could be silently ignored by web UI.
**Fix:** Set `has_splits` based on whether more than one logical split exists (today, always `true` if a split row is always written with real category/purpose data — verify against how web's own `has_splits` is used before choosing `true` vs `false` as the correct default).

### C4. Mobile-originated transfers use tag-based encoding; two web calculations don't exclude them
**Status:** CONFIRMED (encoding), PARTIALLY TRUE (most aggregates guard correctly; two do not)
**Evidence:** Mobile encodes transfers as `tags: ['transfer', 'transfer_to:...', ...]` (`supabase_schema_map.dart:296-308`); web schema has no `is_transfer`/`transfer_to_account_id` column (confirmed zero hits across all migrations). Most web aggregates correctly use `isTransferTransaction()` (`investments.ts:27-35`) — but `wealth.ts`'s `computeNetWorthBreakdown` "this month / last month savings" calc (lines 240-255) sums `type==='income'`/`'expense'` with no transfer exclusion, inflating/distorting the monthly trend figure for any mobile-originated transfer.
**Fix:** Add `!isTransferTransaction(transaction)` to the filters in `wealth.ts:244,247,251,254`, matching `dashboard.ts:91`'s existing treatment.

### C5. Investment-category matching bypasses the `is_investment` flag in analytics client code
**Status:** PARTIALLY TRUE — the SQL view (`investment_totals`, `init.sql:660-676`) is correctly guarded and safe; the bug is in a JS helper
**Evidence:** `src/lib/investments.ts:13-18` (`isInvestmentCategory`) falls back to raw name-matching (`normalized === 'investment'`) whenever the `categories` array isn't passed. Confirmed live callers omitting it: `analytics.ts:117` (`sumInvestments`, used by `useAnalyticsData.ts:79` and `reports.ts:81`) — so the Analytics page's "Investment Total" stat force-matches any category literally named "Investment" regardless of its real `is_investment` flag.
**Fix:** Thread `categories` through every `sumInvestments`/`isInvestmentCategory` call site so the real flag is always checked; gate the legacy name-fallback behind an explicit warning rather than a silent default.

### C6. Mobile's "Investments" feature is architecturally disconnected from web's transaction-based investment tracking
**Status:** CONFIRMED (bonus finding, arguably more serious than C5)
**Evidence:** `lib/core/providers/investment_provider.dart` stores manually-entered `InvestmentHolding` objects in a local-only Hive box with zero relationship to categories/transactions/`is_investment`, and never syncs to Supabase at all. Web's investment total is derived entirely from `is_investment`-flagged transaction categories. These are two unrelated data models that will never agree and never reconcile across platforms.
**Fix:** Pick one canonical model — either sync mobile's holdings to a new Supabase table and surface them on web too, or deprecate the separate feature in favor of category-flag-driven tracking on both platforms.

### C7. Net worth is computed independently per client with no shared historical record
**Status:** CONFIRMED
**Evidence:** `net_worth_history`/`account_balance_history` tables exist but are only ever written once, at signup, with all-zero values (`user-bootstrap.ts:452-511`) — no recurring job updates them, and no chart reads from `net_worth_history` at all. Mobile never writes to either table (confirmed by full-repo grep). Both clients compute net worth from their own local formula (confirmed identical logic between `wealth.ts` and `transaction_provider.dart`), but on potentially different underlying data — any pending offline mobile transaction makes mobile's figure diverge from web's until the next sync.
**Fix:** Either implement a real recurring snapshot writer (scheduled function recomputing `net_worth_history` daily) and have the chart read from it, or drop the vestigial tables. Regardless, surface a "may be stale while offline" indicator on mobile's net-worth view.

### C8. No timestamp/version-based conflict resolution anywhere in sync
**Status:** CONFIRMED
**Evidence:** Grep across all sync files for `updated_at`/`compareTo`/`isAfter`/`isBefore` in merge logic found none used for conflict resolution — every merge decision branches solely on `SyncQueue.hasPending`/`hasPendingOp`/`hasPendingDelete` (`sync_service.dart:960-1438` various). Whichever device's queue drains and pushes last simply overwrites the other, with no signal to either user.
**Fix:** Add an `updated_at`/version column comparison: stamp local writes with a monotonic timestamp, and on pull only accept remote data if it's newer than the last-known-synced value for that record.

### C9. `SyncIds` derives every entity's remote id from mutable fields except transactions/plans — systemic root cause of D6/D7
**Status:** PARTIALLY TRUE
**Evidence:** Transactions and monthly plans correctly mint-once-and-store a `remoteId` after first push (`sync_service.dart:201-217, 286-290`). Every other entity type (accounts, categories, purposes, friends, contributors, settlements) re-derives a deterministic hash from mutable fields (name/month/index) on every single push — no stored immutable id exists for any of them.
**Fix:** Apply the transaction pattern (mint `uuid.v4()` once, store, reuse) to every entity type; only fall back to deterministic hashing as a one-time bridge for legacy pre-existing rows.

---

## UX

### U1. Onboarding is skipped for every brand-new user due to a stale purpose-count threshold
**Status:** CONFIRMED
**Evidence:** `accountHasExistingData()` (`lib/core/services/auth_service.dart:170-207`) checks `purposeCount.count > 1`, with a comment assuming only 1 purpose (Personal) is seeded. But `handle_new_user()` (`supabase/migrations/20260724_default_family_purpose.sql:72-79`) now seeds **2** purposes (Personal + Family) — so `2 > 1` is true immediately at signup, before the user does anything. Result: `has_seen_onboarding`/`isFirstTimeUser` get force-cleared (`auth_flow.dart:32-53`), the account-setup modal never fires (`home_screen.dart:67,79`), and users land on Home with two unlabeled default accounts (one explicitly flagged `needs_rename: true` in the seed SQL) and no onboarding.
**Fix:** Change the threshold to `purposeCount.count > 2` and update the stale comment/doc. This is a one-line fix with real user-facing impact.

### U2. "Repair" button omits categories, contributors, monthly plans, user-verified merchants, and settings
**Status:** CONFIRMED
**Evidence:** `requeueAllLocalDataAndPush()` (`sync_service.dart:1696-1812`) only re-enqueues accounts, transactions, outings, and friends. No block reads/enqueues categories, contributors, monthly_plans, merchants, or settings, despite the doc comment claiming it re-enqueues "all local Hive user data."
**Fix:** Add four more blocks mirroring the existing pattern for the missing entity types.

### U3. Failed sync-queue entries retry forever with no backoff or dead-letter, but don't block other entities
**Status:** CONFIRMED
**Evidence:** `pushPending`'s loop (`sync_service.dart:162-197`) catches per-entry and continues (confirms other entities aren't blocked) but never attaches a retry count or backoff — a permanently-failing row (e.g. NOT NULL violation) is retried every sync cycle indefinitely, forever, with no user-facing signal beyond a raw `lastPushError`.
**Fix:** Add `retryCount`/`nextRetryAt` to queue entries; implement exponential backoff and a dead-letter threshold that surfaces a "Sync issues" UI for manual resolution.

### U4. Wallet/Credit account creation is unreachable in mobile UI despite full model/mapping support
**Status:** REFUTED on "model only supports Bank/Cash" (model actually supports all 4 types + a real `toRemoteType`/`toLocalType` mapping exists) — CONFIRMED that creation is unreachable
**Evidence:** `account_model.dart:6-7,23` and `supabase_schema_map.dart:429-453` fully support Wallet/Credit. But every mobile UI call site hardcodes `type: 'Cash'` or `'Bank'` (`account_form_card.dart:93,104`, `premium_settings_screen.dart:742,744`) — no type-selector widget exists anywhere. Wallet/Credit accounts are only reachable via pull from web.
**Fix:** Add a type selector to the onboarding and settings account forms. Also delete the unrelated dead legacy `Account` model at `features/accounts/domain/account_model.dart` (typeId 0, unused) to avoid future confusion. (Reference doc SYNC.md's claim of a mapping function is correct; this doc is not stale — the mobile *UI* is simply incomplete relative to what the model/sync layer already supports.)

### U5. Credit accounts have no credit-limit/statement/due-date tracking (net-worth arithmetic itself is correct)
**Status:** PARTIALLY TRUE — REFUTED on the arithmetic bug (both clients correctly subtract credit balance as debt, confirmed identical formulas in `wealth.ts:210-268` and `transaction_provider.dart:399-444`); CONFIRMED on the missing columns
**Evidence:** No `credit_limit`/`statement_balance`/`due_date` column exists anywhere in the schema. Credit accounts function as bare debt trackers with no card-specific features.
**Fix:** Product decision — add the missing columns and UI if credit-card features are in scope; otherwise this is an accepted gap, not a bug.

---

## Confirmed correct (no fix needed)

- **`is_active` soft-delete parity for accounts** (item 3, section 3): both push and pull correctly honor soft-delete; mobile never hard-deletes an account row, and correctly filters `is_active` on pull and in net-worth calculation.
- **`investment_totals` SQL view itself**: correctly checks the real `is_investment` flag rather than force-matching by name (the bug is only in a client-side JS helper, see C5).

## Stale documentation flagged

- `docs/app/FLUTTER_APP_DOCUMENTATION.md` §14: incorrectly implies PIN is in secure storage — contradicted by code and by `docs/app/DATABASE.md` (which is accurate).
- `auth_service.dart`'s own inline comment (not a separate doc, but worth noting): assumes 1 seeded purpose, stale relative to the `20260724` migration's 2-purpose seed.

