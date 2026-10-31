# Offline naming audit

Status: fixed in Steps 1–4. Main commits: app `aa31f07`, `82a84c3`, `86cb5b9` (session/data safety), `ed8d973`, `59839ee` (Phone only upload gates and choice), `f85233a`, `c1cfb90`, `7843698` (names); website `daf8ce5`, `574f61e`, `66294f0` (names/privacy). Step 4: app `7aab0f6` (text), `5b28cd5` (docs/comments), and this website documentation commit, recorded in [FEATURE_STATUS.md](./FEATURE_STATUS.md). The original findings below are a historical snapshot, not the current contract.

Audit only. No app code was changed. Date: 2026-10-31.

Two different things share the word **offline** today:

1. **Storage choice.** The person chose to keep money data on this phone. New name: **Phone only**. New code: `StorageMode.phoneOnly`.
2. **Internet state.** A Cloud sync person has no internet right now. New name: **No internet**. New code: `isOnline` / `!isOnline`.

A third bucket is **unclear**: the same word, comment, or sentence is doing both jobs, or a reader cannot tell which job it is.

**Risk** in the table is the risk of editing that line. **High** means a rename or a wrong edit can change who syncs, who stays signed in, or what gets deleted. **Med** means a person sees the words, or the next code change is likely to mix the two meanings. **Low** means a test fixture, a history note, or a comment that already means only "no internet".

## Scope

Searched the live tree for: `offline`, `isOffline`, `offlineMode`, `localOnly`, `local_only`, `noInternet`, `connectivity`, `storage mode`, `use offline`, `100% offline`, `zero data`, plus the Hive flag `is_offline_mode` and `offline_user`.

Included: Flutter app `Mobile app/SpentX` (lib, test, android, ios, docs, README), website `src/`, `supabase/migrations`, `docs/`, `bugs/`, handoff notes, and root audits.

Left out on purpose: `node_modules/`, `.next/`, Flutter `build/`, `.dart_tool/`, the old snapshot `Mobile app/SpentX-backup-20261001-115548/`, and the `.tgz` backups. Those are not the running app.

Search terms with **no** hit: the identifier `noInternet`, the exact phrases `100% offline` and `zero data`, and `local_only` with an underscore. Close cousins that did hit: "100% functional without an internet connection", "Zero cloud sync", and `_localOnly`.

`ios/` has no matches.

Counts below are one row per matching line, plus one adjacent Settings line called out in the last row.

## A. Storage rules today

What the code does now. "Upload list" means the Hive `sync_queue` (and the other outboxes: goals, investments, snapshots, projector, recurring bills). "Synced" means a successful Supabase write.

### 1. Phone only user (any internet)

Storage flag: `settings.is_offline_mode == true`. There is usually no Supabase session. The owner id used for SMS is the sentinel `offline_user`.

- **Where data is saved.** Encrypted Hive on the phone (transactions, accounts, settings, SMS evidence). `TransactionSave.save` writes the ledger first.
- **Upload list.** Yes for money rows. `queueTransactionUpsert`, `queueAccountUpsert`, and `queuePurposeUpsert` do **not** look at `is_offline_mode`. Every normal save still appends a queue row. `pushPending` and `fullSync` return immediately unless `AuthService.isSignedIn`, so the queue sits on the phone and is not sent.
- **Synced.** Money is not synced while there is no session. Two things still leave the phone when the internet is on: masked template requests (anon RPC, daily cap 5) and a support SMS the person taps. Admin SMS/merchant/category rules are **downloaded**, not uploaded. The privacy policy already says the masked-format send happens in Local Only mode.
- **Next sync.** Nothing money-related, until a session exists. If the person later taps Switch or Sign In, the flag is deleted and the queue is **not** cleared. The next signed-in `fullSync` pushes that queue. That is a real upload of data that was saved under Phone only.
- **Can anything be deleted.** Cloud reconcile does not run without a session, so a pull cannot delete the ledger. Reset App Data wipes the phone. If a session is still present at the same time as the flag (see C), a normal cloud pull can delete rows the server marks deleted.

### 2. Cloud sync user, online, signed in

Flag is false. `AuthGatedServices.start` calls `SyncService.start`, `ConnectivitySyncListener`, and realtime.

- **Where data is saved.** Hive first, then the upload list (`TransactionSave` → `queueTransactionUpsert`, unless the row is still `isPendingVerification`).
- **Upload list.** Yes. `_kickPush` calls `pushPending` and also schedules the WorkManager data-sync job.
- **Synced.** `fullSync` pulls accounts/purposes, pushes the queue, then `pullAll`. A network error keeps the queue row and retries with backoff. A permanent rejection (RLS or a constraint) parks the row.
- **Next sync.** The 30-minute timer, app resume, the connectivity listener, and WorkManager all call `fullSync` again. Push runs before the full pull when the queue is not empty.
- **Can anything be deleted.** Yes, on purpose, when the server row is inactive or has `deleted_at` and the phone has no newer local edit. A local row the server has **never** seen is kept and queued again (`_keepMissingTransactions`). A pending upload is kept. The old comment that says "drop local rows older than 35 days" is **not** what `_pullTransactionsWindow` does now: that pull reads every active server row and does not delete by age. The comment is stale and dangerous if someone "fixes" it by adding the prune back.

### 3. Cloud sync user, no internet, signed in (salary case)

Same flag as case 2: `is_offline_mode` is false. No internet is a different fact (`ConnectivityResult.none`, or a failed request).

- **Where data is saved.** Hive, including a salary SMS saved in the background. `TransactionSave` is the same path the UI and the background auto-add use.
- **Upload list.** Yes, unless the row is still waiting for review (`isPendingVerification`). The salary end-to-end test (`test/offline_autoadd/e2e_offline_salary_repro_test.dart`) expects the salary to stay in the ledger **and** on the upload list.
- **Synced.** No. `pushPending` records the failure and leaves the queue row. It does not drop it for a network error.
- **Next sync.** When a request works again: push the queue first, then pull. The pull keeps a pending salary. If the queue row was missing, and the server has no copy, the pull queues it again. If the server cannot be asked, the pull removes nothing (`fix3_reconcile_keeps_unsynced_test.dart`). A second sync does not duplicate it.
- **Can anything be deleted.** Not by the reconnect pull, for a salary that is queued or that the server has never stored. It **can** still be deleted by a wipe that runs before that push. Those wipes are in section D. They are not the old "server did not return this row, so delete it" bug. That bug is guarded in `_mergeTransactionRows` today.

Lost-SMS recovery does not remove the salary. For a Cloud user it asks the server which ids are really gone. If that ask fails (no internet), it returns without adding and without deleting, and tries on the next open. Phone only recovery does not ask the server.

### 4. Cloud sync user, signed out

- **Where data is saved.** It should not be. Sign-out wipes Hive (`clearLocalDataOnSignOut` inside `AuthService.signOut`). SMS services are stopped. `canUseProtectedFeatures` is false.
- **Upload list.** A normal Settings sign-out tries to flush the queue first and **refuses** to sign out if the flush fails (`UnsyncedChangesException`). The queue is not thrown away by that button while the internet is down.
- **Synced.** Only what was flushed before the wipe.
- **Next sync.** The next sign-in starts empty on this phone and pulls the cloud account. Anything that never uploaded is gone, because the wipe already happened after a successful flush, or because a destructive sign-out skipped the flush.
- **Can anything be deleted.** Yes. The destructive sign-out (`discardUnsyncedChanges: true`) skips the flush and wipes the phone. Callers: splash when the session is judged invalid and the storage flag is false, resume in `main.dart` on the same condition, the 1-year token age, and the auth-state listener when the session drops. Account-revoked uses `AppResetService.resetAll`, which also tries a 10-second flush and then wipes anyway.

## B. Places where ① and ② are mixed

These are the spots where one name is used for both meanings, or two meanings sit in the same screen or function.

1. **Onboarding storage screen** (`storage_mode_step.dart`). The Cloud card says "Works offline with automatic sync later" (② no internet). The other card is titled "Use Offline" (① phone only). A reader can think both cards are about the internet. The review step then badges the phone choice as "Offline" (`review_setup_step.dart` line 277) while the long label says "Local Only".
2. **`isOffline` reads `is_offline_mode`.** Splash (`splash_screen.dart` 119), resume (`main.dart` 450 and 468), Settings, the router, and native `isOfflineMode()` all use an internet-shaped name for the storage flag. Four lines under the splash flag, the comment "offline start must not hang" means ②. Same function, both meanings. The dangerous part: resume **skips** the session check only when the storage flag is set. A Cloud user with no internet is not `isOffline`, so they still enter the "invalid session → wipe" path. The name suggests the opposite.
3. **Activity and Analysis snacks** (`transactions_screen.dart` 722 and 3121, `analytics_screen.dart` 308). `fetchTransactionRange` returns null when there is no session **or** the request failed. The snack always says "Offline". A Phone only person and a Cloud person with no internet see the same sentence. Phone only cannot "connect to load older transactions" from this account; that sentence is only true for ②.
4. **`lost_sms_recovery.dart`.** `_localOnly` is the storage flag (①). The comment "Local Only runs offline" and `// offline: try again next open` are ② (the server lookup returned null). A future edit that treats `_localOnly` as "no internet" will skip recovery for a Phone only user, or will ask the server for a Cloud user who is merely offline.
5. **`template_request_service.dart`.** `offlineDailyLimit` and `uid == 'offline_user'` are ① (no account). Line 287, "Offline, RPC missing or limit", is a failed send (② or a server error). One file uses offline for both the person and the network.
6. **`auth_gated_services.dart`.** `_isOfflineUserActive` is ①. The listener `_offlineTemplateSub` is ② (retry masked requests when the radio returns) and is started only for the unsigned Phone only path. `ConnectivitySyncListener._wasOffline` is ② for signed-in users. Both are "offline" and both start work when the radio changes.
7. **`main.dart` pause comment** "SMS drain + offline data push". The boolean `isOffline` is ①. The push itself is the ② outbox. `enqueueImmediate()` always registers `spentx.syncOnce` (a cloud push when the network is connected), and the pause path calls it for Phone only users too. The extra `enqueueDataSync()` call is gated on `isSignedIn`, which hides the fact that `enqueueImmediate` already scheduled the same job.
8. **SQL** `20261027100000_public_admin_rules_anon_read.sql` line 2: "Allows offline mode / unauthenticated mobile apps". That grant is for people with no account (①) so they can download public rules. It is not an internet flag. The word "offline mode" here is the storage choice.
9. **Website** `useSyncStatus.ts` `isOffline` is ② (`!navigator.onLine`). Nothing in `src/components` reads it today. It must not be copied onto the mobile storage flag, and the mobile `isOffline` must not be copied here.
10. **Privacy policy** (`docs/PRIVACY_POLICY.md` line 61 and `src/app/privacy/page.tsx` line 149). "Works offline" means the masked template request can be sent with no account (①) and also when the send itself has to wait (②). The same sentence is doing both.

## C. Where a Phone only user can sync or upload

Money upload is gated on a session, not on the storage flag. These are the holes.

1. **The upload list is filled anyway.** `TransactionSave`, `user_state_provider.dart` (accounts and purposes), and `SyncService.queue*` never check `is_offline_mode`. The rows wait. The moment a session exists, `fullSync` / `pushPending` send them. Switch in Settings deletes the flag and opens `/auth`. It does not clear `sync_queue`.
2. **Choosing Phone only does not sign out.** `_handleStorageModeContinue` sets the flag and continues. If the person already signed up earlier in the same onboarding (Cloud, then Edit, then Use Offline), `AuthService.isSignedIn` stays true. Finish calls `AuthGatedServices.syncWithSession`, which starts `SyncService` because of the session. Phone only data is then pushed.
3. **Pause schedules a cloud push for Phone only.** `BackgroundSmsScheduler.enqueueImmediate` registers `spentx.syncOnce` with `NetworkType.connected`. `main.dart` calls it when `isSignedIn || isOffline`. `BackgroundDataSync.runFullBackgroundSync` no-ops without a session (`initForBackground`). With a leftover session it runs `fullSync`.
4. **Every save kicks that job.** `SyncService._kickPush` calls `enqueueDataSync()` with no storage-flag check. Unsigned, the worker no-ops. Signed-in plus the flag, it pushes.
5. **Masked template requests and tapped support SMS are uploaded on purpose** while Phone only and online (`TemplateRequestService`, anon RPC, `offline_user` daily cap). This matches the privacy policy. It is still an upload. It is not the money ledger.
6. **Admin catalogs are downloaded** for Phone only (`AdminDataSync.checkVersions`, anon SELECT). That is not an upload of the person's money. The SQL comment calls it offline mode.

Native `SpentXDetectionPrefs.sessionUid` returns `offline_user` when the flag is set and no session uid is stored. It does not by itself upload. If a real session uid is still in the keystore, that uid wins, and background detection is attributed to the cloud account.

## D. Where a Cloud user with no internet can lose data

The salary pull itself keeps the row today. Loss is from a wipe that runs while the upload has not landed.

1. **Invalid session while the radio does not look "off".** `hasValidSession` skips refresh only when `StartupNetworkGuard.deviceOffline()` is true, and that is only `ConnectivityResult.none`. An empty result or a plugin error is treated as **online** (`fix6_splash_offline_test.dart`). A non-retryable `AuthException` calls `signOutSessionOnly` and returns false. Splash and resume then call `signOut(discardUnsyncedChanges: true)` because `is_offline_mode` is false. That wipes Hive, including a salary that never uploaded. A Wi-Fi icon with no real internet is the hole. A radio that is fully off is the path the salary test and Fix 6 protect.
2. **Auth stream drops the session.** `main.dart` listens for `signedOut` / a null session and calls the same destructive sign-out. A refresh the plugin reports as signed out, while the salary is only local, deletes it.
3. **`fullSync` setup check.** Before the push, `isAccountSetupCompleted()` reads `users.setup_completed`. A thrown network error is ignored and the sync continues (push will fail, queue stays). A **null row** returns false. If the phone also has local data, `onAccountReset` runs `resetLocalDataKeepSession` and **returns without pushing**. That deletes the salary. It happens if onboarding's `complete_account_setup` RPC never landed (the local flag was set in the `catch`) and a later sync can read the user row as not set up. It does not happen on a plain network throw.
4. **Account-revoked check.** `verifyAccountStillExists` returns false for specific refresh/user-not-found errors, and `onAccountRevoked` calls `resetAll`. A plain timeout returns true and does not wipe. A gateway that answers with those auth strings would wipe.
5. **Server delete marker.** On the next successful pull, a row with `is_active = false` or `deleted_at` is removed locally if the phone does not have a newer edit. A salary the server has never stored is not in that set. A salary the server once stored and then deleted is removed. That is intended, and it is easy to confuse with the old bug.
6. **Reset App Data while offline.** The flush is best-effort for 10 seconds, then the wipe runs anyway. Unsynced salary is deleted on purpose by that button.
7. **Manual Sign Out while offline does not wipe.** It waits for a successful flush and throws if the flush fails. The person stays signed in and the salary stays. Do not "simplify" that into the destructive path.
8. **Stale prune comment.** `sync_service.dart` still says local rows older than the window are dropped. The transaction pull does not do that. Re-introducing it would delete a salary that is outside a short window and not yet on the server, if it were also not pending. That is how the old bug felt. Leave the comment until the code and the words match.

`docs/app/SYNC.md` still describes a 35-day reconcile that drops in-window rows the server did not return. The code now keeps those rows unless the server has a delete marker. The doc is behind the code. Treating the doc as the spec would bring the salary bug back.

## E. Change list, in safe order

Do not rename the Hive key and the readers in one commit. Old installs still have `is_offline_mode` in `settings` and in Android `FlutterSharedPreferences`.

### Step 1. UI text only

No flag rename. No sync change.

| Current | New |
|---|---|
| Use Offline | Phone only |
| Continue Offline | Use this phone only |
| Stay Offline | Stay on this phone |
| Offline Vault | Phone only |
| Local device storage • Zero cloud sync | On this phone only. Nothing is synced. |
| Review badge `Offline` | Phone only |
| Review line `Local Only (money data stays on this phone)` | Phone only |
| Cloud bullet `Works offline with automatic sync later` | Works with no internet. Syncs when you are back online. |
| Activity / Analysis `Offline — …` | No internet. Showing only what is already on this phone. |
| Settings dialog "Offline Vault mode" | Phone only |
| Welcome line "stay offline" | keep data on this phone only |

Privacy policy: split the one sentence into "Phone only can still send a masked format" and "if there is no internet, the request waits".

### Step 2. New names beside the old flag

Add `StorageMode.phoneOnly` and a helper `isPhoneOnly` that reads `is_offline_mode`. Add `isOnline` for the radio. Leave the Hive key and `offline_user` in place. Point new UI and new comments at the new names. Do not delete the old names yet.

Gate to add in this step, still using the old key underneath: `queue*` and `_kickPush` and `enqueueImmediate`'s sync task do nothing when `isPhoneOnly && !isSignedIn`. Signing in from Phone only should be an explicit "upload what is on this phone" action, not a silent flush of a queue the person never agreed to send. Choosing Phone only after a session exists should sign out of cloud sync or refuse the choice until sign-out finishes.

### Step 3. Call sites, in small patches

One area per patch, tests updated with the patch:

1. Onboarding and auth landing (writes the flag).
2. Router and splash (reads the flag for navigation only).
3. Settings and the vault card.
4. `AuthGatedServices` and `main.dart` resume. Split the session-wipe condition off the storage flag in the same patch, and add a test: Cloud user, `deviceOffline == true`, expired token, salary queued, resume does not call `signOut(discardUnsyncedChanges: true)`.
5. SMS session id. Keep accepting `offline_user` as a read alias so already-stored evidence still matches.
6. Native `SpentXDetectionPrefs.isOfflineMode` → `isPhoneOnly`, same pref key.
7. Template-request limit names (`phoneOnlyDailyLimit`) and the "send failed" comment that currently says Offline.
8. Lost-SMS recovery: `_localOnly` → `isPhoneOnly`. The null server check stays `noInternet`.
9. Website `useSyncStatus` → `isOnline`, even though nothing renders it yet.
10. Docs and the stale 35-day prune comments, after the code patches, so the docs describe the code that shipped.

### Step 4. Old names last

Write `storage_mode = phoneOnly` and mirror it to the old `is_offline_mode` bool for one release. Next release, read the new key first and fall back to the bool. Only then delete `is_offline_mode`, `offlineOnly`, and the `offline_user` write. Do not remove the `offline_user` **read** until a migration has rewritten stored SMS owner ids.

Do not rename `ConnectivitySyncListener` in the same patch as the Hive key. It is ② only.

## Inventory

One row per hit. Paths are from the website repo root.



| File | Line | Current name/text | Meaning (① choice / ② internet / ③ unclear) | Proposed new name/text | Risk (low/med/high) |
|---|---:|---|---|---|---|
| `src/app/privacy/page.tsx` | 149 | <strong>Template Requests (On by Default):</strong> When SpentX finds a bank SMS format it doesn&apos;t recognise yet, it sends us a masked copy where every personal value (amounts, account numbers, references, UPI ID... | ③ | Say Phone only and no internet as two facts. This sentence uses offline for both. | med |
| `src/components/outings/CreateOutingModal.tsx` | 338 | /* offline / RLS — still select locally */ | ② | no internet | low |
| `src/hooks/useSyncStatus.ts` | 20 | const [isOffline, setIsOffline] = useState(false); | ② | `isOnline` / dismiss the no-internet banner | med |
| `src/hooks/useSyncStatus.ts` | 21 | const [offlineDismissed, setOfflineDismissed] = useState(false); | ② | `isOnline` / dismiss the no-internet banner | med |
| `src/hooks/useSyncStatus.ts` | 24 | const update = () => setIsOffline(!navigator.onLine); | ② | `isOnline` / dismiss the no-internet banner | med |
| `src/hooks/useSyncStatus.ts` | 27 | window.addEventListener("offline", update); | ② | no internet | low |
| `src/hooks/useSyncStatus.ts` | 30 | window.removeEventListener("offline", update); | ② | no internet | low |
| `src/hooks/useSyncStatus.ts` | 40 | isOffline, | ② | `!isOnline`. UI text: No internet | med |
| `src/hooks/useSyncStatus.ts` | 41 | offlineDismissed, | ② | `isOnline` / dismiss the no-internet banner | med |
| `src/hooks/useSyncStatus.ts` | 42 | setOfflineDismissed, | ② | no internet | low |
| `src/lib/supabase-data.ts` | 2344 | // and falls back to get_shared_transactions RPC if offline. | ② | no internet | low |
| `src/lib/supabase-data.ts` | 2855 | // Offline/schema drift: fall back to the flag alone rather than either | ② | no internet | low |
| `src/lib/category-catalog.ts` | 94 | * Used only when the catalog cannot be read (signed out / offline first | ② | local-first; works with no internet | low |
| `supabase/migrations/20261027100000_public_admin_rules_anon_read.sql` | 2 | -- WHY: Allows offline mode / unauthenticated mobile apps to receive silent background updates | ③ | Unauthenticated / Phone only apps may read public rules. Not an internet flag. | med |
| `supabase/migrations/20261026100100_sync_user_changes.sql` | 15 | --     INSERT, so a row created offline and pushed later is not older than the | ③ | Say unauthenticated / no account, or no internet. This comment says offline mode. | med |
| `supabase/migrations/20261011_investments_goals.sql` | 12 | --      no-ops, so offline outbox retries never double count. | ② | waiting upload until the internet is back | low |
| `docs/PRIVACY_POLICY.md` | 61 | - **Works offline:** Requests can be sent even if you use SpentX in Local Only mode without signing in. | ③ | Split: Phone only may send a masked format; no internet means the request waits. | med |
| `docs/app/WORKFLOWS.md` | 350 | Local write (any entity) ──► Hive (synchronous, always succeeds offline) | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/WORKFLOWS.md` | 356 | - App start / every resume / login / connectivity regained | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/WORKFLOWS.md` | 483 | ### C. Transaction sync push (offline → online) | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/WORKFLOWS.md` | 486 | User (offline)         Hive                SyncQueue           Supabase | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/WORKFLOWS.md` | 492 | ... connectivity regained ... | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/WORKFLOWS.md` | 493 | ConnectivitySyncListener | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/FLUTTER_APP_DOCUMENTATION.md` | 50 | \| Connectivity \| `connectivity_plus: ^7.1.1` \| Gates sync/online-only features \| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/FLUTTER_APP_DOCUMENTATION.md` | 432 | UI  ──reads──►  Hive (always, offline-capable) | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/FLUTTER_APP_DOCUMENTATION.md` | 445 | - `fetchTransactionRange(from, to)` — on-demand older-history fetch that progressively extends the offline cache (drives the Activity screen's "Load older transactions" footer). | ② | saved copy used when there is no internet | low |
| `docs/app/FLUTTER_APP_DOCUMENTATION.md` | 464 | - **Activity:** "Load older transactions" footer fetches the next ~30-day slice older than the oldest cached row (offline → shows a clear message instead of silence). Search results carry a note that search covers onl... | ② | saved copy used when there is no internet | low |
| `docs/app/FLUTTER_APP_DOCUMENTATION.md` | 465 | - **Analysis:** switching to Month/Year triggers `_ensureRangeCached` — fetch-then-compute rather than silently charting partial data; offline shows a message. | ② | saved copy used when there is no internet | low |
| `docs/app/SYNC.md` | 8 | UI  ──reads──►  Hive (always, offline-capable) | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/SYNC.md` | 80 | - **Transactions:** window = `now - 35 days` (`windowDays=35`), extendable backward via `fetchTransactionRange` (used by "Load older transactions" on Activity/Analytics), and remembered in `settings.tx_cache_extended_... | ③ | Stale. The doc still says a 35-day pull drops rows the server did not return. The code keeps them unless there is a delete marker. | high |
| `docs/app/SYNC.md` | 81 | - **Accounts/purposes:** full pull filtered `is_active=true`, rebuilds the `RemoteIdCache` name→id maps, then reconciles `settings.onboardingAccounts`/`purposeTypes`, keeping only local entries still `SyncQueue.hasPen... | ② | saved copy used when there is no internet | low |
| `docs/app/SYNC.md` | 94 | ## 5. `connectivity_sync_listener.dart` | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/SYNC.md` | 96 | Subscribes to `Connectivity().onConnectivityChanged`; "online" = any of mobile/wifi/ethernet/vpn. Debounced **20 seconds** (`_lastOnlineKick`) to avoid flaky-radio spam triggering repeated syncs. Behavior: | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/SYNC.md` | 97 | - Was previously offline this session → transition to online triggers `SyncService.fullSync()` (push + pull). | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/SYNC.md` | 98 | - Never seen offline this session, online→online blip → just `SyncService.pushPending()`. | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/SYNC.md` | 128 | \| Connectivity listener start/stop \| `ConnectivitySyncListener.start()`/`.stop()` \| `lib/main.dart:192,203` \| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `docs/app/FEATURES.md` | 113 | "Load older transactions" footer (new, part of the sync layer — see SYNC.md §3) fetches the next ~30-day slice older than the oldest cached row; offline shows a clear message instead of silence. | ② | saved copy used when there is no internet | low |
| `docs/app/FEATURES.md` | 155 | "Ensure range cached" logic (new, sync-related) fetches-then-computes rather than silently charting partial data when switching to Month/Year; offline shows a message. | ② | saved copy used when there is no internet | low |
| `docs/app/FEATURES.md` | 236 | **Route:** `/developer-options`. Master Debug Logging + Debug Toast Messages + Log Retention dropdown → Master Debug Log. "Run System Health Check" (live diagnostic across Hive/SMS/notifications/merchant rules/pending... | ② | no internet, or local-first. Leave Phone only language out. | low |
| `docs/app/DATABASE.md` | 35 | \| **`sync_queue`** \| No \| `items` \| **Missing from `db.md` entirely.** The offline-first write queue feeding Supabase sync \| Active, undocumented in old `db.md` \| | ② | local-first; works with no internet | low |
| `docs/app/DATABASE.md` | 64 | ### 2.2 `sync_queue` — the offline write queue (undocumented gap in `db.md`) | ② | waiting upload until the internet is back | low |
| `docs/detection_v2/AUDIT.md` | 122 | *(Note: `lib/features/sms/v4/bank_sms_template_catalog.dart` / `assets/sms/bank_sms_templates_v4.json` will **NOT** be removed. It is kept permanently as the bundled offline seed for admin templates when cache is empt... | ② | saved copy used when there is no internet | low |
| `docs/detection_v2/AUDIT.md` | 369 | - `lib/features/sms/v4/bank_sms_template_catalog.dart` and `assets/sms/bank_sms_templates_v4.json` (both paths verified present at `ce003bd`) are **KEPT** permanently as the offline seed when cache is empty (fresh ins... | ② | saved copy used when there is no internet | low |
| `docs/detection_v2/AUDIT.md` | 459 | 7. The v4 catalog is kept as the offline seed. | ② | saved copy used when there is no internet | low |
| `docs/detection_v2/AUDIT.md` | 506 | - **Offline check:** a test proves OTP and promo SMS are still blocked by the built-in list when the admin cache is empty. | ② | saved copy used when there is no internet | low |
| `docs/Cross_Platform_UI_Field_DB_Mismatch_Audit.md` | 416 | 3. **Hive local cache on mobile** — offline-first; temporary lag vs web realtime is expected until sync. | ② | local-first; works with no internet | low |
| `docs/FEATURES.md` | 143 | \| Sync status \| Online/offline awareness \| | ② | no internet, or local-first. Leave Phone only language out. | low |
| `bugs/web-flutter-db-mismatch.md` | 412 | 3. **Hive local cache on mobile** — offline-first; temporary lag vs web realtime is expected until sync. | ② | local-first; works with no internet | low |
| `bugs/BUGS.md` | 183 | - Hive offline lag until sync | ② | no internet (test or note). Do not rename to Phone only. | low |
| `bugs/MORE_BUGS.md` | 101 | Maps correctly, but any code that assumes same JSON key across clients will break offline backups / exports. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `bugs/MORE_BUGS.md` | 245 | **Effect:** Expected offline-only — but web cannot show “pending verify” queue. Document as product split, not a money bug. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `README.md` | 804 | \| **EDGE-01** \| Offline Optimistic Rollback \| Disconnect internet connection (DevTools Offline mode). Try saving a transaction. \| Transaction shows optimistically, then rolls back gracefully with an error toast no... | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/lib/core/providers/category_provider.dart` | 516 | /// delete reaches the server (and offline). | ② | no internet | low |
| `Mobile app/SpentX/lib/core/utils/auth_routing_rules.dart` | 54 | bool isOfflineMode = false, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/utils/auth_routing_rules.dart` | 66 | // Local Offline Mode: data stays encrypted on phone only. | ② | no internet | low |
| `Mobile app/SpentX/lib/core/utils/auth_routing_rules.dart` | 67 | if (isOfflineMode) { | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/sync/global_merchant_rules_sync.dart` | 20 | /// (encrypted Hive) for offline detection, and swapped in live. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/global_merchant_rules_sync.dart` | 115 | /// Cached bundle (offline), or null. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/global_merchant_rules_sync.dart` | 126 | /// Cached `category_catalog` rows (offline), or null before the first | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/global_merchant_rules_sync.dart` | 142 | /// Null offline with no cache. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/global_merchant_rules_sync.dart` | 547 | /// "table:version\|..." from rules_version; null offline. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/category_catalog.dart` | 62 | /// read-only lock work offline and on a cold start. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/background_data_sync.dart` | 11 | /// 1. Push offline queue (new/edited/deleted local → server) | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/background_data_sync.dart` | 49 | // Push offline first, then pull reconcile (deletes + window prune). | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/lib/core/sync/app_settings_sync.dart` | 10 | /// Cached in Hive so the last known name shows offline and on cold start; | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/app_settings_sync.dart` | 73 | /// Downloads the row. Offline / failure keeps the cache. True = changed. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 3 | import 'package:connectivity_plus/connectivity_plus.dart'; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 10 | class ConnectivitySyncListener { | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 11 | ConnectivitySyncListener._(); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 13 | static StreamSubscription<List<ConnectivityResult>>? _sub; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 14 | static bool _wasOffline = false; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 19 | _sub = Connectivity().onConnectivityChanged.listen((results) { | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 21 | r == ConnectivityResult.mobile \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 22 | r == ConnectivityResult.wifi \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 23 | r == ConnectivityResult.ethernet \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 24 | r == ConnectivityResult.vpn); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 33 | if (_wasOffline) { | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 40 | // Still push pending even if we never saw offline in this session. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 43 | // Unmatched-SMS template requests waiting offline: retry now. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 49 | _wasOffline = false; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/sync/connectivity_sync_listener.dart` | 51 | _wasOffline = true; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/sync/missing_row_guard.dart` | 26 | /// be asked (offline, error), every local row stays. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_queue.dart` | 376 | /// Pending offline delete for this entity (by localId or remoteId in payload). | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 42 | /// • Offline writes: Hive first → [SyncQueue] → [pushPending] to Supabase. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 44 | ///   - Server deletes → remove local (unless still pending offline write) | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 286 | // Offline or server error — queue stays intact, next cycle retries. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 920 | /// After a successful upsert, store remoteId on the Hive row so offline | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 1037 | // Prefer remoteId from queue payload (set at delete time) so offline | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 1234 | // Remember remote id locally so later offline update/delete is exact. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 1866 | // enough for the write so offline plans still land on the server. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 2181 | // prevent accidental bulk deletion of children during partial/offline synchronization. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 2555 | // Server active accounts win; keep only offline-pending creates. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 2684 | /// On-demand fetch of an OLDER range. Returns rows fetched or null offline. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 2733 | ///    (web/server delete) — except offline-pending or SMS-pending verify | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 2889 | // Offline delete not yet pushed — keep it off device unless the server | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3024 | // Offline delete → must not stay on device. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3032 | // Offline add/update not pushed yet → keep. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3573 | // Server deleted / soft-deleted outing → remove local (unless offline pending). | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3611 | // Server-active friends are source of truth; keep only offline-pending | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3679 | /// (read only). Without a catalog (first launch offline) the | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 3849 | // Keep pending offline creates not yet on server. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 4039 | // If offline / app about to close, WorkManager will push when network is up. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 4086 | // Ensure remoteId is in the payload for a correct offline→server upsert. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 4103 | /// Offline or online delete — queued until server confirms. | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/core/sync/sync_service.dart` | 4912 | /// No local clock yet: a queued outbox row wins (legacy offline edits). | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/core/sync/supabase_schema_map.dart` | 606 | /// Prefer stored [remoteId] (after first sync) so offline update/delete hit | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/admin_data_sync.dart` | 18 | /// offline cache and failure backoff, so a failed check never clears data. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/admin_data_sync.dart` | 49 | : 'Cached / Offline'; | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/admin_data_sync.dart` | 57 | : 'Cached / Offline'; | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/admin_data_sync.dart` | 98 | /// versions table cannot be read (offline / SQL not run). | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/admin_data_sync.dart` | 101 | // background whether the user has a cloud account or uses local offline vault. | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sms_rules_refresh_service.dart` | 51 | /// app on its next open, without an app update. Offline or failed checks | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/sync/sms_rules_refresh_service.dart` | 52 | /// keep the cached rules (Hive), so detection works offline. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/sms_rules_refresh_service.dart` | 88 | if (remote == null \|\| remote.isEmpty) return false; // offline: keep cache | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/sms_rules_refresh_service.dart` | 137 | /// Null when offline / any read failed (the cache is then kept as is). | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/sync/sms_rules_refresh_service.dart` | 163 | /// summary, or null when offline / failed. Runs signed out too: the | ② | not uploaded yet / no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 8 | import 'package:connectivity_plus/connectivity_plus.dart'; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 19 | import '../sync/connectivity_sync_listener.dart'; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 42 | /// Offline users: retries waiting template requests when the phone is | ③ | Doc says Offline users, then describes the radio coming back (no internet). | med |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 43 | /// back online (signed-in users use [ConnectivitySyncListener]). | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 44 | static StreamSubscription<List<ConnectivityResult>>? _offlineTemplateSub; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 50 | static bool get _isOfflineUserActive { | ① | `isPhoneOnly` | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 53 | final isOffline = box.get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 57 | return isOffline && hasData; | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 70 | final isOffline = _isOfflineUserActive; | ① | `isPhoneOnly` | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 71 | if (!AuthService.isSignedIn && !isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 90 | final uid = AuthService.currentUserId ?? (isOffline ? 'offline_user' : null); | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 122 | ConnectivitySyncListener.start(); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 133 | // sign-in, requests made while offline move to the account first. | ③ | On sign-in, requests made as Phone only move to the account. Wording says while offline. | med |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 136 | await MasterDebugLog.startup('Protected services started (${AuthService.isSignedIn ? "cloud" : "offline"})'); | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 149 | await _offlineTemplateSub?.cancel(); | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 150 | _offlineTemplateSub = Connectivity().onConnectivityChanged.listen((r) { | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 152 | c == ConnectivityResult.mobile \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 153 | c == ConnectivityResult.wifi \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 154 | c == ConnectivityResult.ethernet \|\| | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 155 | c == ConnectivityResult.vpn); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 177 | ConnectivitySyncListener.stop(); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 178 | unawaited(_offlineTemplateSub?.cancel()); | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 179 | _offlineTemplateSub = null; | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 190 | final isOffline = _isOfflineUserActive; | ① | `isPhoneOnly` | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 194 | if ((AuthService.isSignedIn && !AuthService.syncHeldForAccountSwitch) \|\| isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 206 | final isOffline = _isOfflineUserActive; | ① | `isPhoneOnly` | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 207 | if (AuthService.isSignedIn \|\| isOffline) return true; | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auth_gated_services.dart` | 215 | return AuthService.isSignedIn \|\| AuthGatedServices._isOfflineUserActive; | ① | `isPhoneOnly` | high |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 359 | if (await StartupNetworkGuard.deviceOffline()) return true; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 1007 | // Offline: the local flag below still routes this device correctly, and | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 1032 | return null; // offline with no cache | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 1055 | /// connectivity-regain-triggered sync — never "whenever the token | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 1061 | /// wipe now"; a plain network failure (no connectivity at all) must NOT | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/auth_service.dart` | 1063 | /// else (timeout, DNS failure) is assumed to be connectivity, not deletion. | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 3 | import 'package:connectivity_plus/connectivity_plus.dart'; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 14 | /// Tests: forces the offline answer. | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 16 | static bool? debugOffline; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 20 | static Future<bool> deviceOffline() async { | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 21 | final forced = debugOffline; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 24 | final results = await Connectivity().checkConnectivity().timeout( | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/startup_network_guard.dart` | 28 | return results.every((r) => r == ConnectivityResult.none); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/core/services/app_reset_service.dart` | 20 | // Flush any offline-queued writes to Supabase FIRST, while the current | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/core/services/app_reset_service.dart` | 22 | // transactions/edits made offline are deleted with the local wipe below | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/app_reset_service.dart` | 23 | // and never reach the database. Best-effort: if offline, this simply | ② | no internet | low |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 208 | final isOffline = | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 209 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 212 | await prefs.setBool('is_offline_mode', isOffline); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 213 | if (isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 215 | await prefs.setString(SmsSessionUser.prefKey, 'offline_user'); | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/core/services/auto_detection_native_sync.dart` | 218 | .invokeMethod('setSessionUid', {'uid': 'offline_user'}); | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/core/widgets/app_toast.dart` | 78 | r'duplicate\|pending\|review\|offline\|warning\|please\|enter \|select \|required\|already\|not found', | ② | no internet | low |
| `Mobile app/SpentX/lib/core/router/app_router.dart` | 130 | var isOfflineMode = false; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/router/app_router.dart` | 134 | isOfflineMode = box.get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/core/router/app_router.dart` | 156 | isOfflineMode: isOfflineMode, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 124 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 125 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 188 | child: isOffline | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 189 | ? _OfflineVaultCard( | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 492 | if (isOffline) | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 539 | if (!isOffline) | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 547 | if (!isOffline) | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 944 | 'You are currently in Offline Vault mode. Your local data remains safely stored on this phone.\n\nConnecting a cloud account lets you:\n• View & track spending on spentx-web\n• Automatic encrypted cloud backup\n• Sync... | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 955 | 'Stay Offline', | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 987 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 988 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1002 | isOffline ? 'Switch Mode / Sign In?' : 'Sign out?', | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1009 | isOffline | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1026 | if (isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1028 | await Hive.box('settings').delete('is_offline_mode'); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1043 | isOffline ? 'Switch' : 'Sign Out', | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1841 | class _OfflineVaultCard extends StatelessWidget { | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1842 | const _OfflineVaultCard({ | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1855 | final displayName = name.trim().isEmpty ? 'Offline Vault' : name.trim(); | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1953 | 'Offline Vault', | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/settings/presentation/screens/vault_diagnostics_screen.dart` | 296 | final offline = settings?.get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/settings/presentation/screens/vault_diagnostics_screen.dart` | 298 | final canSync = !offline && AuthService.isSignedIn && !_syncing && d != null; | ② | no internet | low |
| `Mobile app/SpentX/lib/features/settings/presentation/screens/vault_diagnostics_screen.dart` | 323 | offline ? 'On this phone' : _when(SyncService.lastSyncAt), | ② | no internet | low |
| `Mobile app/SpentX/lib/features/settings/presentation/screens/notification_preferences_screen.dart` | 339 | // Template requests: ON by default (works offline too). | ③ | Template requests work for Phone only and with no internet. | low |
| `Mobile app/SpentX/lib/features/wealth/data/snapshot_outbox.dart` | 10 | /// Offline outbox for Daily Snapshot rows (net_worth_history + | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/features/wealth/data/daily_snapshot_provider.dart` | 21 | /// Hive for instant, offline display. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/wealth/data/daily_snapshot_provider.dart` | 272 | // useful when the user is offline, before auth has finished restoring, or | ② | no internet | low |
| `Mobile app/SpentX/lib/features/wealth/data/daily_snapshot_provider.dart` | 459 | // Keep whatever was already loaded from cache — offline is fine. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/features/wealth/data/daily_snapshot_provider.dart` | 467 | /// offline: the delete is queued and retried until the server accepts it. | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/features/wealth/data/wealth_provider.dart` | 88 | /// Atomic deposit via the add_goal_contribution RPC (queued offline). | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/lib/features/calendar/presentation/calendar_screen.dart` | 90 | // null = offline / not signed in / failed: retry on the next visit. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/background/background_sms_scheduler.dart` | 7 | /// 2) push local offline data (transactions, etc.) to Supabase when online | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/background/background_sms_scheduler.dart` | 45 | // Offline → server push even when the app UI is closed. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/background/background_sms_scheduler.dart` | 87 | // Also try data push once connectivity is available. | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/features/sms/background/background_sms_scheduler.dart` | 96 | /// Schedule a one-shot online push (after offline add / app pause). | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/background/workmanager_entrypoint.dart` | 21 | // Push offline changes, then pull: server deletes clear local, | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` | 105 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` | 106 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true && | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` | 110 | return AuthService.isSignedIn \|\| backgroundSessionVerified \|\| isOffline; | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 30 | /// * Oct-30: ON by default for everyone (signed in and offline). A user who | ① | On for signed-in and Phone only users. | med |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 32 | /// * Limits: offline [offlineDailyLimit] / signed in [signedInDailyLimit] | ① | `phoneOnlyDailyLimit` (no account), not the internet. | med |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 35 | /// * Offline users send without an account (anon RPC with a random device | ① | Phone only users send with no account (anon RPC). | med |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 54 | static const offlineDailyLimit = 5; | ① | `phoneOnlyDailyLimit` | med |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 217 | /// Sign-in: waiting requests made while offline move to the account [uid]. | ③ | Requests saved under Phone only (`offline_user`) move to the account. The words say while offline. | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 221 | if (uid.isEmpty \|\| uid == 'offline_user') return 0; | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 227 | if (o.isEmpty \|\| o == 'offline_user') { | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 245 | /// Sends waiting requests: the signed-in user's, or (offline) this | ① | Phone only: this device's waiting requests. | med |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 252 | final offline = uid == 'offline_user'; | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 253 | if (!offline && debugSender == null && !_hasSession()) return 0; | ① | `isPhoneOnly` (this `offline` is `uid == offline_user`) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 254 | final limit = offline ? offlineDailyLimit : signedInDailyLimit; | ① | `phoneOnlyDailyLimit` when the uid is the Phone only sentinel | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 260 | final mine = offline ? (o.isEmpty \|\| o == 'offline_user') : o == uid; | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` | 287 | if (!ok) break; // Offline, RPC missing or limit: retry later. | ③ | Send failed: no internet, RPC missing, or daily limit. Retry later. | med |
| `Mobile app/SpentX/lib/features/sms/core/support_sms_service.dart` | 13 | /// server). Same per-device daily limits as template requests (offline 5, | ① | Phone only daily cap is 5. | med |
| `Mobile app/SpentX/lib/features/sms/core/support_sms_service.dart` | 46 | static int get dailyLimit => SmsSessionUser.currentUid == 'offline_user' | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/core/support_sms_service.dart` | 47 | ? TemplateRequestService.offlineDailyLimit | ① | `phoneOnlyDailyLimit` | med |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 93 | /// no longer exists (lost by the old offline sync bug), and runs them again | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 102 | /// server reachable; Local Only runs offline. ₹0 amounts are never re-added. | ③ | Phone only does not ask the server. A Cloud user with no internet tries again next open. | med |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 118 | static bool get _localOnly => | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 120 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 123 | if (!_localOnly && | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 155 | /// signed out / offline, or a prompt that got no answer, tries again on | ③ | Cloud user signed out, or no internet: try again next open. Not the Phone only flag. | med |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 273 | final localOnly = _localOnly; | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 336 | if (!localOnly && lost.isNotEmpty) { | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/sms/recovery/lost_sms_recovery.dart` | 342 | if (check == null) return result; // offline: try again next open | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/parser/sms_non_transaction_rules.dart` | 16 | ///   2. `assets/sms/sms_block_rules_seed.json`, bundled, as the offline | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/features/sms/autosave/sms_session_user.dart` | 39 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/sms/autosave/sms_session_user.dart` | 41 | return 'offline_user'; | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/lib/features/sms/autosave/merchant_category_engine.dart` | 100 | /// Phase 3: the synced Admin Panel rules (offline cache) first, then the | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/features/sms/self_upi/self_upi_service.dart` | 12 | /// Stored per user in encrypted Hive (works offline and in the background | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/self_upi/self_upi_service.dart` | 104 | // IDs saved while the table did not exist yet (or offline) go up now. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/self_upi/self_upi_service.dart` | 163 | // Table not created yet / offline: the device copy is kept. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/sms/rules/engine/admin_block_rules_matcher.dart` | 13 | /// [SmsRuleEngine.isBlocked]. An empty cache (fresh install, offline) | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/lib/features/security/presentation/security_center_screen.dart` | 723 | subtitle: 'Export AES-256 password-protected backup for offline safety', | ② | no internet | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 26 | storageMode, // Screen 1: Choose Storage Mode | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 48 | OnboardingStorageMode _storageMode = OnboardingStorageMode.offlineOnly; | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 62 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 63 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 64 | _storageMode = isOffline | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 65 | ? OnboardingStorageMode.offlineOnly | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 66 | : OnboardingStorageMode.cloudSync; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 105 | void _handleStorageModeContinue(OnboardingStorageMode mode) async { | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 106 | setState(() => _storageMode = mode); | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 108 | if (mode == OnboardingStorageMode.offlineOnly) { | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 110 | await Hive.box('settings').put('is_offline_mode', true); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 124 | await Hive.box('settings').put('is_offline_mode', false); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 206 | _step = _Step.storageMode; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 248 | final isOffline = _storageMode == OnboardingStorageMode.offlineOnly; | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 249 | settings.put('is_offline_mode', isOffline); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 292 | case _Step.storageMode: | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 296 | setState(() => _step = _Step.storageMode); | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 319 | onGetStarted: () => setState(() => _step = _Step.storageMode), | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 320 | onSkip: () => setState(() => _step = _Step.storageMode), | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 324 | case _Step.storageMode: | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 325 | child = StorageModeStep( | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 327 | initialMode: _storageMode, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 328 | onContinue: _handleStorageModeContinue, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/onboarding_screen.dart` | 369 | storageMode: _storageMode, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 17 | Future<void> _continueOffline(BuildContext context) async { | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 19 | await Hive.box('settings').put('is_offline_mode', true); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 176 | _OfflineLandingCta( | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 177 | onPressed: () => _continueOffline(context), | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 299 | class _OfflineLandingCta extends StatelessWidget { | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 300 | const _OfflineLandingCta({required this.onPressed}); | ① | `isPhoneOnly` | med |
| `Mobile app/SpentX/lib/features/auth/presentation/auth_landing_screen.dart` | 346 | 'Continue Offline', | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 7 | enum OnboardingStorageMode { | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 9 | offlineOnly, | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 12 | /// Screen 1: Choose Storage Mode | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 15 | /// Option B: Use Offline (private local vault, no account) | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 16 | class StorageModeStep extends StatefulWidget { | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 17 | final OnboardingStorageMode? initialMode; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 18 | final ValueChanged<OnboardingStorageMode> onContinue; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 21 | const StorageModeStep({ | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 29 | State<StorageModeStep> createState() => _StorageModeStepState(); | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 32 | class _StorageModeStepState extends State<StorageModeStep> { | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 33 | OnboardingStorageMode? _selected; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 68 | mode: OnboardingStorageMode.cloudSync, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 78 | 'Works offline with automatic sync later', | ② | Works with no internet. Syncs when the connection is back. | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 84 | // Option B: Use Offline | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 87 | mode: OnboardingStorageMode.offlineOnly, | ① | `StorageMode.phoneOnly` | high |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 90 | title: 'Use Offline', | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/storage_mode_step.dart` | 123 | required OnboardingStorageMode mode, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 17 | /// - Storage Mode (with Edit) | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 23 | final OnboardingStorageMode storageMode; | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 39 | required this.storageMode, | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 248 | // SECTION E: STORAGE MODE | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 260 | storageMode == OnboardingStorageMode.cloudSync | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 275 | storageMode == OnboardingStorageMode.cloudSync | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/review_setup_step.dart` | 277 | : 'Offline', | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/welcome_carousel_step.dart` | 260 | 'Your financial information is protected with on-device encryption. You decide whether to sync with cloud or stay offline. Your money data stays on this phone; only hidden SMS formats are shared to improve detection (... | ① | Phone only | med |
| `Mobile app/SpentX/lib/features/auth/presentation/widgets/onboarding/welcome_carousel_step.dart` | 282 | title: 'User-controlled storage mode', | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/lib/features/auth/presentation/splash_screen.dart` | 119 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/splash_screen.dart` | 120 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true; | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/splash_screen.dart` | 121 | if (isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/features/auth/presentation/splash_screen.dart` | 203 | // Fix 6: at most 3 s; offline start must not hang here. | ② | No internet: do not block startup on the network. | med |
| `Mobile app/SpentX/lib/features/transactions/data/transaction_provider.dart` | 405 | // Offline delete: Hive cleared now; server delete when online (same as add/update). | ② | no internet | low |
| `Mobile app/SpentX/lib/features/transactions/data/transaction_provider.dart` | 440 | // Preserve remoteId if edit sheet dropped it — critical for offline→server update. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/transactions/data/transaction_provider.dart` | 465 | // Offline update: Hive now; server upsert when online. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/transactions/presentation/transactions_screen.dart` | 722 | _snack('Offline — only locally cached history is available.'); | ③ | No internet, so only data already on this phone can be shown. (Do not use this sentence for Phone only.) | med |
| `Mobile app/SpentX/lib/features/transactions/presentation/transactions_screen.dart` | 3121 | 'Offline — only the locally cached history is available. Connect to load older transactions.', | ③ | No internet, so only data already on this phone can be shown. (Do not use this sentence for Phone only.) | med |
| `Mobile app/SpentX/lib/features/export/data/encrypted_backup_service.dart` | 579 | // refuses (signed out, offline) keeps its legacy copy above. | ② | no internet | low |
| `Mobile app/SpentX/lib/features/analytics/presentation/analytics_screen.dart` | 308 | 'Offline — this chart only covers transactions cached on this device.', | ③ | No internet, so only data already on this phone can be shown. (Do not use this sentence for Phone only.) | med |
| `Mobile app/SpentX/lib/main.dart` | 65 | import 'core/sync/connectivity_sync_listener.dart'; | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/main.dart` | 434 | ConnectivitySyncListener.stop(); | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/lib/main.dart` | 449 | // SMS drain + offline data push (WorkManager, works with app closed). | ③ | Comment mixes a Phone-only branch with a cloud upload. Phone only must not push money. | med |
| `Mobile app/SpentX/lib/main.dart` | 450 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/main.dart` | 451 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true && | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/main.dart` | 455 | if (AuthService.isSignedIn \|\| isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/main.dart` | 468 | final isOffline = Hive.isBoxOpen('settings') && | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/lib/main.dart` | 469 | Hive.box('settings').get('is_offline_mode', defaultValue: false) == true && | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/lib/main.dart` | 473 | if (!isOffline) { | ① | local `isPhoneOnly` (this variable reads the storage flag nearby) | high |
| `Mobile app/SpentX/test/sms_rules_refresh_merge_test.dart` | 169 | _sync(() async => throw const SocketException('offline')), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 2 | // OFF switch, offline sending and moving requests on sign-in. | ③ | Phone only sending, and moving those requests on sign-in. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 37 | SmsSessionUser.debugUid = 'offline_user'; | ① | sentinel id `phone_only_user` (not a network state) | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 62 | test('offline: ON by default and sends without an account', () async { | ① | Phone only: on by default, sends with no account. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 72 | test('offline: the 6th request waits for the next day', () async { | ① | Phone only daily cap. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 106 | test('a failed send (offline / no RPC) keeps the request', () async { | ③ | Failed send (no internet or no RPC) keeps the request. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 109 | (_) async => throw Exception('offline'); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/detection_v2/template_request_limits_test.dart` | 163 | test('sign-in moves offline requests to the account', () async { | ① | Sign-in moves Phone only requests to the account. | low |
| `Mobile app/SpentX/test/onboarding_redesign_flow_test.dart` | 8 | test('StorageMode enum has cloudSync and offlineOnly options', () { | ① | `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/onboarding_redesign_flow_test.dart` | 9 | expect(OnboardingStorageMode.values.length, 2); | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/test/onboarding_redesign_flow_test.dart` | 10 | expect(OnboardingStorageMode.values, contains(OnboardingStorageMode.cloudSync)); | ① | keep as the storage step; option label becomes Phone only | low |
| `Mobile app/SpentX/test/onboarding_redesign_flow_test.dart` | 11 | expect(OnboardingStorageMode.values, contains(OnboardingStorageMode.offlineOnly)); | ① | `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/support_sms_test.dart` | 34 | SmsSessionUser.debugUid = 'offline_user'; | ① | sentinel id `phone_only_user` (not a network state) | low |
| `Mobile app/SpentX/test/support_sms_test.dart` | 53 | test('offline: the 6th send hits the limit, next day works', () async { | ① | Phone only daily cap. | low |
| `Mobile app/SpentX/test/phase2_admin_rules_dedupe_test.dart` | 101 | test('cached rules keep working offline (no network in tests)', () { | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/sync_retention_test.dart` | 42 | '{"message":"offline fixture","code":"400"}', | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/catalog_refresh_backoff_test.dart` | 131 | test('offline version check stays in backoff', () { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/high_severity_sync_test.dart` | 22 | 'offline goal edits survive restart and block destructive logout', | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/high_severity_sync_test.dart` | 29 | flush: () async => throw StateError('offline'), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/high_severity_sync_test.dart` | 50 | test('offline delete retries before pull and never resurrects', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/high_severity_sync_test.dart` | 58 | write: (_, __) async => throw StateError('offline'), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 194 | Future<void> signIn(String? uid, {bool offline = false}) async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 197 | await Hive.box('settings').put('is_offline_mode', offline); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 198 | if (offline) await Hive.box('settings').put('setup_completed', true); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 325 | await signIn(null, offline: true); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 326 | expect(SmsSessionUser.currentUid, 'offline_user'); | ① | sentinel id `phone_only_user` (not a network state) | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 444 | group('fix 8: offline and cloud users', () { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/outing_flow_fixes_test.dart` | 454 | await signIn(null, offline: true); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/phase3_merchant_rules_test.dart` | 474 | // Offline restart: the cache alone rebuilds the engine. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/phase2_rule_sync_test.dart` | 5 | // rules_version SQL. A failed or empty read never wipes the offline cache. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/phase2_rule_sync_test.dart` | 150 | test('a failed sync keeps the old cache; offline still detects', () async { | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/phase2_rule_sync_test.dart` | 155 | fetch: () async => throw const SocketException('offline'), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/phase2_rule_sync_test.dart` | 163 | fetch: () async => throw const SocketException('offline'), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/phase2_rule_sync_test.dart` | 206 | // A changed fingerprint means a refresh; offline (null) keeps the cache. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/audit_fixes_test.dart` | 39 | expect(SyncErrors.classify(StateError('offline')), SyncErrorKind.transient); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/priority_fixes_test.dart` | 172 | test('offline projector patch survives box reopen and upload on retry', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/priority_fixes_test.dart` | 180 | write: (_) async => throw StateError('offline'), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 1 | // Fix 6: offline start does not wait on the network. The PIN-reset check is | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 17 | tearDown(() => StartupNetworkGuard.debugOffline = null); | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 38 | test('unknown connectivity (no plugin) reads as online', () async { | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 39 | expect(await StartupNetworkGuard.deviceOffline(), false); | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 42 | test('expired session offline: kept, no refresh request', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 81 | StartupNetworkGuard.debugOffline = true; | ② | `noInternet` / `wasNoInternet` | med |
| `Mobile app/SpentX/test/offline_autoadd/fix6_splash_offline_test.dart` | 85 | expect(requests, 0, reason: 'no refresh attempted offline'); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/fake_rest.dart` | 16 | return http.Response('{"message":"offline"}', 503, request: request); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/bg_harness.dart` | 1 | // Shared setup for the offline auto-add tests: encrypted Hive in a temp | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/bg_harness.dart` | 20 | const harnessUid = 'user-offline-0001'; | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/bg_harness.dart` | 58 | harnessDir = await Directory.systemTemp.createTemp('sx_offline_'); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_c_lost_sms_recovery_test.dart` | 128 | test('Local Only user recovers offline, without asking a server', () async { | ③ | Phone only user, and no server call (no internet not required). | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_c_lost_sms_recovery_test.dart` | 130 | await s.put('is_offline_mode', true); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 38 | Future<void> localOnly() async { | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 39 | await Hive.box('settings').put('is_offline_mode', true); | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 52 | await localOnly(); | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 61 | await localOnly(); | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 89 | await localOnly(); | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/offline_autoadd/fix_d_recovery_runs_once_test.dart` | 105 | await localOnly(); | ① | `isPhoneOnly` / `StorageMode.phoneOnly` | low |
| `Mobile app/SpentX/test/offline_autoadd/fix3_reconcile_keeps_unsynced_test.dart` | 75 | test('server cannot be asked (offline): nothing is removed', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/e2e_offline_salary_repro_test.dart` | 18 | test('offline salary survives app open + reconnect sync', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_autoadd/e2e_offline_salary_repro_test.dart` | 19 | // 1. Offline, app closed: the bank SMS is saved in the background. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/hive_key_manager_test.dart` | 525 | test('offline: key check and recovery never touch the network', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/hive_key_manager_test.dart` | 532 | }, createHttpClient: (_) => throw StateError('network used offline')); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/phase2_parsing_test.dart` | 652 | // Offline: keep the cached rules. | ② | saved copy used when there is no internet | low |
| `Mobile app/SpentX/test/safe_box_migration_test.dart` | 390 | 'offline + pending outbox: no network needed, outbox intact', | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/safe_box_migration_test.dart` | 392 | // No Supabase client is initialised in this test (offline). | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 56 | enum RefreshMode { ok, rejected, offline } | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 69 | case RefreshMode.offline: | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 224 | test('expired session while offline: stays signed in, token kept', () async { | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 227 | sessionKey: jsonEncode(session('offline-refresh', ttl: -60)), | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 229 | final server = Server()..refresh = RefreshMode.offline; | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 233 | expect(refreshIn(await secure.read(key: sessionKey)), 'offline-refresh'); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 234 | expect(await plainDump(), isNot(contains('offline-refresh'))); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 238 | server.nextRefresh = 'after-offline'; | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 242 | refreshIn(await secure.read(key: sessionKey)) == 'after-offline', | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 244 | expect(await plainDump(), isNot(contains('after-offline'))); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/secure_session_auth_test.dart` | 245 | expectNoTokenLeak(['offline-refresh', 'after-offline']); | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 9 | group('Offline Mode Auth Routing', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 10 | test('Offline mode user with setup incomplete routes to /onboarding', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 17 | isOfflineMode: true, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 22 | test('Offline mode user on /onboarding with setup incomplete stays on /onboarding', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 29 | isOfflineMode: true, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 34 | test('Offline mode user with setup complete routes to /home', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 41 | isOfflineMode: true, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 46 | test('Offline mode user with pin lock enabled routes to /lock', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 54 | isOfflineMode: true, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 59 | test('Offline mode user navigating to /auth is redirected to /home when setup is done', () { | ① | Phone only | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 66 | isOfflineMode: true, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 71 | test('Non-offline signed-out user is still redirected to /auth', () { | ① | Not Phone only. A signed-out Cloud user still goes to /auth. | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 78 | isOfflineMode: false, | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | low |
| `Mobile app/SpentX/test/offline_mode_and_admin_sync_test.dart` | 84 | group('Admin Sync & AppSettings Sync for Offline Vault', () { | ① | Phone only | med |
| `Mobile app/SpentX/docs/08_SMART_SYNC_AND_OFFLINE.md` | 1 | # Smart Sync Engine & Offline-First Persistence | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/docs/08_SMART_SYNC_AND_OFFLINE.md` | 3 | SpentX uses a **Local-First, Offline-First** synchronization engine designed to guarantee that the app is 100% functional without an internet connection, while maintaining instantaneous real-time sync with Supabase wh... | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/docs/08_SMART_SYNC_AND_OFFLINE.md` | 29 | else Offline / Network 503 | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/docs/01_ARCHITECTURE.md` | 5 | SpentX Mobile is built using **Clean Architecture** tailored for Flutter, prioritizing **Local-First, Zero-Latency, and Offline-First** responsiveness. | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/docs/01_ARCHITECTURE.md` | 75 | * `sync_queue.dart`: Durable Hive outbox queue for offline mutations. | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/docs/10_SECURITY_AND_BACKUP.md` | 42 | * Backups can be exported locally or restored on another device completely offline. | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/docs/README.md` | 18 | \| **[08. Smart Sync & Offline Engine](./08_SMART_SYNC_AND_OFFLINE.md)** \| Local-first encrypted Hive storage, durable outbox queue, WebSocket realtime sync, and 2–4s fast-path restore. \| | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 22 | private const val KEY_OFFLINE_MODE = "flutter.is_offline_mode" | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 31 | fun isOfflineMode(context: Context): Boolean { | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 34 | .getBoolean(KEY_OFFLINE_MODE, false) | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 38 | return isUserAuthenticated(context) \|\| isOfflineMode(context) | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 66 | if (isOfflineMode(context)) { | ① | Hive/native flag `storage_mode = phoneOnly` (stop calling it offline) | high |
| `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SpentXDetectionPrefs.kt` | 67 | return@synchronized "offline_user" | ① | sentinel id `phone_only_user` (not a network state) | high |
| `Mobile app/SpentX/README.md` | 3 | > **SpentX** is an offline-first, privacy-focused personal finance, wealth tracking, and automated spend-detection mobile application built with **Flutter**, **Riverpod**, **Hive (AES-encrypted)**, and **Supabase**. I... | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/README.md` | 16 | * **[08. Smart Sync & Offline Engine](./docs/08_SMART_SYNC_AND_OFFLINE.md)** | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/README.md` | 39 | 6. [Offline-First Sync Engine & Cloud Architecture](#-offline-first-sync-engine--cloud-architecture) | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/README.md` | 49 | * **Offline-First Resilience**: All reads and writes hit local Hive storage first with **0ms perceived latency**. You can add transactions, manage trips, and review budgets anywhere—even with zero connectivity or in a... | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `Mobile app/SpentX/README.md` | 75 | │      LOCAL STORAGE (OFFLINE)     │ │        CLOUD SYNC (SUPABASE)     │ | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/README.md` | 375 | ## 🔄 Offline-First Sync Engine & Cloud Architecture | ② | local-first; works with no internet | low |
| `Mobile app/SpentX/README.md` | 378 | * **Deterministic Unique IDs (`SyncIds`)**: Uses UUIDv5 derived from user ID, account names, and timestamps to guarantee that records generated offline produce identical IDs across devices, preventing duplication. | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/README.md` | 379 | * **SyncQueue**: Any offline mutation (Insert, Update, Delete) is appended to the local `sync_queue` Hive box. | ② | waiting upload until the internet is back | low |
| `Mobile app/SpentX/README.md` | 419 | \| `transactions` \| Complete offline ledger entries (Income, Expense, Transfer). \| | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/README.md` | 500 | *Maintained with ❤️ by the SpentX Team. Secure, Private, and Offline-First Financial Intelligence.* | ② | local-first; works with no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_HANDOFF.md` | 52 | **Tests:** `test/safe_box_migration_test.dart` (14 test declarations): a crash at every step, verify failure, background isolate, wrong key, offline + pending outbox, concurrency, snapshot rollback. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_HANDOFF.md` | 112 | - Restore runs only when the account server answers; nothing changes while offline. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_HANDOFF.md` | 215 | - The admin SMS rules (`sms_template_rules` / `sms_detection_rules` / `sms_block_rules`) sync into an offline cache through `sms_rules_refresh_service.dart`. | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_HANDOFF.md` | 235 | - Admin global rules (`merchant_brands`, `merchant_brand_keys`, `merchant_keyword_rules`, `category_catalog`) sync to an encrypted offline cache through `global_merchant_rules_sync.dart`. A failed or empty download ke... | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 45 | - Cache active rules locally for offline detection. | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 122 | ### Safety 5 – Offline and sync | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 123 | - All add/edit/delete/link work offline in Hive; outbox syncs when internet returns. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 135 | - Permission granted → revoked → granted again; offline add then sync; two devices same account. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 232 | - Offline upgrade works; recovery waits for internet. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 292 | - Release-build tests (not debug): security, migration, offline recovery, multi-device, Android 16 and 17 permission flows. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 319 | - Tests: forced failure mid-migration (crash/kill), rollback, recovery on next launch, migration while offline, migration with pending outbox items. Transactions, accounts, balances, user rules identical before/after. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` | 341 | - Offline add/edit → sync; two devices same account; background SMS with app closed; crash mid-save; reboot; app upgrade from current installed version with real data. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_CHATGPT_CODEX_HANDOFF.md` | 140 | - **Mobile:** Flutter 3.41.7 / Dart, Riverpod (2.6.1) state, Hive local DB encrypted with AES-256 (key in Android Keystore via flutter_secure_storage), offline-first outbox synced to Supabase. | ② | local-first; works with no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_CHATGPT_CODEX_HANDOFF.md` | 189 | - **SMS rules:** `sms_template_rules` / `sms_block_rules` / `sms_detection_rules` → `APP/lib/core/sync/sms_rules_refresh_service.dart`. Uses a row fingerprint, reconciles the offline cache in place, and never wipes it... | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_CHATGPT_CODEX_HANDOFF.md` | 410 | - **Wider:** a second device brand, Android 17 (an emulator is OK if labelled), two devices on one account, offline → sync, upgrade from the installed version with real data. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md` | 37 | - **Mobile:** Flutter 3.41.7 / Dart, Riverpod state, encrypted Hive local database (AES-256, key in Android Keystore through flutter_secure_storage), with an offline-first outbox that syncs to Supabase. | ② | local-first; works with no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md` | 89 | - SMS rules: `APP/lib/core/sync/sms_rules_refresh_service.dart`. It uses a row fingerprint, reconciles the offline cache in place, and never wipes it on a failed or empty read. | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md` | 90 | - Global merchant rules: `APP/lib/core/sync/global_merchant_rules_sync.dart`, an encrypted offline cache. `APP/assets/rules/merchant_rules.json` is only the first-run fallback. | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md` | 282 | \| 6 \| `ROOT/supabase/migrations/20261022130200_p3_global_rules_additions.sql` \| Before release (the bundled JSON covers offline) \| – \| | ② | saved copy used when there is no internet | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md` | 369 | - **Wider coverage:** a second device brand, Android 17, two devices on the same account, offline → sync, upgrade from the installed version with real data. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_REMAINING_WORK.md` | 107 | - Offline add/edit → sync; two devices on the same account; background SMS with the app closed; crash mid-save; reboot; upgrade from the installed version with real data. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_HANDOFF_2026-10-22/SPENTX_TEST_STATUS.md` | 30 | - Any release-build test, second device brand, Android 17, multi-device, offline → sync. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 39 | - 4.5 [Offline-First Sync Engine (SyncService & SyncQueue)](#45-offline-first-sync-engine-syncservice--syncqueue) | ② | local-first; works with no internet | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 75 | - **Offline-First Native Android App (Flutter)**: Runs locally on the user's mobile device. It monitors incoming bank SMS alerts via a native Android `BroadcastReceiver`, parses complex Indian financial semantics (UPI... | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 143 | \| **Network Resilience** \| Browser Offline Detection + Reconnect Refetch\| Full Offline Read/Write Queue (`SyncQueue`)\| High-Availability Postgres Cluster\| | ② | no internet, or local-first. Leave Phone only language out. | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 188 | Note over Mob,Q: User adds expense offline on Mobile | ② | no internet, or local-first. Leave Phone only language out. | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 1703 | \| `sync_queue` \| Plaintext \| Offline mutation operations queue \| Cleared upon successful push \| | ② | waiting upload until the internet is back | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 1721 | ## 4.5 Offline-First Sync Engine (`SyncService` & `SyncQueue`) | ② | local-first; works with no internet | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 1764 | When an operation fails due to network loss, it remains in the `sync_queue` box and is retried on the next connectivity broadcast or app resume. | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 3067 | - **Impact:** When two members of a group trip add expenses offline, the first device that reconnects wipes out all expenses added by the other device. | ② | no internet, or local-first. Leave Phone only language out. | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 3097 | 1. Device A and Device B are on a trip. While offline, Device A logs a ₹2,500 Dinner expense and Device B logs a ₹1,200 Fuel expense. | ② | no internet, or local-first. Leave Phone only language out. | low |
| `SPENTX_FULL_SYSTEM_SPEC_AND_AUDIT.md` | 3798 | - **Impact:** The cached `total_spent` column on `outings` desynchronizes from the actual sum of child expenses when expenses are inserted directly or modified offline. | ② | saved copy used when there is no internet | low |
| `SpentX_Audit_Report.md` | 37 | **Fix:** Rewrite the claim to reflect that Supabase sync is required and Hive is a local cache/offline layer, not the sole store. Audit other privacy copy (About screen, store listing, Play Data Safety form) for the s... | ② | saved copy used when there is no internet | low |
| `SpentX_Audit_Report.md` | 68 | **Repro (two-device conflict):** Device A (offline) adds expense X. Device B, unaware of X, edits only the outing title and pushes first — if X already exists server-side, B's prune step deletes X. If A pushes after B... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SpentX_Audit_Report.md` | 146 | **Evidence:** `net_worth_history`/`account_balance_history` tables exist but are only ever written once, at signup, with all-zero values (`user-bootstrap.ts:452-511`) — no recurring job updates them, and no chart read... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `SpentX_Audit_Report.md` | 147 | **Fix:** Either implement a real recurring snapshot writer (scheduled function recomputing `net_worth_history` daily) and have the chart read from it, or drop the vestigial tables. Regardless, surface a "may be stale ... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 3 | Scope: does a delete or change on one platform correctly converge on the other after offline→online sync, for every entity mobile syncs. All findings are from full-file source tracing on both codebases (Flutter mobile... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 25 | 2. Mobile goes offline. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 27 | 4. While still offline, mobile edits anything about that outing locally — adds an expense, edits the title, or even just has a stale queued upsert from before — anything that triggers `_pushOutingDocument`. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 78 | Web-deletes-one-expense direction is correct in the simple case: mobile's `_pullOutings` rebuilds each outing's expense/settlement lists entirely from the server's current rows every pull, so a deleted expense is simp... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 86 | ## Offline-to-online sync mechanics | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 88 | **7. Push/pull ordering on reconnect — CONFIRMED.** `fullSync()` runs reference-data pull (accounts/purposes) → `pushPending()` → full `pullAll()`, consistently, everywhere (`sync_service.dart:90-110`, `connectivity_s... | ② | keep connectivity APIs; comments say no internet, not Phone only | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 121 | \| Entity \| Delete propagates web → mobile \| Delete propagates mobile → web \| Safe to use offline right now \| | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 128 | \| **outings** \| **No — resurrected by mobile's next push** \| Yes \| **No — do not delete a trip on web while a mobile device has it and might push offline edits** \| | ② | no internet (test or note). Do not rename to Phone only. | low |
| `CrossPlatform_Delete_Sync_Audit.md` | 135 | The outings bug is the one item on this list that needs to be fixed before the app can be trusted for offline outing deletion — everything else is either fully correct or has only a minor, non-permanent timing caveat. | ② | no internet (test or note). Do not rename to Phone only. | low |
| `Admin_Delete_User_Session_Audit.md` | 173 | But if that user already has the web app open in a browser tab at the moment you delete them, they keep a fully working, interactive session for as long as their login token stays valid — nothing in the app currently ... | ② | no internet (test or note). Do not rename to Phone only. | low |
| `.claude/skills/spentx-mobile/SKILL.md` | 13 | - `domain/` — data model classes (plain Dart, or `HiveObject` + `@HiveType`/`@HiveField` only for the two entities that need on-device offline storage today: accounts and transactions — most features don't need Hive, ... | ② | no internet, or local-first. Leave Phone only language out. | low |
| `Mobile app/SpentX/lib/features/settings/presentation/settings_screen.dart` | 1965 | Local device storage • Zero cloud sync   [adjacent copy, not a search hit] | ① | On this phone only. Nothing is synced. | med |

Row count: 480.

