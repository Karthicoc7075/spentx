# SpentX Web — Outing Delete / Rollup Sync Audit

Scope: web app only (`spentx-web`). All findings are from static code tracing, not a live-DB reproduction.

## Primary bug: does deleting an outing orphan its rollup transaction?

**Status: REFUTED as originally framed — the rollup delete already exists — but CONFIRMED fragile, and CONFIRMED that `outing_expenses`/`settlements` are genuinely orphaned.**

Call trace, Delete Trip:

`TripDetailPage.tsx:485-498`, `handleConfirmDelete`:
```ts
async function handleConfirmDelete() {
  const existing = findOutingRollupTransaction(transactions, outing.id);
  if (existing) {
    try {
      await deleteTransaction(existing.id);
    } catch {
      // Outing delete should still proceed.
    }
  }
  await removeOuting(outing.id);
  ...
}
```

`removeOuting` → `useOutings.ts:41-47` → `app-data-provider.tsx:509-512` → `deleteOuting` in `supabase-data.ts:2177-2186`:
```ts
export async function deleteOuting(userId, outingId) {
  await throwIfError(
    client().from("outings")
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: userId })
      .eq("user_id", userId).eq("id", outingId),
  );
}
```

So the current code **does** attempt to delete the rollup transaction first, before soft-deleting the outing. This refutes the bug as literally stated. Two real problems remain, however:

**1. The rollup delete is best-effort and silently swallowed.** If `deleteTransaction(existing.id)` throws (network blip, RLS issue), the `catch {}` is empty and the outing delete proceeds anyway — the rollup survives, still tagged `outing-rollup`, pointing at an outing that's now `is_active=false`. Since it's excluded from balance math by tag (`isOutingRollupTransaction`, checked independent of whether the parent outing still exists), it does **not** inflate Dashboard/Wealth totals even when orphaned — but it does leave a dead row on the Transactions ledger that routes to a 404 when clicked (`fetchOutings` filters `isActive !== false`, so `/outings/{outingId}` becomes unreachable).

**2. `outing_expenses` and `settlements` are never cleaned up on outing delete at all**, in any code path. This is because `deleteOuting` is a soft-delete (`UPDATE is_active=false`), not a real row `DELETE` — so the FK cascade never fires:

From `supabase/migrations/init.sql`:
```sql
-- outing_expenses.outing_id
outing_id uuid not null references public.outings(id) on delete cascade,   -- line 352
-- settlements.outing_id
outing_id uuid not null references public.outings(id) on delete cascade,   -- line 369
-- transactions.outing_id (and transaction_splits.outing_id)
foreign key (outing_id) references public.outings(id) on delete set null   -- lines 343-347
```

`ON DELETE CASCADE` is configured correctly for `outing_expenses`/`settlements` — but it's dead code today because nothing ever issues a real `DELETE` on `outings`. Every `outing_expenses`/`settlements` row for a deleted trip becomes permanently orphaned, invisible garbage in Postgres (invisible because nothing queries them once the parent outing drops out of `fetchOutings`'s `isActive !== false` filter — not a UI-visible bug, but real data debt with no cleanup path, and a real problem if these tables are ever reported on directly, e.g. via SQL exports or admin tooling).

**Root cause category:** missing guaranteed cleanup (soft-delete bypasses FK cascade; best-effort rollup delete is silently swallowed on failure).

**Fix — one RPC that handles all three tables and works regardless of client (web, future mobile, admin):**
```sql
create or replace function public.soft_delete_outing(p_outing_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.outings
    set is_active = false, deleted_at = now(), deleted_by = p_user_id
    where id = p_outing_id and user_id = p_user_id;

  delete from public.transactions
    where outing_id = p_outing_id and user_id = p_user_id
      and tags @> array['outing-rollup'];

  delete from public.outing_expenses where outing_id = p_outing_id and user_id = p_user_id;
  delete from public.settlements where outing_id = p_outing_id and user_id = p_user_id;
end;
$$;
```
Call this from `deleteOuting` in `supabase-data.ts` instead of the raw `.update()`. This removes the silent-failure window (single atomic server-side operation) and actually cleans up `outing_expenses`/`settlements`, which today just accumulate as dead rows forever.

---

## Secondary audit

### A. Delete a single outing expense
**Status: CONFIRMED — still correct.** `OutingExpenseDetailSheet` → `TripDetailPage.tsx:890-894` → `handleDeleteExpense` (`TripDetailPage.tsx:354-388`) → `removeExpense()` then `await syncOutingRollup(nextExpenses)` at line 379. No fix needed.

### B. Delete/unlink an outing-linked transaction
**Status: CONFIRMED gap — this is a real, live instance of the same bug class the background auto-tag hook hit before, just in the opposite direction (removing a contributing row, not adding one).**

- `TransactionsPage.handleUnlinkOuting` (`TransactionsPage.tsx:209-233`): nulls `outing_id`, deletes the linked `outing_expenses` row — **never calls `syncOutingRollup` or any recompute**. The rollup total stays stale (too high) until the user separately opens `TripDetailPage` and touches another expense there.
- `TransactionsPage.handleDelete`'s 5-second undo-toast delete (`TransactionsPage.tsx:298-333`): deletes the transaction — same gap, no rollup recompute if the deleted transaction had `outingId` set.

**Root cause:** missing rollup-sync call.
**Fix:** Extract `syncOutingRollup` out of `TripDetailPage.tsx` (currently a private closure) into `src/lib/outings.ts` as a standalone exported function taking `(userId, outingId, expenses, transactions, defaultAccountName)`. Call it from `handleUnlinkOuting` (after line 219) and from the undo-toast's commit-delete closure (after line 308) whenever `transaction.outingId` is set.

### C. Delete an account
**Status: CONFIRMED correct.** `deleteAccount` soft-deletes (`supabase-data.ts:923-932`); `fetchAccounts` filters `isActive !== false` at fetch time (`supabase-data.ts:908-911`); `getAccountBalance`/`computeNetWorthBreakdown` take a pre-filtered `accounts[]` param, and both `useDashboardData.ts:20-23` and `WealthPage.tsx:48-51` filter before passing in. The delete call site also writes the optimistic filtered list directly into the query cache (`SettingsPage.tsx:592`), so Dashboard/Wealth update immediately, no stale window. No fix needed.

### D. Settlement + outing delete interaction
**Status: CONFIRMED — settlements survive, but no phantom-UI risk (same root cause as the primary bug's orphan issue, not a separate one).** Since outing delete is soft, the `settlements.outing_id ON DELETE CASCADE` never fires — rows persist forever. `computeMemberBalances` takes a `settlements[]` param directly with no join against `outings`; but `TripDetailPage` (the only place that fetches/renders settlements) is unreachable once the outing fails `fetchOutings`'s active filter, so nothing ever renders these dead rows. Same fix as the primary bug's RPC (which already deletes `settlements`).

### E. Edit an outing expense's amount
**Status: CONFIRMED rollup UPDATE works correctly / CONFIRMED narrower cache gap.** `syncOutingRollup` (`TripDetailPage.tsx:255-293`) does `updateTransaction({id: existing.id, ...})` — a real update, not create/delete — confirmed at lines 285-288. Since `transactions` has a live Realtime channel (`supabase-data.ts:630-659`), other open tabs see the new amount immediately with no manual invalidation needed.

Gap: the outing-expense mutation (`useOutingExpenses.ts:38-46`) only writes to its own cache key and never invalidates `queryKeys.allOutingExpenses(userId)`, which Dashboard/Wealth also read (for unlinked-expense cash-impact adjustments). That key has no Realtime coverage either, so it can stay stale up to the 10-minute `staleTime`.

**Fix:** in `TripDetailPage.tsx`'s `handleAddExpense`/`handleDeleteExpense`, after `syncOutingRollup(...)`, add:
```ts
await queryClient.invalidateQueries({ queryKey: queryKeys.allOutingExpenses(user?.id) });
```
(`TripDetailPage` doesn't currently import `useQueryClient` — needs adding.)

### F. Supabase Realtime coverage
**Status: CONFIRMED partial.** Realtime channels exist only for `transactions`+`transaction_splits` (`supabase-data.ts:644-654`), `outings` (`:2135-2140`), `smart_alerts`, and `ai-chat`. **No channel exists for `outing_expenses`, `settlements`, or `accounts`.** Combined with `refetchOnWindowFocus: false` and `refetchOnMount: false` (`query-provider.tsx:9-19`), a second open tab can show stale `outing_expenses`/`settlements`/`accounts` data for up to 10 minutes after a change in another tab — this is likely an intentional query-volume tradeoff, but worth knowing it's asymmetric: `transactions` and `outings` self-heal live, the other three tables don't.

---

## Cache/query-key check

`useDashboardData` and the Wealth page hook both source from `useTransactions()` (Realtime-covered) and `useAllOutingExpenses()` (not Realtime-covered, key `["outingExpenses", userId, "all"]`). The outing-delete mutation (`useOutings.ts:41-47`) only touches the outings-specific cache key — no shared "invalidate everything financial" helper exists anywhere in the codebase (confirmed via full-repo grep, zero matches for anything like `invalidateAll`/`invalidateFinancialData`).

**Despite that, Dashboard/Wealth do not go stale after an outing delete** — the rollup-transaction delete goes through `deleteTransaction`, which is Realtime-covered, and the `outings` list itself is also Realtime-covered. So the "no update after delete" symptom as literally described in the bug report does not reproduce from current code. **Verdict: this is a genuine DB-level orphan-row problem (primary bug + item D), not a caching problem** — except for the narrower, separate item E/F gap around `allOutingExpenses`/`outingSettlements`, which is a real but different and smaller staleness issue.

---

## Prioritized list — same bug wearing different clothes

1. **No guaranteed server-side cleanup of `outing_expenses`/`settlements` on outing delete** (primary bug + item D). Soft-delete bypasses the correctly-configured `ON DELETE CASCADE` FKs, and the client-side rollup-transaction delete is best-effort and silently swallowed on failure. One fix — the `soft_delete_outing()` RPC above — closes all of this at once, for every current and future client.

2. **Missing rollup-sync call on the "remove a contributing transaction" direction** (item B). This is the same class of bug as the historical background auto-tag hook issue, just inverted — removing/unlinking a transaction doesn't trigger a rollup recompute the way adding/editing one does. Separate fix: extract and call `syncOutingRollup` from `TransactionsPage`'s unlink and delete handlers.

3. **`allOutingExpenses`/`outingSettlements` query keys never invalidated by outing-expense mutations, and no Realtime channel for those tables** (item E/F). Distinct, narrower staleness issue — data is correct in Postgres, just slow to reach other tabs/views. Fix: add explicit `invalidateQueries` calls alongside `syncOutingRollup`, or add Realtime channels matching the existing `transactions`/`outings` pattern.

Items A and C need no fix — already correct.
