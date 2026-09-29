import assert from "node:assert";
import { buildTransactionsListRows } from "../src/lib/outings";
import { sumPeriodExpense } from "../src/lib/period-totals";
import { buildCategoryTotals } from "../src/lib/category-totals";
import type { Transaction } from "../src/types";

console.log("── Testing Shared Multi-Split Invariants (P0 Fix 6) ──");

// An expense of $100 split 60/40 across CatA and CatB in the same purpose
const parentTxId = "tx-split-100";
const split1: Transaction = {
  id: `${parentTxId}_split_1`,
  parentTransactionId: parentTxId,
  splitId: "split_1",
  merchant: "Target Store",
  amount: 60,
  totalAmount: 60,
  category: "Groceries",
  purposeId: "purpose-shared-1",
  purpose: "purpose-shared-1",
  type: "expense",
  date: "2026-09-29T10:00:00Z",
  source: "manual",
};

const split2: Transaction = {
  id: `${parentTxId}_split_2`,
  parentTransactionId: parentTxId,
  splitId: "split_2",
  merchant: "Target Store",
  amount: 40,
  totalAmount: 40,
  category: "Household",
  purposeId: "purpose-shared-1",
  purpose: "purpose-shared-1",
  type: "expense",
  date: "2026-09-29T10:00:00Z",
  source: "manual",
};

const sharedTransactions = [split1, split2];

// 1. Check transaction line in transaction list
const listRows = buildTransactionsListRows(sharedTransactions, [], []);
assert.strictEqual(listRows.length, 1, "Multi-split expense must collapse into exactly 1 line for transaction list");
assert.strictEqual(listRows[0].amount, 100, "Transaction line amount must be the full amount (60 + 40 = 100)");
assert.strictEqual(listRows[0].id, parentTxId, "Transaction line id must be the parent transaction ID");
console.log("  ✓ Transaction list displays 1 line with full amount $100");

// 2. Check period expense calculation on dashboard / analysis
const periodSpend = sumPeriodExpense(sharedTransactions, {
  range: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
});
assert.strictEqual(periodSpend, 100, "Dashboard period expense must sum all split rows to 100");
console.log("  ✓ Dashboard / Analysis total spend reflects full $100 amount");

// 3. Check category breakdown chart
const catTotals = buildCategoryTotals(sharedTransactions, [
  { id: "Groceries", name: "Groceries", color: "green", icon: "cart", type: "expense", isDefault: true },
  { id: "Household", name: "Household", color: "blue", icon: "home", type: "expense", isDefault: true },
]);
const groceries = catTotals.find((c) => c.name === "Groceries");
const household = catTotals.find((c) => c.name === "Household");
assert.ok(groceries, "Groceries category exists");
assert.ok(household, "Household category exists");
assert.strictEqual(groceries.value, 60, "Groceries category keeps 60");
assert.strictEqual(household.value, 40, "Household category keeps 40");
console.log("  ✓ Category breakdown still accurately splits 60 / 40 across categories");

console.log("\nALL SHARED MULTI-SPLIT TESTS PASSED!");
