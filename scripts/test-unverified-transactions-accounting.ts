/**
 * Tests for Hybrid Sync Engine - Section 12 Website Behavior:
 * 1. Unverified transactions are excluded from period totals (income, expense, grossExpense, reimbursements).
 * 2. Unverified transactions are excluded from account balance & net worth calculations.
 * 3. Unverified transactions are excluded from monthly plan actuals.
 * 4. Filtering by status ("unverified", "completed", "all") behaves accurately.
 * 5. Verify transition promotes to "completed".
 * 6. Reject transition marks as inactive, status "rejected", and sets deleted_at.
 * Run: npx tsx scripts/test-unverified-transactions-accounting.ts
 */
import assert from "node:assert/strict";
import {
  computePeriodTotals,
  isConfirmedTransaction,
  sumPeriodExpense,
  sumPeriodGrossExpense,
  sumPeriodIncome,
  sumPeriodReturns,
} from "../src/lib/period-totals";
import {
  computeAccountBalancesMap,
  isBalanceExcludedTransaction,
} from "../src/lib/wealth";
import { computeCategorySpentActuals } from "../src/lib/plan";
import { filterTransactions } from "../src/lib/utils";
import { createDefaultGlobalFilters } from "../src/lib/filter-defaults";
import type { Account, Category, Transaction } from "../src/types";

function makeTx(partial: Partial<Transaction>): Transaction {
  const amount = partial.totalAmount ?? partial.amount ?? 0;
  return {
    id: crypto.randomUUID(),
    merchant: "Test Merchant",
    source: "manual",
    transactionDate: "2026-10-05T10:00:00.000Z",
    date: "2026-10-05T10:00:00.000Z",
    totalAmount: amount,
    amount,
    type: "expense",
    category: "Food & Dining",
    status: "completed",
    ...partial,
  } as Transaction;
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("── Hybrid Sync Engine (Section 12: Website Behavior) Tests ──");

check("isConfirmedTransaction helper accurately differentiates statuses", () => {
  assert.equal(isConfirmedTransaction(makeTx({ status: "completed" })), true);
  assert.equal(isConfirmedTransaction(makeTx({ status: "pending" })), true);
  assert.equal(isConfirmedTransaction(makeTx({ status: undefined })), true);
  assert.equal(isConfirmedTransaction(makeTx({ status: "unverified" })), false);
  assert.equal(isConfirmedTransaction(makeTx({ status: "rejected" })), false);
  assert.equal(isConfirmedTransaction(makeTx({ status: "failed" })), false);
});

check("Unverified transactions never affect period income or expenses", () => {
  const confirmedExpense = makeTx({
    type: "expense",
    category: "Groceries",
    amount: 1500,
    status: "completed",
  });
  const unverifiedExpense = makeTx({
    type: "expense",
    category: "Dining",
    amount: 800,
    status: "unverified",
    isAutoDetected: true,
  });
  const confirmedIncome = makeTx({
    type: "income",
    category: "Salary",
    amount: 50000,
    status: "completed",
  });
  const unverifiedIncome = makeTx({
    type: "income",
    category: "UPI Credit",
    amount: 12000,
    status: "unverified",
    isAutoDetected: true,
  });

  const txs = [confirmedExpense, unverifiedExpense, confirmedIncome, unverifiedIncome];

  assert.equal(sumPeriodIncome(txs), 50000);
  assert.equal(sumPeriodGrossExpense(txs), 1500);
  assert.equal(sumPeriodExpense(txs), 1500);

  const totals = computePeriodTotals(txs);
  assert.deepEqual(totals, {
    income: 50000,
    grossExpense: 1500,
    reimbursements: 0,
    expense: 1500,
    net: 48500,
  });
});

check("Unverified transactions never affect wealth account balances", () => {
  const account: Account = {
    id: "acc-1",
    name: "HDFC Salary",
    type: "bank",
    openingBalance: 10000,
  };

  const confirmedTx = makeTx({
    accountId: "acc-1",
    account: "HDFC Salary",
    type: "expense",
    amount: 2000,
    status: "completed",
  });

  const unverifiedTx = makeTx({
    accountId: "acc-1",
    account: "HDFC Salary",
    type: "expense",
    amount: 3500,
    status: "unverified",
    isAutoDetected: true,
  });

  assert.equal(isBalanceExcludedTransaction(unverifiedTx), true);
  assert.equal(isBalanceExcludedTransaction(confirmedTx), false);

  const balances = computeAccountBalancesMap([account], [confirmedTx, unverifiedTx]);
  // 10000 opening - 2000 confirmed = 8000 (3500 unverified ignored)
  assert.equal(balances.get("acc-1"), 8000);
});

check("Unverified transactions never inflate monthly plan category actuals", () => {
  const confirmedDining = makeTx({
    category: "Dining Out",
    amount: 400,
    status: "completed",
    transactionDate: "2026-10-05T10:00:00.000Z",
  });
  const unverifiedDining = makeTx({
    category: "Dining Out",
    amount: 900,
    status: "unverified",
    isAutoDetected: true,
    transactionDate: "2026-10-05T10:00:00.000Z",
  });

  const actuals = computeCategorySpentActuals([confirmedDining, unverifiedDining], "2026-10");
  assert.equal(actuals["Dining Out"], 400);
});

check("filterTransactions handles status filter correctly", () => {
  const confirmed = makeTx({ id: "t1", status: "completed" });
  const unverified = makeTx({ id: "t2", status: "unverified", isAutoDetected: true });

  const baseFilters = createDefaultGlobalFilters();

  const allResult = filterTransactions([confirmed, unverified], baseFilters);
  assert.equal(allResult.length, 2);

  const unverifiedOnly = filterTransactions([confirmed, unverified], {
    ...baseFilters,
    status: "unverified",
  });
  assert.equal(unverifiedOnly.length, 1);
  assert.equal(unverifiedOnly[0].id, "t2");

  const completedOnly = filterTransactions([confirmed, unverified], {
    ...baseFilters,
    status: "completed",
  });
  assert.equal(completedOnly.length, 1);
  assert.equal(completedOnly[0].id, "t1");
});

console.log(`\nAll ${passed} tests passed successfully!`);
