# SpentX Sync Audit (read-only)

Date: 31 Oct 2026 · App branch `onboarding-flow` @ `5b28cd5` · DB `vdhayvlweuglpvzweunq` (SELECT only).
No code changed. App paths are under `Mobile app/SpentX/lib/`. Legend: ✅ works · ❌ bug · ⚠️ gap / risk / verify.

---

## PART 1 — Admin data → phones

| Admin data | Reaches phone? | Delete / disable honored? | Signed-out & Phone only? | Notes |
|---|---|---|---|---|
| SMS template rules | ✅ | ✅ | ✅ (anon SELECT) | `core/sync/sms_rules_refresh_service.dart:54-81` version check ≤10 min + daily full; `reconcileRules` 374-443 writes first, deletes last, no clear(); empty answer refused (`allowEmpty:!isTemplates` :264) |
| SMS detection rules | ✅ | ⚠️ | ✅ | Admin-disabled IDs tracked only for templates (`trackAdminDisabled:isTemplates`) → a disabled **built-in** detection rule can be re-seeded after an app update |
| SMS block rules | ✅ | ⚠️ | ✅ | Same as above for built-in block rules |
| User (manual) SMS rules | ✅ kept | n/a | ✅ | `isManual` rows never removed by reconcile |
| Merchant brands + brand keys | ✅ | ✅ | ✅ | `core/sync/global_merchant_rules_sync.dart`; keys have no rv trigger but are covered by brands trigger; empty bundle rejected :464 |
| Merchant keyword rules | ✅ | ✅ | ✅ | Same service; backoff 30 min→24 h on failure :46-49; daily full :189 |
| Category catalog | ✅ | ✅ | ✅ | Sig needs all 3 versions (:557); inactive default keys dropped (`category_catalog.dart`, `dropped_defaults`) |
| Global settings (`id='app'`) | ✅ | n/a | ✅ | `core/sync/app_settings_sync.dart`: app_name, maintenance_mode, max limits, default_categories; Hive cache; keeps cache on failure |
| `mcc_category_map` | ❌ | ❌ | ❌ | Has rv trigger, authenticated-only SELECT, but **not** in AdminAreaMap (`core/sync/sync_efficiency.dart:62-70`) → never reaches phones |
| `mail_templates`, sms_template_requests (admin side) | ⚠️ | n/a | n/a | Admin/web-only by design; no phone sync |
| Version-check engine | ✅ | — | ✅ | `core/sync/admin_data_sync.dart` `checkVersions()` runs without sign-in (needs only `isConfigured`); falls back to `refreshIfStale` per area if versions read fails |
| Version stored after failed refresh | ⚠️ | — | — | `_refreshAreas` swallows errors (~175-190) but `_store` still saves remote versions; self-heals via per-area sig / 10-min SMS throttle / daily full |
| Realtime admin push | ✅ signed in · ⚠️ others | — | ⚠️ | `rules_version` channel (`realtime_foreground_sync.dart:252-266`), 400 ms coalesce; realtime starts only when signed in (:56-58) → Phone only / signed-out get updates on app open/resume only |
| Engines reload without restart | ✅ | — | ✅ | `sms_rules_refresh_service.dart:194` |

**Worst-case admin delay:** seconds (open + signed in) · next open/resume (others, SMS ≤10 min throttle) · up to 24 h on repeated failure (backoff / daily full).

---

## PART 2 — Cloud user data, phone ↔ web

| Data | Phone → Web | Web → Phone | Web delete reaches phone? | Notes |
|---|---|---|---|---|
| Transactions (normal edits) | ✅ | ✅ | ✅ | Outbox push; realtime tx channel applies row deletes (`realtime_foreground_sync.dart:175-212`); `_mergeTransactionRows` `sync_service.dart:2755`, delete honor ~2883 |
| Transactions — >500 changed since cursor | ✅ | ❌ | ❌ | `smart_sync_pull` caps tx at `p_tx_limit` 500 (order updated_at desc) but app moves cursor to `server_time` (`sync_service.dart` ~5078) → extra rows skipped forever (web bulk import/edit) |
| Transactions — fresh install / full pull | — | ❌ | — | Smart path returns early (`sync_service.dart:2252-2273`), never calls `_pullTransactionsWindow` → only newest 500 tx download; RPC "90 days" cutoff not applied when `p_since` null |
| Transaction splits / items | ✅ | ⚠️ | ❌ | RPC returns them but `_pullSmartSync` ignores them; refetched only for tx in the list → split-only web edit may not arrive. Tables have no deleted marker |
| Never-delete-unsynced | ✅ | — | — | `_keepMissingTransactions` / `missing_row_guard.dart`: delete only on deleted_at / is_deleted / is_active=false; missing rows re-uploaded |
| Concurrent edits | ⚠️ | ⚠️ | — | `_keepLocalMoney` LWW on SyncClocks vs server updated_at, whole row → edits to different fields on two devices lose one |
| Accounts, outings, outing expenses, friends | ✅ | ✅ | ✅ | `sync_tables.dart` specs with deleted_at; realtime + user_changes |
| Friend splits, settlements | ✅ | ✅ | ✅ | Both have `deleted_at` |
| Savings goals, investments, snapshots | ✅ | ✅ | ✅ | DurableCollection: pending ops win, server list replaces local (`durable_collection.dart:182-241`) |
| Recurring bills | ✅ | ✅ | ⚠️ | Full-list replace honors deletes, but no deleted marker → edit/delete race can resurrect |
| Monthly plans | ✅ | ✅ | ❌ | No deleted_at/is_active (`sync_tables.dart` `hasDeletedAt:false`) → web delete comes back |
| Outing categories | ✅ | ✅ | ❌ | Same — no marker |
| Friend settlements | ✅ | ✅ | ❌ | No marker |
| Projector settings | ✅ | ✅ | ❌ | No marker |
| user_merchants / users | ✅ | ✅ | ⚠️ | `hasDeletedAt:false` |
| Catalog / settings / recurring via user_changes | ✅ | ✅ | — | user_changes channel :278 triggers fullSync (:321-325); 60 s foreground poll (:168) |
| budget_templates, income_streams, income_targets, smart_views, reflections, goal_contributions*, ai_*, user_merchant_category, account_purposes | ⚠️ | ⚠️ | ⚠️ | In DB, not found in app sync specs → web-only or unknown; verify (*goal contributions do sync via goal service contrib store) |

---

## PART 3 — Phone only

| Item | Status | Notes |
|---|---|---|
| No upload in Phone only | ✅ | `phone_only_upload.dart` `shouldPush` false; guards `sync_service.dart:220` (fullSync), :641 (pushPending), :4059 (_kickPush); `background_data_sync.dart` skips |
| Durable stores don't queue in Phone only | ✅ | `durable_collection.dart:110-121` `stage` sets no pending |
| Admin rules still arrive | ✅ | Anon SELECT, version check without sign-in |
| Realtime for admin rules | ⚠️ | None unless signed in → open/resume only |
| Switch Phone only → Cloud: transactions | ✅ | `phone_only_handover.dart` `queueTransactionsOnce`, `retargetOwner`; `auth_flow.dart:85-130` |
| Switch → Cloud: goals, investments (made while signed out) | ✅ | `adoptFrom(_store(_localOwner))` `savings_goal_service.dart:182-183`, `investment_service.dart:148` |
| Switch → Cloud: goals / investments made in Phone only **with a stored session** | ❌ | Staged under real uid with no pending (Phone only) → first Cloud `synchronize` replaces local with server list → rows lost |
| Switch → Cloud: snapshots | ❌ | `snapshot_outbox.dart` stage requires uid, no adoption; same overwrite risk |
| Recurring bills in Phone only (signed out) | ❌ | `recurring_bill_service.dart:46-50` throws "Sign in before changing recurring bills" |
| Recurring bills in Phone only (session stored) | ⚠️ | `importRows(_legacy(uid), upload:true)` :52 has no Phone only check; pull path calls recurring sync |
| Other direct writers | ⚠️ | snapshot_outbox, purpose_share_service, self_upi_service, conflict_row_writer — verify Phone only guard |
| Accounts / outings / friends created in Phone only | ⚠️ | Not in handover; MissingRowGuard should re-queue after first Cloud pull — verify on device |

---

## PART 4 — Results

### A. Working (✅ 27)
SMS templates/detection/block delivery, manual rules kept, merchant brands/keys/keyword rules, category catalog, global settings, version engine, engine hot reload, admin realtime (signed in); normal tx both ways, tx row deletes, never-delete-unsynced guard, accounts/outings/friends, friend splits & settlements, goals/investments/snapshots (Cloud), recurring sync, user_changes refresh; Phone only no-upload, no-queue, rules arrive, tx handover, signed-out goals/investments adoption.

### B. Bugs (❌ 11)
1. Phone only (session stored) → Cloud: goals/investments lost on first synchronize.
2. Phone only → Cloud: snapshots lost / never uploaded.
3. Smart pull 500-tx cap + cursor jump skips changes forever.
4. Fresh install / full pull gets only newest 500 tx.
5. Web deletes come back: monthly plans, outing categories, friend settlements, projector settings (no marker).
6. Split/item deletes not reaching phone.
7. `mcc_category_map` never reaches phones.
8. Recurring bills can't be saved in Phone only (signed out).

### C. Gaps / risks (⚠️ 14)
Built-in block/detection disabled IDs untracked; versions stored after failed refresh; no realtime for Phone only/signed-out; split-only web edits; whole-row LWW; recurring edit/delete race; user_merchants/users no marker; web-only tables unverified; mail_templates admin-only; recurring importRows unguarded; other direct writers unverified; Phone only accounts/outings handover unverified.

### D. Fix list (data loss first)
1. **Phone only → Cloud handover**: queue all durable stores (goals, contributions, investments, snapshots, recurring) as pending on switch, like `queueTransactionsOnce`.
2. **Smart pull cap**: when tx count == `p_tx_limit`, set cursor to last row's updated_at and loop (or page); on null `p_since` run `_pullTransactionsWindow`.
3. **Add `deleted_at`** to monthly_plans, outing_categories, friend_settlements, transaction_splits, transaction_items, recurring_bills, projector_settings (+ user_merchants); soft-delete on web.
4. **Apply RPC `transaction_splits` / `transaction_items`** in `_pullSmartSync`.
5. **Add `mcc_category_map`** to AdminAreaMap (`sync_efficiency.dart:62-70`) + phone consumer.
6. Track admin-disabled IDs for block/detection rules too.
7. Allow recurring bills in Phone only (local owner + adoptFrom).
8. Only store an area version after that area refresh succeeds.
9. Field-level merge (or per-field clocks) for transactions.
10. Lightweight rules_version poll/realtime for signed-out & Phone only.
