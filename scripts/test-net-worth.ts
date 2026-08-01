/**
 * Automated net-worth / balance tests (web formula).
 * Run: npx tsx scripts/test-net-worth.ts
 */
import assert from "node:assert/strict";
import {
  computeNetWorthBreakdown,
  getAccountBalance,
  isBalanceExcludedTransaction,
  transactionAmount,
} from "../src/lib/wealth";
import {
  computeOutingRollupAmount,
  isIndividualOutingLedgerTransaction,
  isOutingRollupTransaction,
  OUTING_ROLLUP_TAG,
} from "../src/lib/outings";
import { isSpendingExpense, isTransferTransaction } from "../src/lib/investments";
import { sumVisibleSpending } from "../src/lib/transaction-summary";
import type { Account, OutingExpense, Transaction } from "../src/types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "type" | "merchant" | "category" | "source">): Transaction {
  return {
    amount: 0,
    totalAmount: partial.totalAmount ?? partial.amount ?? 0,
    account: "Cash",
    ...partial,
  } as Transaction;
}

function account(partial: Partial<Account> & Pick<Account, "id" | "name" | "type">): Account {
  return {
    openingBalance: 0,
    ...partial,
  } as Account;
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log("── Net worth core ──");

check("opening balance seed not double-counted", () => {
  const cash = account({
    id: "a1",
    name: "Cash",
    type: "cash",
    openingBalance: 1000,
  });
  const txs = [
    tx({
      type: "income",
      merchant: "Cash",
      category: "Opening Balance",
      amount: 1000,
      totalAmount: 1000,
      account: "Cash",
      source: "manual",
    }),
    tx({
      type: "expense",
      merchant: "Tea",
      category: "Food & Dining",
      amount: 50,
      totalAmount: 50,
      account: "Cash",
      source: "manual",
    }),
  ];
  assert.equal(getAccountBalance(cash, txs), 950);
});

check("outing-rollup excluded from balance", () => {
  const cash = account({ id: "a1", name: "Cash", type: "cash", openingBalance: 5000 });
  const rollup = tx({
    type: "expense",
    merchant: "Goa Trip",
    category: "Travel",
    amount: 3000,
    totalAmount: 3000,
    account: "Cash",
    source: "manual",
    outingId: "out-1",
    tags: [OUTING_ROLLUP_TAG],
    note: "Outing total · Goa Trip",
  });
  const bankSpend = tx({
    type: "expense",
    merchant: "Hotel",
    category: "Travel",
    amount: 2000,
    totalAmount: 2000,
    account: "HDFC",
    source: "mobile",
    outingId: "out-1",
  });
  const hdfc = account({ id: "a2", name: "HDFC", type: "bank", openingBalance: 10000 });

  assert.equal(isBalanceExcludedTransaction(rollup), true);
  assert.equal(isOutingRollupTransaction(rollup), true);
  assert.equal(isIndividualOutingLedgerTransaction(bankSpend), true);

  // Cash: 5000 (rollup ignored)
  assert.equal(getAccountBalance(cash, [rollup, bankSpend]), 5000);
  // Bank: 10000 - 2000 hotel
  assert.equal(getAccountBalance(hdfc, [rollup, bankSpend]), 8000);

  const nw = computeNetWorthBreakdown([cash, hdfc], [rollup, bankSpend]);
  assert.equal(nw.total, 5000 + 8000);
});

check("unlinked outing cash reduces cash once (with rollup display)", () => {
  const cash = account({ id: "a1", name: "Cash", type: "cash", openingBalance: 2000 });
  const rollup = tx({
    type: "expense",
    merchant: "Temple",
    category: "Travel",
    amount: 500,
    totalAmount: 500,
    account: "Cash",
    source: "manual",
    outingId: "out-2",
    tags: [OUTING_ROLLUP_TAG],
    note: "Outing total · Temple",
  });
  const expenses: OutingExpense[] = [
    {
      id: "e1",
      outingId: "out-2",
      description: "Prasad",
      amount: 500,
      category: "Food",
      date: "2026-07-01",
      paidByMemberId: "me",
      splitType: "solo",
      splits: [{ memberId: "me", amount: 500 }],
      source: "manual",
    },
  ];
  // Rollup not counted; unlinked 500 deducted once
  assert.equal(getAccountBalance(cash, [rollup], expenses), 1500);
  assert.equal(
    computeNetWorthBreakdown([cash], [rollup], expenses).total,
    1500,
  );
});

check("transfer legs net zero across accounts", () => {
  const cash = account({ id: "c", name: "Cash", type: "cash", openingBalance: 1000 });
  const bank = account({ id: "b", name: "HDFC", type: "bank", openingBalance: 1000 });
  const out = tx({
    type: "expense",
    merchant: "Transfer to HDFC",
    category: "Transfer",
    amount: 400,
    totalAmount: 400,
    account: "Cash",
    source: "manual",
    tags: ["transfer"],
  });
  const inn = tx({
    type: "income",
    merchant: "Transfer from Cash",
    category: "Transfer",
    amount: 400,
    totalAmount: 400,
    account: "HDFC",
    source: "manual",
    tags: ["transfer"],
  });
  assert.equal(getAccountBalance(cash, [out, inn]), 600);
  assert.equal(getAccountBalance(bank, [out, inn]), 1400);
  assert.equal(computeNetWorthBreakdown([cash, bank], [out, inn]).total, 2000);
});

check("rollup amount is sum of all outing expenses", () => {
  const expenses: OutingExpense[] = [
    {
      id: "1",
      outingId: "o",
      description: "A",
      amount: 100,
      category: "Food",
      date: "2026-07-01",
      paidByMemberId: "me",
      splitType: "equally",
      splits: [],
      source: "manual",
    },
    {
      id: "2",
      outingId: "o",
      description: "B",
      amount: 250,
      category: "Food",
      date: "2026-07-01",
      paidByMemberId: "me",
      splitType: "equally",
      splits: [],
      source: "bank-detected",
      linkedTransactionId: "tx-b",
    },
  ];
  assert.equal(computeOutingRollupAmount(expenses), 350);
});

check("rollup amount adds non-linked outing ledger spends", () => {
  const expenses: OutingExpense[] = [
    {
      id: "1",
      outingId: "goa",
      description: "Taxi",
      amount: 800,
      category: "Travel",
      date: "2026-07-01",
      paidByMemberId: "me",
      splitType: "solo",
      splits: [],
      source: "manual",
    },
    {
      id: "2",
      outingId: "goa",
      description: "Food",
      amount: 400,
      category: "Food",
      date: "2026-07-01",
      paidByMemberId: "me",
      splitType: "solo",
      splits: [],
      source: "manual",
    },
  ];
  const hotel = tx({
    id: "hotel-tx",
    type: "expense",
    merchant: "Hotel",
    category: "Travel",
    amount: 3000,
    totalAmount: 3000,
    account: "HDFC",
    source: "mobile",
    outingId: "goa",
  });
  const rollup = tx({
    id: "rollup-tx",
    type: "expense",
    merchant: "Test Goa Trip",
    category: "Travel",
    amount: 1200,
    totalAmount: 1200,
    account: "Cash",
    source: "manual",
    outingId: "goa",
    tags: [OUTING_ROLLUP_TAG],
    note: "Outing total · Test Goa Trip",
  });
  // 800+400 expenses + 3000 hotel (not linked) ; rollup itself ignored
  assert.equal(
    computeOutingRollupAmount(expenses, "me", [hotel, rollup], "goa"),
    4200,
  );
  // Linked hotel already in expenses → no double add
  const linkedHotelExpense: OutingExpense = {
    id: "3",
    outingId: "goa",
    description: "Hotel",
    amount: 3000,
    category: "Travel",
    date: "2026-07-01",
    paidByMemberId: "me",
    splitType: "solo",
    splits: [],
    source: "bank-detected",
    linkedTransactionId: "hotel-tx",
  };
  assert.equal(
    computeOutingRollupAmount(
      [...expenses, linkedHotelExpense],
      "me",
      [hotel, rollup],
      "goa",
    ),
    4200,
  );
});

check("spending expense excludes rollup and transfer", () => {
  const rollup = tx({
    type: "expense",
    merchant: "Trip",
    category: "Travel",
    amount: 99,
    source: "manual",
    outingId: "o-1",
    tags: [OUTING_ROLLUP_TAG],
    note: "Outing total · Trip",
  });
  const transfer = tx({
    type: "expense",
    merchant: "T",
    category: "Settlements",
    amount: 10,
    source: "manual",
  });
  const food = tx({
    type: "expense",
    merchant: "Food",
    category: "Food & Dining",
    amount: 20,
    source: "manual",
  });
  assert.equal(isSpendingExpense(rollup), false);
  assert.equal(isTransferTransaction(transfer), true);
  assert.equal(isSpendingExpense(transfer), false);
  assert.equal(isSpendingExpense(food), true);
});

check("transactionAmount prefers totalAmount", () => {
  assert.equal(
    transactionAmount(
      tx({
        type: "expense",
        merchant: "X",
        category: "Y",
        source: "manual",
        amount: 1,
        totalAmount: 99,
      }),
    ),
    99,
  );
});

check("visible spending includes outing rollup once", () => {
  const rollup = tx({
    type: "expense",
    merchant: "Goa",
    category: "Travel",
    amount: 4200,
    totalAmount: 4200,
    source: "manual",
    outingId: "goa",
    tags: [OUTING_ROLLUP_TAG],
    note: "Outing total · Goa",
  });
  const food = tx({
    type: "expense",
    merchant: "Tea",
    category: "Food & Dining",
    amount: 50,
    totalAmount: 50,
    source: "manual",
  });
  const hiddenHotel = tx({
    type: "expense",
    merchant: "Hotel",
    category: "Travel",
    amount: 3000,
    totalAmount: 3000,
    source: "mobile",
    outingId: "goa",
  });
  // List view: rollup + tea (hotel hidden). If hotel still present, still 4250.
  assert.equal(sumVisibleSpending([rollup, food]), 4250);
  assert.equal(sumVisibleSpending([rollup, food, hiddenHotel]), 4250);
  // Analytics path: rollup not spending, hotel is
  assert.equal(isSpendingExpense(rollup), false);
  assert.equal(isSpendingExpense(hiddenHotel), true);
});

console.log(`\nALL ${passed} NET-WORTH TESTS PASSED`);
