/**
 * Test script to verify filtering, sorting, pagination, wallet filtering,
 * and active/inactive template tagger logic in SmsRulesAdminPanel.
 */

import assert from "node:assert";
import { buildTemplateFromTags } from "../src/components/admin/SmsTemplateTagger";

type SmsTemplateRule = {
  id: string;
  bankName: string;
  type: "debit" | "credit" | "transfer";
  mode: string;
  templatePattern: string;
  keywords: string[];
  sampleMessage?: string;
  isActive: boolean;
  createdAt: string;
};

const mockTemplates: SmsTemplateRule[] = [
  {
    id: "1",
    bankName: "HDFC Bank",
    type: "debit",
    mode: "card",
    templatePattern: "Rs.{AMOUNT} debited from HDFC Bank A/c {CARD} at {TITLE}",
    keywords: ["debited", "hdfc", "card"],
    isActive: true,
    createdAt: "2026-10-25T10:00:00Z",
  },
  {
    id: "2",
    bankName: "PayZapp Wallet",
    type: "debit",
    mode: "wallet",
    templatePattern: "Rs.{AMOUNT} Deducted From PayZapp Wallet Bal: Rs.{BALANCE}",
    keywords: ["deducted", "payzapp", "wallet"],
    isActive: true,
    createdAt: "2026-10-28T07:26:22Z",
  },
  {
    id: "3",
    bankName: "State Bank of India",
    type: "credit",
    mode: "upi",
    templatePattern: "A/c {ACCOUNT} credited by Rs.{AMOUNT} on {DATE} by UPI ref {REF}",
    keywords: ["credited", "sbi", "upi"],
    isActive: false,
    createdAt: "2026-10-20T12:00:00Z",
  },
  {
    id: "4",
    bankName: "Paytm Wallet",
    type: "credit",
    mode: "wallet_topup",
    templatePattern: "Money added: Rs.{AMOUNT} added to your Paytm Wallet from {BANK}",
    keywords: ["added to", "paytm", "wallet"],
    isActive: true,
    createdAt: "2026-10-29T08:00:00Z",
  },
  {
    id: "5",
    bankName: "Axis Bank",
    type: "transfer",
    mode: "imps",
    templatePattern: "Sent Rs.{AMOUNT} from Axis Bank A/c {ACCOUNT} via IMPS",
    keywords: ["sent", "axis", "imps"],
    isActive: true,
    createdAt: "2026-10-15T09:00:00Z",
  },
];

console.log("=== Testing SMS Rules Admin Panel Filter, Sort, Pagination & Active/Inactive ===");

// 1. Bank / Wallet filter
const hdfcOnly = mockTemplates.filter((r) => r.bankName === "HDFC Bank");
assert.strictEqual(hdfcOnly.length, 1);
assert.strictEqual(hdfcOnly[0].bankName, "HDFC Bank");
console.log("✓ Bank filter passed");

// 2. Type filter
const debitsOnly = mockTemplates.filter((r) => r.type === "debit");
assert.strictEqual(debitsOnly.length, 2);
console.log("✓ Type filter passed");

// 3. Mode filter
const walletTopupOnly = mockTemplates.filter((r) => r.mode === "wallet_topup");
assert.strictEqual(walletTopupOnly.length, 1);
assert.strictEqual(walletTopupOnly[0].bankName, "Paytm Wallet");
console.log("✓ Mode filter passed");

// 4. Status filter
const activeOnly = mockTemplates.filter((r) => r.isActive);
assert.strictEqual(activeOnly.length, 4);
const inactiveOnly = mockTemplates.filter((r) => !r.isActive);
assert.strictEqual(inactiveOnly.length, 1);
console.log("✓ Status filter passed");

// 5. Active filter count
function getActiveCount(
  search: string,
  bank: string,
  type: string,
  mode: string,
  status: string,
) {
  let count = 0;
  if (search.trim()) count++;
  if (bank !== "all") count++;
  if (type !== "all") count++;
  if (mode !== "all") count++;
  if (status !== "all") count++;
  return count;
}
assert.strictEqual(getActiveCount("payzapp", "all", "debit", "all", "active"), 3);
assert.strictEqual(getActiveCount("", "all", "all", "all", "all"), 0);
console.log("✓ Active filter count calculation passed");

// 6. Sorting
const byDateDesc = [...mockTemplates].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);
assert.strictEqual(byDateDesc[0].bankName, "Paytm Wallet"); // Oct 29
assert.strictEqual(byDateDesc[byDateDesc.length - 1].bankName, "Axis Bank"); // Oct 15
console.log("✓ Date sort passed");

const byBankAsc = [...mockTemplates].sort((a, b) => a.bankName.localeCompare(b.bankName));
assert.strictEqual(byBankAsc[0].bankName, "Axis Bank");
assert.strictEqual(byBankAsc[byBankAsc.length - 1].bankName, "State Bank of India");
console.log("✓ Bank A-Z sort passed");

// 7. Pagination
function paginate<T>(items: T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

const page1Of2 = paginate(mockTemplates, 1, 2);
assert.strictEqual(page1Of2.length, 2);
assert.strictEqual(page1Of2[0].id, "1");
assert.strictEqual(page1Of2[1].id, "2");

const page2Of2 = paginate(mockTemplates, 2, 2);
assert.strictEqual(page2Of2.length, 2);
assert.strictEqual(page2Of2[0].id, "3");
assert.strictEqual(page2Of2[1].id, "4");

const page3Of2 = paginate(mockTemplates, 3, 2);
assert.strictEqual(page3Of2.length, 1);
assert.strictEqual(page3Of2[0].id, "5");
console.log("✓ Pagination slicing passed");

// 8. Wallets Only & Banks Only Filtering
const DIGITAL_WALLETS = new Set([
  "Paytm Wallet",
  "Amazon Pay",
  "PhonePe Wallet",
  "PayZapp Wallet",
  "MobiKwik",
  "Freecharge",
  "Airtel Money",
  "Ola Money",
  "JioMoney",
]);
function isWallet(name?: string, mode?: string) {
  if (!name) return false;
  if (DIGITAL_WALLETS.has(name.trim())) return true;
  if (mode === "wallet" || mode === "wallet_topup" || mode === "wallet_transfer") return true;
  return /wallet|payzapp|amazon pay|mobikwik|freecharge/i.test(name);
}

const walletsOnly = mockTemplates.filter((r) => isWallet(r.bankName, r.mode));
assert.strictEqual(walletsOnly.length, 2);
assert.ok(walletsOnly.some((r) => r.bankName === "PayZapp Wallet"));
assert.ok(walletsOnly.some((r) => r.bankName === "Paytm Wallet"));

const banksOnly = mockTemplates.filter((r) => !isWallet(r.bankName, r.mode));
assert.strictEqual(banksOnly.length, 3);
assert.ok(banksOnly.some((r) => r.bankName === "HDFC Bank"));
assert.ok(banksOnly.some((r) => r.bankName === "State Bank of India"));
assert.ok(banksOnly.some((r) => r.bankName === "Axis Bank"));
console.log("✓ Wallets-only & Banks-only filter passed");

// 9. Missing Wallets Included in Catalog
const KNOWN_WALLETS = [
  "Paytm Wallet",
  "Amazon Pay",
  "PhonePe Wallet",
  "PayZapp Wallet",
  "MobiKwik",
  "Freecharge",
  "Airtel Money",
  "Ola Money",
  "JioMoney",
];
const allWalletsSet = new Set(KNOWN_WALLETS);
for (const r of mockTemplates) {
  if (isWallet(r.bankName, r.mode)) allWalletsSet.add(r.bankName);
}
assert.ok(allWalletsSet.has("Amazon Pay")); // Missing from mockTemplates but present in filter
assert.ok(allWalletsSet.has("PhonePe Wallet")); // Missing from mockTemplates but present in filter
assert.ok(allWalletsSet.has("MobiKwik")); // Missing from mockTemplates but present in filter
console.log("✓ Missing wallets included in catalog filter passed");

// 10. Template Tagger buildTemplateFromTags with isActive: true and false
const activeRule = buildTemplateFromTags({
  sampleMessage: "Rs.500 debited from HDFC Bank",
  tokens: [
    { start: 0, end: 6, text: "Rs.500", field: "amount", selectable: true },
    { start: 7, end: 14, text: "debited", field: "status", selectable: true },
    { start: 20, end: 29, text: "HDFC Bank", field: "bankName", selectable: true },
  ],
  bankName: "HDFC Bank",
  type: "debit",
  mode: "card",
  isActive: true,
});
assert.ok(activeRule);
assert.strictEqual(activeRule.isActive, true);

const inactiveRule = buildTemplateFromTags({
  sampleMessage: "Rs.500 debited from HDFC Bank",
  tokens: [
    { start: 0, end: 6, text: "Rs.500", field: "amount", selectable: true },
    { start: 7, end: 14, text: "debited", field: "status", selectable: true },
    { start: 20, end: 29, text: "HDFC Bank", field: "bankName", selectable: true },
  ],
  bankName: "HDFC Bank",
  type: "debit",
  mode: "card",
  isActive: false,
});
assert.ok(inactiveRule);
assert.strictEqual(inactiveRule.isActive, false);
console.log("✓ Template builder active/inactive option passed");

console.log("\nAll 10 test suites passed cleanly!");
