import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

/**
 * Single shared invalidation path for every mutation that can change a
 * number shown on Dashboard or Wealth.
 *
 * Root cause this exists to prevent: `transactions` (and the outing rollup
 * row inside it) is kept live via a Supabase Realtime subscription
 * (see subscribeToTransactions in supabase-data.ts / app-data-provider.tsx),
 * so it self-heals everywhere automatically. But `outing_expenses`,
 * `settlements`, and `accounts` have NO Realtime coverage and use React
 * Query's default `staleTime`/`gcTime` (10 min / 60 min, see
 * query-provider.tsx). Dashboard and Wealth both read `allOutingExpenses`
 * (unlinked outing cash feeds `unlinkedOutingCashImpact` in wealth.ts) —
 * so any outing/expense/settlement/account mutation that doesn't also
 * invalidate those keys leaves Dashboard/Wealth showing stale numbers
 * until the 10-minute staleTime lapses or the page is hard-reloaded
 * (which wipes React Query's in-memory cache and forces a refetch).
 *
 * Every current and future mutation that touches money-affecting data —
 * transaction CRUD, outing CRUD, outing-expense CRUD, settlement CRUD,
 * account CRUD — must call this after a successful write, instead of
 * hand-picking which query keys to invalidate. That's what keeps the next
 * new mutation path from silently reintroducing this same bug.
 */
export async function invalidateFinancialData(
  queryClient: QueryClient,
  userId: string | undefined,
  options: { outingId?: string } = {},
) {
  const keys: (readonly unknown[])[] = [
    queryKeys.transactions(userId),
    queryKeys.allOutingExpenses(userId),
    queryKeys.accounts(userId),
    queryKeys.outings(userId),
    queryKeys.categories(userId),
    // Friend balances derive from these two; a settlement or a deleted
    // friend-split transaction must move the number on Friends/Friend detail.
    queryKeys.allFriendSplits(userId),
    queryKeys.allFriendSettlements(userId),
    queryKeys.friends(userId),
  ];

  if (options.outingId) {
    keys.push(
      queryKeys.outingExpenses(userId, options.outingId),
      queryKeys.outingSettlements(userId, options.outingId),
    );
  }

  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
