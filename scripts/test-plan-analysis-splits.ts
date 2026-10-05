import assert from "node:assert";
import { computeCategorySpentActuals } from "../src/lib/plan";
import { narrowTransactionsToFilter } from "../src/lib/utils";
import type { Purpose, Transaction } from "../src/types";

console.log("── Testing Plan & Analysis Split Expenses & Invite Claiming ──");

const purposes: Purpose[] = [
  { id: "p-personal", name: "Personal", isDefault: true, isActive: true, createdAt: "2026-01-01" },
  { id: "p-home", name: "Home", isDefault: false, isActive: true, createdAt: "2026-01-01" },
];

// Scenario 1: Multi-category split within same purpose (Personal: $60 Food, $40 Utilities)
const splitCategoryTx: Transaction = {
  id: "tx-split-1",
  userId: "user-1",
  type: "expense",
  source: "manual",
  merchant: "Supermarket",
  totalAmount: 100,
  amount: 100,
  category: "Food", // legacy first-slice
  purpose: "p-personal", // legacy first-slice
  purposeId: "p-personal",
  transactionDate: "2026-09-15T10:00:00Z",
  hasSplits: true,
  splits: [
    {
      id: "sp-1",
      transactionId: "tx-split-1",
      userId: "user-1",
      amount: 60,
      categoryId: "Food",
      purposeId: "p-personal",
    },
    {
      id: "sp-2",
      transactionId: "tx-split-1",
      userId: "user-1",
      amount: 40,
      categoryId: "Utilities",
      purposeId: "p-personal",
    },
  ],
};

// Scenario 2: Multi-purpose split (Personal $70 Groceries, Home $30 Decor)
const splitPurposeTx: Transaction = {
  id: "tx-split-2",
  userId: "user-1",
  type: "expense",
  source: "manual",
  merchant: "MegaMart",
  totalAmount: 100,
  amount: 100,
  category: "Groceries", // first-slice
  purpose: "p-personal", // first-slice
  purposeId: "p-personal",
  transactionDate: "2026-09-20T12:00:00Z",
  hasSplits: true,
  splits: [
    {
      id: "sp-3",
      transactionId: "tx-split-2",
      userId: "user-1",
      amount: 70,
      categoryId: "Groceries",
      purposeId: "p-personal",
    },
    {
      id: "sp-4",
      transactionId: "tx-split-2",
      userId: "user-1",
      amount: 30,
      categoryId: "Decor",
      purposeId: "p-home",
    },
  ],
};

// 1. Plan Personal scope gets correct slices
const personalTransactions = narrowTransactionsToFilter(
  [splitCategoryTx, splitPurposeTx],
  { purposeId: "p-personal", categories: [] },
  purposes,
);

// Should have: splitCategoryTx (sp-1: 60, sp-2: 40) + splitPurposeTx (sp-3: 70) = 3 slices
assert.strictEqual(personalTransactions.length, 3, "Personal scope should expand to 3 slices");
const personalActuals = computeCategorySpentActuals(personalTransactions, "2026-09");
assert.strictEqual(personalActuals["Food"], 60, "Food actuals must be 60, not 100");
assert.strictEqual(personalActuals["Utilities"], 40, "Utilities actuals must be 40");
assert.strictEqual(personalActuals["Groceries"], 70, "Groceries actuals must be 70");
assert.strictEqual(personalActuals["Decor"], undefined, "Decor (Home purpose) must not be in Personal plan");
console.log("  ✓ Personal plan actuals accurately distribute slices across Food (60), Utilities (40), Groceries (70)");

// 2. Plan Home scope gets only the Home slice (Decor: 30)
const homeTransactions = narrowTransactionsToFilter(
  [splitCategoryTx, splitPurposeTx],
  { purposeId: "p-home", categories: [] },
  purposes,
);
assert.strictEqual(homeTransactions.length, 1, "Home scope should have 1 slice");
assert.strictEqual(homeTransactions[0].amount, 30, "Home slice amount should be 30");
assert.strictEqual(homeTransactions[0].category, "Decor", "Home slice category should be Decor");

const homeActuals = computeCategorySpentActuals(homeTransactions, "2026-09");
assert.strictEqual(homeActuals["Decor"], 30, "Decor actuals in Home plan must be 30");
assert.strictEqual(homeActuals["Food"], undefined, "Food must not appear in Home plan");
assert.strictEqual(homeActuals["Groceries"], undefined, "Groceries must not appear in Home plan");
console.log("  ✓ Home plan correctly isolates the $30 Decor slice from multi-purpose split");

// 3. Unfiltered view (Analysis 'All Purposes') expands splits so each category receives its slice
const allAnalysisTransactions = narrowTransactionsToFilter(
  [splitCategoryTx, splitPurposeTx],
  { purposeId: "", categories: [] },
  purposes,
);
assert.strictEqual(allAnalysisTransactions.length, 4, "Unfiltered scope should expand all 4 slices");
const allActuals = computeCategorySpentActuals(allAnalysisTransactions, "2026-09");
assert.strictEqual(allActuals["Food"], 60, "All purposes: Food = 60");
assert.strictEqual(allActuals["Utilities"], 40, "All purposes: Utilities = 40");
assert.strictEqual(allActuals["Groceries"], 70, "All purposes: Groceries = 70");
assert.strictEqual(allActuals["Decor"], 30, "All purposes: Decor = 30");
const totalSum = Object.values(allActuals).reduce((a, b) => a + b, 0);
assert.strictEqual(totalSum, 200, "Total expense must match full $200");
console.log("  ✓ Analysis All Purposes expands all slices with exact sum $200 matching Dashboard");

// 4. Raw un-narrowed computeCategorySpentActuals also handles multi-split transactions
const directActuals = computeCategorySpentActuals([splitCategoryTx], "2026-09");
assert.strictEqual(directActuals["Food"], 60, "Direct computeCategorySpentActuals splits Food to 60");
assert.strictEqual(directActuals["Utilities"], 40, "Direct computeCategorySpentActuals splits Utilities to 40");
console.log("  ✓ computeCategorySpentActuals handles raw multi-split rows without dropping slices");

console.log("\nALL PLAN & ANALYSIS SPLIT EXPENSE TESTS PASSED!\n");
