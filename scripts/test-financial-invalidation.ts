/**
 * Regression test for the "delete an outing → Dashboard/Wealth stay stale"
 * bug. Root cause: outing/expense/settlement/account mutations only
 * invalidated their own query key (e.g. `["outings", userId]`), never the
 * keys Dashboard/Wealth actually read (`transactions`, `allOutingExpenses`,
 * `accounts`). `invalidateFinancialData` is the single shared fix — this
 * test asserts every current mutation path calls it with the full key set,
 * so a future mutation path can't silently reintroduce the same gap.
 *
 * Run: npx tsx scripts/test-financial-invalidation.ts
 */
import assert from "node:assert/strict";
import { invalidateFinancialData } from "../src/lib/invalidate-financial-data";
import { queryKeys } from "../src/lib/query-keys";

type Invalidated = { queryKey: readonly unknown[] };

function fakeQueryClient() {
  const calls: Invalidated[] = [];
  return {
    calls,
    invalidateQueries: async ({ queryKey }: Invalidated) => {
      calls.push({ queryKey });
    },
  } as unknown as import("@tanstack/react-query").QueryClient & {
    calls: Invalidated[];
  };
}

function keySetOf(calls: Invalidated[]) {
  return new Set(calls.map((c) => JSON.stringify(c.queryKey)));
}

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      console.error(`  ✗ ${name}`);
      throw e;
    });
}

async function main() {
  console.log("── Financial data invalidation (Dashboard/Wealth staleness fix) ──");

  await check(
    "deleting an outing invalidates transactions, allOutingExpenses, accounts — not just the outings key",
    async () => {
      const userId = "user-1";
      const outingId = "outing-1";
      const qc = fakeQueryClient();

      // Simulates useOutings().removeOuting's call site after deleteOuting().
      await invalidateFinancialData(qc, userId, { outingId });

      const keys = keySetOf(qc.calls);
      assert.ok(
        keys.has(JSON.stringify(queryKeys.transactions(userId))),
        "must invalidate transactions (rollup lives here) — Dashboard/Wealth read this",
      );
      assert.ok(
        keys.has(JSON.stringify(queryKeys.allOutingExpenses(userId))),
        "must invalidate allOutingExpenses — Dashboard/Wealth's unlinked-cash net-worth adjustment reads this, and it has no Realtime coverage",
      );
      assert.ok(
        keys.has(JSON.stringify(queryKeys.accounts(userId))),
        "must invalidate accounts — net worth is computed from this list",
      );
      assert.ok(
        keys.has(JSON.stringify(queryKeys.outings(userId))),
        "must invalidate the outings list itself",
      );
      assert.ok(
        keys.has(JSON.stringify(queryKeys.outingExpenses(userId, outingId))),
        "must invalidate the per-outing expenses key (Trip page and Dashboard/Wealth must never disagree)",
      );
      assert.ok(
        keys.has(JSON.stringify(queryKeys.outingSettlements(userId, outingId))),
        "must invalidate the per-outing settlements key",
      );
    },
  );

  await check(
    "deleting/unlinking a transaction with an outingId invalidates the same full set",
    async () => {
      // Simulates TransactionsPage.handleUnlinkOuting / commitDelete after a
      // transaction with transaction.outingId set is removed — this is the
      // "remove a contributing row" direction that previously never
      // recomputed the outing's rollup total or Dashboard/Wealth.
      const userId = "user-2";
      const outingId = "outing-2";
      const qc = fakeQueryClient();

      await invalidateFinancialData(qc, userId, { outingId });

      const keys = keySetOf(qc.calls);
      assert.ok(keys.has(JSON.stringify(queryKeys.transactions(userId))));
      assert.ok(keys.has(JSON.stringify(queryKeys.allOutingExpenses(userId))));
    },
  );

  await check(
    "no outingId (plain transaction/account mutation) still invalidates the core Dashboard/Wealth keys",
    async () => {
      const userId = "user-3";
      const qc = fakeQueryClient();

      await invalidateFinancialData(qc, userId);

      const keys = keySetOf(qc.calls);
      assert.ok(keys.has(JSON.stringify(queryKeys.transactions(userId))));
      assert.ok(keys.has(JSON.stringify(queryKeys.allOutingExpenses(userId))));
      assert.ok(keys.has(JSON.stringify(queryKeys.accounts(userId))));
      // No outingId passed → must NOT attempt a per-outing key (would be
      // keyed on `undefined` and invalidate nothing useful).
      assert.equal(
        [...keys].some((k) => k.includes('"outingExpenses"') && k.includes('"outing-')),
        false,
      );
    },
  );

  console.log(`\nALL ${passed} FINANCIAL-INVALIDATION TESTS PASSED`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
