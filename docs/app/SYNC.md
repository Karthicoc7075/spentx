# SpentX Mobile — Supabase Sync Architecture (Deep Reference)

> Source-verified against `lib/core/sync/*.dart` in full, plus `lib/core/services/outing_transaction_sync.dart` and `lib/core/services/auto_detection_native_sync.dart`, as of 2026-07-20. Supersedes `Mobile app/SpentX/docs/SYNC_WIRING.md` where they disagree (§9 lists every correction). Cross-reference: [DATABASE.md](./DATABASE.md) for the local Hive boxes this layer reads/writes, and the web repo's `docs/DATABASE_SCHEMA.md` for the target Postgres schema.

**Architecture in one line:** Hive is the only read layer the UI renders from; every local write goes Hive-first, then enqueues into a persisted `sync_queue` box, which a push loop drains to Supabase; a separate pull loop merges Supabase state back into Hive, but never overwrites a record that still has a queued local edit.

```
UI  ──reads──►  Hive (always, offline-capable)
User write ──► Hive first ──► SyncQueue (Hive box 'sync_queue')
                                   │  pushPending() — drains when online
                                   ▼
                               Supabase  ──pullAll()──►  merged into Hive
```

---

## 1. Table-by-table field mapping (`supabase_schema_map.dart`)

### Deterministic remote IDs (`SyncIds`)

UUIDv5, namespace `Uuid.NAMESPACE_URL`, so the same local record always maps to the same remote id — this is what makes push idempotent and lets `requeueAllLocalDataAndPush()` safely re-run without duplicating rows.

| Kind | Formula |
|---|---|
| Transaction / expense | reuse local id if already a UUID, else `spentx:$uid:tx:$localId` |
| Split | `spentx:$uid:split:$remoteTxId` |
| Friend / Account / Purpose / Merchant / Contributor | `spentx:$uid:<kind>:<name.lower.trim>` |
| Category | `spentx:$uid:cat:$type:$name` |
| Plan | `spentx:$uid:plan:$month:$purposeName` |
| Settlement | `spentx:$uid:settle:$expenseId:$memberId:$index` |

**`RemoteIdCache`** — Hive `settings` box keys `remote_account_ids`, `remote_purpose_ids`, `remote_contributor_ids` (name→uuid maps). Populated authoritatively by pull; extended on push for local names not yet seen server-side.

### Field maps

| Local box/model | Supabase table | Field map | Transform / notes |
|---|---|---|---|
| `transactions` | `transactions` | `amount→total_amount`, `isExpense→type` (`'expense'`/`'income'`), `paymentType→payment_method` (`'Cash'` else `'UPI'`), `isAutoDetected→entry_source` (`'sms-auto-detected'`/`'mobile-manual'`), `source='mobile'` fixed, `status='completed'` fixed, `has_splits=false` fixed | `id` = stored `remoteId` else `SyncIds.forTransaction`. `account` (name) → `account_id` via `_resolveRemoteAccountId`. `monthKeyFor(date)` derives `YYYY-MM`. Transfers/bank/last4/upi are encoded as synthetic `tags` entries (`transfer`, `transfer_to:`, `bank:`, `last4:`, `upi:`) — the web schema has no transfer concept, and **raw SMS text is intentionally never uploaded**. |
| same tx | `transaction_splits` (1 row/tx) | `id=SyncIds.forSplit`, `transaction_id`, `purpose_id` (resolved uuid), `category_id=category` (**name string**, matching web's name-keyed convention — see web `docs/DATABASE_SCHEMA.md` §5.2), `outing_id`, `contributor_id`, `amount`, `note=''` | `category` lives only on the split, never on `transactions`. `contributor_id` resolved only when `isExpense==false` (income). |
| `accounts` (`settings.onboardingAccounts`) | `accounts` | `name`, `type` (Title Case↔lowercase via `toRemoteType`/`toLocalType`: Bank/Cash/Wallet/Credit), `last4Digits→last4`, `openingBalance→opening_balance`, `isActive→is_active` | Soft delete only. Credit/wallet types are deliberately preserved for net-worth parity with web. |
| `outings` box | `outings` | `title`, `category→type`, `location`, `startDate→start_date`, `endDate→end_date`, `isActive→status` (`'active'`/`'completed'`), `isAutoMode→auto_add_mode`, `members` jsonb `{id,name,isCurrentUser}` | `created_by=uid` added (NOT NULL). `is_active` is always pushed `true` (it's the soft-delete flag, not running-state — **`status`** is the running-state field). "You" member identified by lowercase name match in both directions. |
| outing `expenses[]` | `outing_expenses` | `title/description→description`, `amount`, `category→category_id` (name), `date→expense_date`, `paidByMemberId→paid_by_member_id` (defaults `'you'`, NOT NULL), `splitType` (0/1) ↔ `split_type` (`'solo'`/`'equally'`), `memberIds`→computed `splits` jsonb `[{memberId, amount: amt/n}]`, `transactionId→linked_transaction_id` | `id=SyncIds.forExpense`. `source='bank-detected'` if linked else `'manual'`. Unique-violation on `outing_expenses_user_linked_tx_uidx` (the web-side dedupe index, see web `docs/DATABASE_SCHEMA.md` migration `20260728`) is swallowed — another client already owns the link, don't duplicate. FK failure on `linked_transaction_id` is retried once with the link stripped + `source='manual'`. |
| `settlementPayments` map | `settlements` | `from_member_id`=paying member, `to_member_id`=expense's payer, `amount`, `is_partial=true` fixed, `settled_date`, `note='exp:<remoteExpenseId>'` | `id=SyncIds.forSettlement(uid, expenseId, member, index)`. The `note` marker is how mobile's per-expense payments round-trip through web's outing-level settlement rows; web-created settlements (no `exp:` note) apply FIFO against the member's pending share on pull. |
| `friends` box | `friends` | `name`, `phone`, soft-delete `is_active` | Only name+phone pushed — never a full contact upload. |
| `settings` (subset) | `users` | `private_mode`, `default_account_id` (name resolved to uuid) | PIN hash/biometrics/SMS toggle/debug flags are **explicitly excluded** — no schema-map entry exists for them at all (source comment: "must never be here"). `app_pin_reset_at` is pulled **read-only** as a reset signal → `PinService.applyRemotePinResetIfNeeded`. |
| `settings.purposeTypes` | `purposes` | `name`, `color` (fixed `#57BE93` Personal / `#8B84D7` other), `is_default`/`can_delete` (Personal only), `is_active` | Resolved by name via `RemoteIdCache`/live query, never invented if a server row already matches case-insensitively. |
| `settings.contributors` | `contributors` | `name`, `isDefault→is_default`, `canDelete→can_delete`, `isActive→is_active` | `"Me"` is force-kept/re-inserted locally as default, non-deletable. |
| category adds | `categories` | `name`, `type`, `color` (green income / orange expense, fixed), `icon='tag'` fixed | Push-only create; pull merges these with `global_settings.default_categories` (admin-managed, web side) into the `categories` box `expense`/`income` lists. |
| `merchants_box` | `user_merchants` | `payee`, `normalizedPayee→normalized_payee`, `title`, `purpose`, `category`, `isAutoApply→is_auto_apply`, `verifiedAt→verified_at`, `updatedAt` | Also mirrored into legacy `merchant_rules_box` on pull (`id=sync_$norm`) so old auto-detect code paths keep working post-reinstall. |
| `monthly_plans` box | `monthly_plans` | `month`, `title`, `purposeName→purpose_id` (resolved), `expectedIncome→expected_income`, `allocations` jsonb | `budget_set_at=now` on every push. |
| — | `sms_template_rules` / `sms_detection_rules` / `sms_block_rules` | see §6 | **Pull-only**, never enters the queue |

---

## 2. Push flow (`sync_queue.dart` + `sync_service.dart`)

**Queue structure:** `SyncQueue` is a single Hive box (`sync_queue`, key `items`) holding a flat list of `{id, entity, op, localId, payload, at}`.

- `enqueue()` removes any existing entry with the same `(entity, localId)` before appending — **upserts coalesce, last write wins.** A `delete` also removes/supersedes a queued `upsert` for that id via the same `removeWhere` logic.
- `hasPending`/`hasPendingOp`/`hasPendingDelete` are the read-side checks the pull loop uses to avoid clobbering unpushed edits (see §3).

**`pushPending()`:**
1. Sorts the queue by `_pushPriority` (`account=0`, `contributor/category=1`, `friend/friendDelete/userMerchant/userSettings=2`, `outing=3`, `transaction=4`, `monthlyPlan=5`, else `9`), then by `at` ascending within a tier — so referenced entities (accounts, categories) push before the transactions/outings that depend on them.
2. Iterates `_pushEntry` per queued item.
3. On success: `SyncQueue.remove(id)`.
4. On exception: the entry is **left in the queue** — implicit retry next cycle, no max-retry count or backoff. `lastError`/`lastEntity` recorded to `settings.sync_last_push_error`/`_at`/`_ok` (surfaced in Developer Options).

**Transaction pushes** go through `_upsertTransactionWithOutingFallback` — retries once with `outing_id=null` if the FK fails, so an outing that hasn't reached the server yet doesn't block the money row from syncing — then stamps `remoteId` back onto the local Hive row via `_stampLocalTransactionRemoteId`.

**Outing pushes** go through `_pushOutingDocument`, which also **prunes remote children**: `_deleteMissingChildren` for expenses, and a `.not('id','in',...)` delete scoped to `note LIKE 'exp:%'` for settlements — so locally-removed expenses and mobile-authored settlements disappear server-side too, while web-created settlement rows (no `exp:` marker) are left untouched.

**`requeueAllLocalDataAndPush()`** — the Developer Options "repair" action: re-enqueues every account/transaction/outing/friend from Hive and force-runs `pushPending()` twice, bypassing the normal 45-second throttle. Safe to re-run because every id is deterministic (§1) — it upserts, never duplicates.

---

## 3. Pull flow (`pullAll()`)

**Order:** `_pullAccountsAndPurposes` → `_pullCategories` → `_pullContributors` → `_pullMonthlyPlans` → `_pullUserMerchants` → `_pullTransactionsWindow` → `_pullOutings` → `_pullFriends` → `_pullUserSettings`. Merchants intentionally pull **before** transactions so SMS auto-add has fresh merchant rules available immediately after a reinstall/pull.

- **Transactions:** window = `now - 35 days` (`windowDays=35`), extendable backward via `fetchTransactionRange` (used by "Load older transactions" on Activity/Analytics), and remembered in `settings.tx_cache_extended_since` so the periodic 35-day reconcile doesn't prune history that "Load older" already fetched. `_mergeTransactionRows`: upserts every server row (mapped via `TransactionMap.toLocal`, splits joined in chunks of 100 ids); rows with a **pending offline delete are dropped, never resurrected**; rows with any other pending op are left untouched entirely (local wins until pushed). With `reconcileWindow=true`, it removes local rows older than the extended-start, and drops in-window rows absent from the server's remote-id set (server-side delete) — unless they're pending, or `isPendingVerification==true`.
- **Accounts/purposes:** full pull filtered `is_active=true`, rebuilds the `RemoteIdCache` name→id maps, then reconciles `settings.onboardingAccounts`/`purposeTypes`, keeping only local entries still `SyncQueue.hasPending` (offline creates) — anything else missing server-side is dropped.
- **Outings:** full pull of outings + expenses + settlements (all by `user_id`, outings additionally `is_active=true`), skips any outing with `SyncQueue.hasPending(outing, id)`; settlement rows are matched to expenses via the `exp:<id>` note marker, and unmatched ("unlinked") settlements apply FIFO across the member's outstanding shares.
- **Friends/contributors/user_merchants:** server-active rows are authoritative; local-only entries are kept solely if `SyncQueue.hasPending`.
- **Users row:** `private_mode`, `profile_name` (skipped if `settings.profile_name_user_set==true`), `default_account_id`→name, and `app_pin_reset_at` → `PinService.applyRemotePinResetIfNeeded` → fires `onPinResetApplied`.

**"Never overwrite local edits" is concretely:** `SyncQueue.hasPending(entity, localId)` (or `hasPendingOp`/`hasPendingDelete`) checked per-row before any local mutation during merge. There is **no timestamp/version-based conflict resolution anywhere in this codebase** — presence in the sync queue is the sole conflict signal.

---

## 4. `background_data_sync.dart` — the WorkManager entrypoint

`BackgroundDataSync.runFullBackgroundSync()` is the **WorkManager isolate entrypoint**, dispatched from `workmanager_entrypoint.dart` (`smsWorkmanagerCallbackDispatcher`, task name `spentx.syncDataQueue`) — a headless Dart isolate with no Flutter widget tree. It manually runs `Hive.initFlutter()`, `SyncQueue.ensureOpen()`, `AuthService.init()`, opens the boxes it needs, then simply calls `SyncService.fullSync()` — it's a bootstrap wrapper, not separate sync logic. Registered as a periodic task every **15 minutes** (`BackgroundSmsScheduler.registerPeriodic`, `networkType: connected`), plus one-off tasks fired via `enqueueDataSync()`/`enqueueImmediate()` on app pause and after every `_kickPush()` call.

## 5. `connectivity_sync_listener.dart`

Subscribes to `Connectivity().onConnectivityChanged`; "online" = any of mobile/wifi/ethernet/vpn. Debounced **20 seconds** (`_lastOnlineKick`) to avoid flaky-radio spam triggering repeated syncs. Behavior:
- Was previously offline this session → transition to online triggers `SyncService.fullSync()` (push + pull).
- Never seen offline this session, online→online blip → just `SyncService.pushPending()`.

Started/stopped from `main.dart` `_setupSync()`/`dispose()`.

## 6. `sms_rules_refresh_service.dart` — pull-only admin path

Entirely separate from `SyncQueue` — source comment: *"Nothing here ever writes to those tables."* `refreshIfStale()` gates on `settings.sms_rules_last_refresh_at` (24h). `_refreshTable` runs per table: `sms_template_rules` → local `templateRules` box (`RuleTableMap.templateToLocal`), `sms_detection_rules` → `regexRules` box (`detectionToLocal`), `sms_block_rules` → `blockRules` box (`blockToLocal`). Preserves any local rows with `isManual==true` or legacy rows never tagged `fromAdmin`. Clears and rewrites the rest of the box; deletes locally any inactive server row (`is_active=false`) that was previously `fromAdmin`. Re-runs `SmsRuleEngine.init()` + `BankSmsV4Parser.ensureLoaded()` afterward so an admin's rule edit applies mid-session with **no app restart**. Triggered by auto-refresh (daily) + a manual "Refresh Detection Rules" button in Developer Options.

## 7. `outing_transaction_sync.dart` — NOT a Supabase sync path

A purely local/in-memory helper (no network, no Hive I/O of its own) used by `OutingProvider.syncTransactionExpense`/`reconcileTransactionExpenses` (`lib/core/providers/outing_provider.dart:704,747`) to build/update an `OutingExpense` when a transaction gets tagged with an `outingId` (auto-add-mode SMS link, or a manual link) — computing the default split (`solo` if no other friends, else `equally` across all members) and preserving an existing `paidByMemberId`/split on update.

This is the **mobile analogue of the web `useOutingTransactionSync` hook** (see web `docs/FULL_APP_DOCUMENTATION.md` §7.5, the outing-rollup bug that was fixed there) — but the two architectures differ meaningfully: this only mutates the in-memory `Outing`/Hive `outings` box; the actual network sync happens afterward when the caller invokes `_putAndSync` (`outing_provider.dart:593`) → `SyncService.queueOutingUpsert`, which pushes the **whole outing document** (title/members/**all** expenses) via `_pushOutingDocument`. **There is no incremental "just update the total" RPC on the mobile side** — every outing edit re-pushes the full expense list, and (matching web) the outing total itself is never stored as a column on either side; it's always implicit from summing the expense rows.

## 8. `auto_detection_native_sync.dart` — a different kind of "sync" (no Supabase involved)

This is a **local platform bridge**, not backend sync, and is worth keeping conceptually separate from everything above:
- `syncToNative()` mirrors Hive `settings.auto_detection` (bool) into SharedPreferences key `auto_detection`.
- `syncMerchantsToNative()` mirrors `merchant_rules_box` into a SharedPreferences JSON string `known_merchants_json`.

Purpose: native Android code (the SMS `BroadcastReceiver`, the `NotificationListenerService`) runs outside the Dart/Supabase world and reads SharedPreferences directly to decide whether to auto-detect and which merchants are already known — it never touches Supabase, `SyncQueue`, or `SyncService`. Called from `main.dart`, `merchant_provider.dart`, `merchant_rule_service.dart`, `app_reset_service.dart`, `settings_screen.dart`, `merchant_learning_service.dart` — i.e., anywhere merchant rules or the auto-detect toggle change.

---

## 9. Every sync trigger point (file:line)

| Trigger | Call | Location |
|---|---|---|
| App start (post-frame, already signed in) | `SyncService.start()` | `lib/main.dart:195` |
| Every app resume | `SyncService.onForeground()` | `lib/main.dart:260` |
| Connectivity listener start/stop | `ConnectivitySyncListener.start()`/`.stop()` | `lib/main.dart:192,203` |
| Successful login/signup | `SyncService.start()` | `lib/features/auth/presentation/auth_flow.dart:113` |
| Splash / lock screen "Forgot PIN" | `SyncService.checkAndApplyPinReset()` | `splash_screen.dart:97`, `lock_screen.dart:59` |
| App paused/inactive | `BackgroundSmsScheduler.enqueueImmediate()`/`enqueueDataSync()` (→ WorkManager → `BackgroundDataSync`) | `lib/main.dart:214-215` |
| Every entity mutation | `queueTransactionUpsert/Delete`, `queueOutingUpsert/Delete`, `queueAccountUpsert/Delete`, `queueFriendUpsert`, `queueContributorUpsert/Delete`, `queueCategoryUpsert`, `queuePlanUpsert/Delete`, `queueMerchantUpsert/Delete`, `queueUserSettings` (each internally calls `_kickPush()`) | `transaction_provider.dart`, `outing_provider.dart:596,631`, `user_state_provider.dart`, `contributor_provider.dart`, `category_provider.dart`, `plan_provider.dart`, `merchant_learning_service.dart`, `private_mode_provider.dart:16`, `auto_rule_engine.dart:343` (SMS auto-add) |
| Periodic in-app timer | `Timer.periodic` → `fullSync()`, **every 30 minutes** | `sync_service.dart:63` |
| Periodic WorkManager (headless) | `registerPeriodic`, task `spentx.syncDataQueue`, **every 15 minutes** | `background_sms_scheduler.dart:44-52` |
| App reset / logout | `SyncService.pushPending()` — 10s timeout, best-effort flush before wipe | `app_reset_service.dart:24` |
| Settings → sign out | `SyncService.stop()` | `settings_screen.dart:503` |
| Dev Options "repair" button | `SyncService.requeueAllLocalDataAndPush()` | `developer_options_screen.dart:43` |
| "Load older" (Activity/Analytics) | `SyncService.fetchTransactionRange()` | `transactions_screen.dart:59`, `analytics_screen.dart:63` |
| Daily admin SMS rules refresh | `SmsRulesRefreshService.refreshIfStale()` | `main.dart:196,261`, `auth_flow.dart:114` |

---

## 10. Corrections to `docs/SYNC_WIRING.md`

The mobile project's own `SYNC_WIRING.md` is a good high-level summary but gets several specifics wrong or omits them — corrected here against the actual code:

- **Periodic interval:** doc says "periodic 15-min timer" for the in-app sync; the actual in-app `Timer.periodic` is **30 minutes** (`sync_service.dart:63`, source comment "was 15"). The 15-minute figure only applies to the *separate* WorkManager background task (§4/§9).
- **Resume throttle:** doc says "self-throttled to 2 min"; the actual logic is `onForeground()` skips the **pull** if `_lastPullAt` was < 5 minutes ago (pushes still run), and `fullSync()` itself has a separate **45-second** global throttle.
- **Missing tables:** the doc's table list omits `categories`, `contributors`, `monthly_plans`, and `user_merchants` — all four are present and actively synced (§1) — plus it never mentions the deterministic `SyncIds`/`RemoteIdCache` machinery every FK resolution depends on.
- **Missing push ordering:** the doc doesn't mention `_pushPriority` tiering or the outing-FK/linked-transaction unique-violation fallback logic (§2) — it only vaguely says "upserts prune remote children removed locally."
- **"Never overwrites local edits" under-specified:** the doc states this as a general property without saying *how* — it's concretely `SyncQueue.hasPending*` checks (§3), not a version/timestamp compare. Worth stating explicitly since there is genuinely no other conflict-resolution algorithm in the codebase.
- **Conflates two different "background" mechanisms:** the doc doesn't distinguish the WorkManager background push isolate (`BackgroundDataSync`, §4, 15-min periodic + one-off, network-gated) from the in-app `SyncService` timer (§9, 30-min) — it talks about "background sync" as one thing when it's architecturally two.
- **Never mentions the native-bridge concept:** `auto_detection_native_sync.dart` (§8) isn't referenced anywhere in the doc — a reader could easily assume all "sync" in this app means Supabase sync; it doesn't, and the two are unrelated mechanisms (SharedPreferences-only vs. Postgres-backed).
- **Omits the outing-auto-link mechanism:** `OutingTransactionSync`/the auto-link-to-outing logic (§7) and its relationship to `queueOutingUpsert` (full-document push, no incremental total sync) aren't mentioned at all.
