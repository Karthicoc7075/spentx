/** Regression tests for friend repayment accounting on the web ledger. */
import assert from "node:assert/strict";
import {
  computePeriodTotals,
  sumPeriodExpense,
  sumPeriodGrossExpense,
  sumPeriodIncome,
  sumPeriodReturns,
} from "../src/lib/period-totals";
import type { Transaction } from "../src/types";

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "type" | "category">,
): Transaction {
  const amount = partial.totalAmount ?? partial.amount ?? 0;
  return {
    id: crypto.randomUUID(),
    merchant: "Test",
    source: "manual",
    transactionDate: "2026-09-10",
    date: "2026-09-10",
    totalAmount: amount,
    amount,
    ...partial,
  } as Transaction;
}

const bill = tx({
  type: "expense",
  category: "Food & Dining",
  amount: 1000,
});
const salary = tx({
  type: "income",
  category: "Salary",
  amount: 5000,
});
const repayment = tx({
  type: "income",
  category: "Friend Returns",
  amount: 500,
  tags: ["settlement", "settlement:receive", "reimbursement"],
});
const repaymentToFriend = tx({
  type: "expense",
  category: "Settlements",
  amount: 250,
  tags: ["settlement", "settlement:send"],
});

assert.equal(sumPeriodIncome([bill, salary, repayment]), 5000);
assert.equal(sumPeriodReturns([bill, salary, repayment]), 500);
assert.equal(sumPeriodGrossExpense([bill, salary, repayment]), 1000);
assert.equal(sumPeriodExpense([bill, salary, repayment]), 500);
assert.equal(sumPeriodGrossExpense([bill, repaymentToFriend]), 1000);

assert.deepEqual(computePeriodTotals([bill, salary, repayment]), {
  income: 5000,
  grossExpense: 1000,
  reimbursements: 500,
  expense: 500,
  net: 4500,
});

console.log("✓ transaction repayment accounting passed");
