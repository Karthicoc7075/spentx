/**
 * Regression: adding a transaction once must not create a duplicate when the
 * Save button is clicked again before the form hides, and account id vs name
 * must still count as the same account (otherwise net worth drops 2×).
 * Run: npx tsx scripts/test-duplicate-transactions.ts
 */
import assert from "node:assert/strict";
import { findLikelyDuplicate } from "../src/lib/transaction-summary";
import type { Transaction } from "../src/types";

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "amount">,
): Transaction {
  return {
    merchant: "Cafe",
    source: "manual",
    type: "expense",
    category: "Food & Dining",
    transactionDate: "2026-09-17T10:00:00.000Z",
    date: "2026-09-17T10:00:00.000Z",
    totalAmount: partial.totalAmount ?? partial.amount,
    account: "HDFC",
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

console.log("── Duplicate add-transaction guard ──");

check("same amount, account name, and day is a duplicate", () => {
  const existing = [
    tx({ id: "t1", amount: 500, account: "HDFC", accountId: "acc-1" }),
  ];
  const match = findLikelyDuplicate(
    { amount: 500, account: "HDFC", date: "2026-09-17T10:01:00.000Z" },
    existing,
  );
  assert.equal(match?.id, "t1");
});

check("form account name matches saved accountId + accountName", () => {
  const existing = [
    tx({
      id: "t1",
      amount: 1200,
      accountId: "acc-uuid",
      account: "HDFC Savings",
      accountName: "HDFC Savings",
    }),
  ];
  const match = findLikelyDuplicate(
    { amount: 1200, account: "HDFC Savings", date: "2026-09-17" },
    existing,
  );
  assert.equal(match?.id, "t1");
});

check("in-flight fingerprint (no id on the saved row yet) is still caught", () => {
  const inflight = tx({
    id: "inflight-1",
    amount: 800,
    account: "Cash",
  });
  const match = findLikelyDuplicate(
    { amount: 800, account: "Cash", date: "2026-09-17T10:00:00.000Z" },
    [inflight],
  );
  assert.equal(match?.id, "inflight-1");
});

check("different account is not a duplicate", () => {
  const existing = [tx({ id: "t1", amount: 500, account: "HDFC" })];
  const match = findLikelyDuplicate(
    { amount: 500, account: "Cash", date: "2026-09-17T10:00:00.000Z" },
    existing,
  );
  assert.equal(match, null);
});

check("different day is not a duplicate", () => {
  const existing = [tx({ id: "t1", amount: 500, account: "HDFC" })];
  const match = findLikelyDuplicate(
    { amount: 500, account: "HDFC", date: "2026-09-16T10:00:00.000Z" },
    existing,
  );
  assert.equal(match, null);
});

check("missing date does not throw", () => {
  const match = findLikelyDuplicate(
    { amount: 500, account: "HDFC", date: undefined },
    [tx({ id: "t1", amount: 500 })],
  );
  assert.equal(match, null);
});

console.log(`\nALL ${passed} DUPLICATE TRANSACTION TESTS PASSED`);
