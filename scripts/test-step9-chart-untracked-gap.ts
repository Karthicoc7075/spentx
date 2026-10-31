import { buildSparkline, buildMultiPurposeTrend } from "../src/lib/dashboard";
import type { Account, Transaction, Purpose } from "../src/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log("── Testing Step 9: Charts Untracked Periods Show Gap, Quiet Days Stay Filled ──");

const accounts: Account[] = [
  {
    id: "acc-bank-1",
    name: "HDFC Bank",
    type: "bank",
    openingBalance: 50000,
    openingBalanceDate: "2026-10-10",
    isActive: true,
  },
];

const transactions: Transaction[] = [
  {
    id: "tx-1",
    type: "expense",
    amount: 2000,
    merchant: "Supermarket",
    source: "manual",
    category: "Groceries",
    account: "HDFC Bank",
    accountId: "acc-bank-1",
    purpose: "personal",
    purposeId: "purpose-personal",
    date: "2026-10-12T10:00:00Z",
    transactionDate: "2026-10-12T10:00:00Z",
  },
  {
    id: "tx-2",
    type: "income",
    amount: 10000,
    merchant: "Employer",
    source: "manual",
    category: "Salary",
    account: "HDFC Bank",
    accountId: "acc-bank-1",
    purpose: "personal",
    purposeId: "purpose-personal",
    date: "2026-10-20T10:00:00Z",
    transactionDate: "2026-10-20T10:00:00Z",
  },
];

// 1. buildSparkline
const sparkline = buildSparkline(transactions, "2026-10", "net", accounts);
assert(sparkline.length >= 20, "Sparkline produces daily points for the month");

// Days 1..9 are before openingBalanceDate (2026-10-10) -> must be null (never 0)
for (let day = 1; day <= 9; day++) {
  assert(
    sparkline[day - 1] === null,
    `Untracked day Oct ${day} is null (gap, not 0)`,
  );
}

// Day 10 is the opening date -> starting balance 50,000
assert(sparkline[9] === 50000, "Tracked start day Oct 10 has opening balance 50,000");

// Day 11 is a quiet day with no transactions -> carried forward balance 50,000 (stays filled)
assert(sparkline[10] === 50000, "Tracked quiet day Oct 11 stays filled with carried forward balance 50,000");

// Day 12 had 2,000 expense -> 48,000
assert(sparkline[11] === 48000, "Tracked day Oct 12 reflects transaction: 48,000");

// Day 13..19 are quiet days -> all stay filled with 48,000
for (let day = 13; day <= 19; day++) {
  assert(
    sparkline[day - 1] === 48000,
    `Tracked quiet day Oct ${day} stays filled with 48,000`,
  );
}

// 2. buildMultiPurposeTrend
const purposes: Purpose[] = [
  { id: "purpose-personal", name: "Personal", color: "#10b981", isDefault: true, isActive: true },
];

const trend = buildMultiPurposeTrend(
  transactions,
  purposes,
  { dateFrom: "2026-10-05", dateTo: "2026-10-15" },
  "purpose-personal",
  { accounts },
);

assert(trend.data.length === 11, "Multi-purpose trend produces 11 days");

// Oct 5 to Oct 9 are strictly before Oct 10 -> purpose-personal income & expense must be null
for (let i = 0; i < 5; i++) {
  const row = trend.data[i];
  assert(
    row["purpose-personal-income"] === null,
    `Untracked row index ${i} (${row.day}) has null income`,
  );
  assert(
    row["purpose-personal-expense"] === null,
    `Untracked row index ${i} (${row.day}) has null expense`,
  );
}

// Oct 10 onwards are tracked -> income & expense are numbers (0 or actual)
const trackedQuietRow = trend.data[5]; // Oct 10
assert(
  typeof trackedQuietRow["purpose-personal-income"] === "number",
  "Tracked quiet day has numeric income (0, not null)",
);
assert(
  typeof trackedQuietRow["purpose-personal-expense"] === "number",
  "Tracked quiet day has numeric expense (0, not null)",
);

console.log("\nALL STEP 9 UNTRACKED GAP & QUIET DAYS CHECKS PASSED!");
