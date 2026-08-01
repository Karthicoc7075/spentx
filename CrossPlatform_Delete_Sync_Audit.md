# SpentX Cross-Platform Delete/Sync Audit (Web ↔ Mobile)

Scope: does a delete or change on one platform correctly converge on the other after offline→online sync, for every entity mobile syncs. All findings are from full-file source tracing on both codebases (Flutter mobile + Next.js/Supabase web), not docs.

---

## Leading issue: outings resurrection bug

**Status: CONFIRMED BROKEN**

**Evidence — push side**, `Mobile app/SpentX/lib/core/sync/supabase_schema_map.dart:510` (`OutingMap.toRemote`):
```dart
isActive: true, // never soft-delete via sync upsert
```
This is unconditional — every outing push, for any reason (editing a field, adding an expense, even a repair/requeue action), sends `is_active: true` regardless of what the outing's actual state is or what was last pulled from the server.

**Evidence — pull side**, `sync_service.dart:1076`:
```dart
.eq(OutingMap.isActive, true)
```
Pull fetches only active outings.

**Exact failure scenario:**
1. Outing created on web, synced to mobile (mobile pulls it, `is_active=true` both sides).
2. Mobile goes offline.
3. Web soft-deletes the outing (`is_active=false`).
4. While still offline, mobile edits anything about that outing locally — adds an expense, edits the title, or even just has a stale queued upsert from before — anything that triggers `_pushOutingDocument`.
5. Mobile comes back online. `fullSync()` runs push-before-pull (confirmed the standard order app-wide). The push fires first: `OutingMap.toRemote` unconditionally sends `is_active: true`, silently **resurrecting the outing on the server** — the web-side delete is overwritten before mobile's own pull ever gets a chance to notice the outing was gone.
6. Mobile's subsequent pull then fetches the (now re-activated) outing back down as if nothing happened. Web's next Realtime-driven refetch on the `outings` channel also picks up the resurrected row. **Result: the deleted trip comes back on both platforms**, silently, with no error or signal to either user.

This is confirmed not caused by push/pull ordering — the bug fires identically regardless of ordering, because the payload itself hardcodes the value rather than reflecting real state. Ordering was separately confirmed correct and is not implicated.

**Fix — the concrete change:** Stop hardcoding `isActive: true` in `OutingMap.toRemote`. Push whatever `is_active` value mobile last pulled/knows locally for that outing, and only default to `true` when creating a brand-new local outing that has never been synced (no `remoteId`/never-pushed marker yet). Bring outings in line with the pattern already correctly used for accounts/friends/contributors/categories: `is_active` should be a real field reflecting actual delete/undelete intent, set conditionally by the actual operation (create vs. edit vs. delete), never a hardcoded literal on every push. Concretely:
```dart
// Instead of: isActive: true,
isActive: local['isActive'] ?? true, // preserve last-known/pulled value; default true only for brand-new local outings
```
And ensure the local outing model actually carries and updates `isActive` from every pull (`_pullOutings` already writes the full doc per outing — confirm it also writes back `is_active` onto the local doc, not just the child expense/settlement lists, so there's a real "last known server state" to preserve on the next push).

Separately, whether outings should follow the "pending edit blocks server-delete-from-overwriting-local, but push should never silently reactivate a server-deleted record" pattern: yes — once the hardcoded literal is removed, the existing pending-check machinery already used elsewhere (`SyncQueue.hasPending`) is sufficient and should be applied consistently to the outing pull path too (see the related, secondary granularity issue in the outing_expenses/settlements section below).

---

## Known-correct entities re-verified

All of the following were traced and confirmed still accurate against current code — "row present locally but absent from the server's active set → delete locally, unless a pending local edit exists in `sync_queue`, in which case keep local until it pushes":

- **Transactions** — PASS. `sync_service.dart:1021-1058`, pruned against the 35-day rolling window with `hasPendingDelete`/`hasPending` guards before dropping any row.
- **Accounts** — PASS. `sync_service.dart:786-799`, drops any local account not in the server's active-name set unless pending.
- **Purposes** — PASS, by a different mechanism. Purposes aren't independently queued (no `SyncEntity.purpose`) — they're resolved server-side synchronously during transaction/plan pushes, so there's no local-only pending purpose state that could be wiped. Functionally safe.
- **Friends** — PASS. `sync_service.dart:1225-1234`, same pending-guarded drop pattern, keyed by name.
- **Contributors** — PASS. `sync_service.dart:1339-1355`, same pattern, keyed by id.
- **user_merchants** — PASS for the primary `merchants_box` (clear-and-rebuild-from-server-plus-pending, `sync_service.dart:692-718`). **Minor gap**: the legacy mirror into `merchant_rules_box` (lines 730-751) only ever adds/overwrites `'sync_$norm'` keys — it never removes one that's no longer in the server's active set after a delete. A deleted merchant rule is correctly dropped from `merchants_box` but the stale mirror entry in `merchant_rules_box` can persist indefinitely. If any auto-detect code path reads `merchant_rules_box` directly, a deleted rule could keep firing after its "delete" is otherwise fully synced everywhere else. **Fix:** before repopulating `merchant_rules_box` from the server set, clear only the `'sync_*'`-prefixed keys first (mirroring the clear-and-rebuild already done for `merchants_box`), so stale sync-derived entries can't survive a server-side delete.

---

## Per-entity delete propagation

### monthly_plans — CONFIRMED WORKING
Web delete is a real hard `DELETE` (`supabase-data.ts:1864-1869`). Mobile's push-side delete also does a real hard `.delete()` (`sync_service.dart:478-491`), matching semantics. Mobile's pull (`_pullMonthlyPlans`, `sync_service.dart:1822-1889`) does a full replace of the `monthly_plans` Hive list from the server's current rows every time — which trivially satisfies "absent = deleted" since it's a full overwrite, not a selective merge.

One structural note, not a bug in practice: this pull has no pending-check at all, unlike contributors/friends/accounts. Under normal `fullSync()` (push-before-pull, confirmed the standard order), this creates no real risk since any local edit pushes before the pull runs. It's the one entity whose pull is a blind overwrite rather than a pending-aware merge — low risk today, but worth hardening if `pullAll()` is ever invoked standalone outside `fullSync()`. **Optional fix:** add a `SyncQueue.hasPending(SyncEntity.monthlyPlan, id)` guard before the full replace, matching the pattern already used for contributors/friends.

### categories — CONFIRMED WORKING
Web soft-deletes (`is_active=false`, `supabase-data.ts:959-961`). Mobile's pull (`sync_service.dart:1244-1311`) filters `is_active=true` and rebuilds the category list fresh each time, so a deleted category is silently excluded going forward.

Transactions store `category` as a plain string (`Transaction.category`, confirmed a bare `String` field, not an id/FK — matching web's own `category_id` column, which is also name-keyed text, not a real foreign key). The only category→visual mapping in the mobile app is a static hardcoded lookup table (`category_icon.dart:48-51`) keyed by lowercase string with a safe `?? 'Other'` fallback — never an id-based lookup against a `Category` record. Confirmed: deleting a custom category cannot crash, null-out, or corrupt any historical transaction that used its name — the transaction just keeps displaying with a generic fallback icon.

### accounts — CONFIRMED WORKING
Web soft-delete propagates `is_active=false` correctly (already confirmed above). Mobile's net-worth calculation (`transaction_provider.dart:399-400`) filters `.where((a) => a.isActive)` at getter-invocation time, reading live from the same Hive-backed state the pull writes into — recomputed on every read via a Riverpod provider, not a cached/memoized total. No app restart needed; the deactivated account drops out of net worth the moment the pull commits.

### friends — CONFIRMED WORKING
Web friend delete propagates via the same pending-guarded prune pattern confirmed above. Outing membership (`OutingMember` model, `outing_provider.dart:10-21`) stores only a locally-generated id (distinct from any friend record's id) and a plain `name` string captured at add-time — there is no FK or live reference to the friends table at all, at any layer, mobile or web (`OutingMap.toRemote` pushes the same denormalized `{id, name}` shape). Deleting a friend record can never retroactively blank or corrupt a historical outing's member list, because outings never joined against friends to begin with — membership was always captured by value.

### outing_expenses / settlements (within a still-active, non-deleted outing) — PARTIALLY WORKING
Mobile-deletes-one-expense direction is fully confirmed correct: the whole-document push prunes exactly the removed row (and only mobile-authored settlements tied to it via the `exp:` note marker) without touching or resurrecting anything else. Web sees this near-instantly, because mobile's push always upserts the parent `outings` row too (even when only a child expense changed), which trips the web `outings` Realtime channel and triggers a full refetch that picks up the pruned expense list as a side effect.

Web-deletes-one-expense direction is correct in the simple case: mobile's `_pullOutings` rebuilds each outing's expense/settlement lists entirely from the server's current rows every pull, so a deleted expense is simply absent from the rebuilt list, and the rest of the outing's expenses are unaffected. The gap is in conflict granularity: the pending-check that guards this pull only operates at the **whole-outing level** (`sync_service.dart:1115`, `if (SyncQueue.hasPending(SyncEntity.outing, outingId)) continue;`) — if mobile is offline and mid-edit on a *different* expense in the *same* outing, the entire outing gets skipped on the next pull until mobile's own pending edit finishes pushing. This creates a temporary window (not permanent divergence) where mobile keeps showing a web-deleted expense until its own local edit clears the queue. This is the same root cause as the previously-documented full-document-push/no-per-row-versioning issue, just manifesting here too.

**Fix:** Move the pending-check from whole-outing to per-child-row granularity — track pending expense/settlement ids in the queue payload and skip merging only those specific rows, rather than skipping the entire outing whenever any part of it has an unrelated pending edit.

### user_merchants — CONFIRMED WORKING (primary box), MINOR GAP (legacy mirror — see above)

---

## Offline-to-online sync mechanics

**7. Push/pull ordering on reconnect — CONFIRMED.** `fullSync()` runs reference-data pull (accounts/purposes) → `pushPending()` → full `pullAll()`, consistently, everywhere (`sync_service.dart:90-110`, `connectivity_sync_listener.dart:16-43`, `background_data_sync.dart`). Push always runs before the full pull. This ordering is correct and is explicitly **not** the cause of the outings bug — that bug is caused purely by the hardcoded payload literal and would occur under any ordering. Every other entity in scope sets `is_active` conditionally based on real operation intent, so push-before-pull correctly lets a genuine local edit win before a stale pull could revert it.

**8. Cross-table atomicity — CONFIRMED: none exists.** Each `_pull*` function commits its own Hive box independently the moment its own network call resolves (`pullAll()`, `sync_service.dart:658-676`, calls each `_pull*` sequentially with no shared transaction or deferred-commit). Within a single table, writes are atomic from an observer's perspective (the full new list is built in memory, then written in one `box.put()` call) — a UI reading that one table mid-pull sees either fully-old or fully-new data, never half-merged. But **across tables**, there is no such guarantee: transactions are pulled and committed before outings, so a rollup computed from both providers simultaneously could transiently reference freshly-pulled transactions alongside still-stale outing data (or vice versa), if anything reads the individual Hive boxes directly rather than waiting for the single `onDataChanged` callback that fires only once, after the entire `pullAll()` completes. Anything gated purely on `onDataChanged` is safe; anything with its own direct Hive box listener is not.

**9. App killed mid-sync — CONFIRMED for push (safe); CONFIRMED GAP for pull (no indicator).** Mid-push: `SyncQueue` entries are only removed after their individual push succeeds, so a kill mid-loop leaves the remaining entries correctly persisted and retried on next launch (`pushPending()`, `sync_service.dart:162-197`). Mid-pull: there is no per-table or overall "sync in progress"/"last completed" flag surfaced anywhere the user could see. The only related state, `_lastPullAt`, is set once at the very end of `pullAll()` and is used purely internally to throttle foreground re-syncs — it's never updated (and never was in the killed run) if the app dies partway through, and it's never shown to the user either way. **Net effect: a kill mid-pull silently leaves some tables fresh and others one-cycle-stale, with zero signal that anything is inconsistent**, until the next successful full pull quietly corrects it at some unbounded future time.

**Fix:** Set a `pull_in_progress` flag in Hive at the start of `pullAll()`, clear it only after every `_pull*` call and the final `_lastPullAt` update succeed; surface a subtle "syncing…" indicator on launch if the flag is still set from a previous run, and consider persisting a per-table `last_synced_at` so any UI that spans multiple tables (like outing rollups) can detect and account for a stale window instead of rendering a silent mismatch.

---

## Web-side Realtime vs refetch coverage (mobile → web)

Global React Query defaults (`query-provider.tsx`) confirmed unchanged: `staleTime: 10 minutes`, with `refetchOnWindowFocus`, `refetchOnMount`, and `refetchOnReconnect` **all disabled**. Without Realtime, a query only refreshes on an explicit `invalidateQueries` call or a full page reload — in practice the "10 minutes" is a soft ceiling, not a guarantee, since none of the passive auto-refetch triggers are on.

| Entity | Realtime? | Practical latency on web after a mobile change |
|---|---|---|
| transactions | Yes | Near-instant |
| transaction_splits | Yes (same channel) | Near-instant |
| outings (header) | Yes | Near-instant |
| outing_expenses | No direct channel — indirect via outings | Near-instant today (incidental: mobile always touches the parent outing row on every push), not structurally guaranteed |
| settlements | No direct channel — indirect via outings | Same as outing_expenses — incidental, not structural |
| accounts | No | Up to 10 min stale, or until next reload/explicit invalidation — often longer in practice |
| purposes | No | Same as accounts |
| categories | No | Same as accounts |
| contributors | No | Same as accounts |
| friends | No | Same as accounts |
| monthly_plans | No | Same as accounts |
| user_merchants | No | Same as accounts (and rarely read by the web UI directly regardless) |

---

## Consolidated safety table

| Entity | Delete propagates web → mobile | Delete propagates mobile → web | Safe to use offline right now |
|---|---|---|---|
| transactions | Yes | Yes | Yes |
| accounts | Yes | Yes | Yes |
| purposes | Yes | Yes | Yes |
| categories | Yes | Yes | Yes |
| contributors | Yes | Yes | Yes |
| **outings** | **No — resurrected by mobile's next push** | Yes | **No — do not delete a trip on web while a mobile device has it and might push offline edits** |
| outing_expenses (within active outing) | Yes, with a temporary delay if mobile has an unrelated pending edit on the same outing | Yes | Mostly yes — minor timing caveat, no permanent divergence |
| settlements (within active outing) | Yes, same temporary-delay caveat as above | Yes | Mostly yes — same caveat |
| friends | Yes | Yes | Yes |
| monthly_plans | Yes | Yes | Yes |
| user_merchants | Yes (primary box); stale legacy mirror entry possible | Yes | Mostly yes — minor gap in legacy `merchant_rules_box` cleanup |

The outings bug is the one item on this list that needs to be fixed before the app can be trusted for offline outing deletion — everything else is either fully correct or has only a minor, non-permanent timing caveat.
