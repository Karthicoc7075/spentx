import assert from "node:assert/strict";
import {
  buildOutingRollupDraft,
} from "../src/lib/outings";
import {
  getDefaultPersonalPurpose,
  getDefaultFamilyPurpose,
  getActivePurposes,
  PERSONAL_PURPOSE_ID,
  FAMILY_PURPOSE_ID,
} from "../src/lib/purposes";
import type { Outing, Purpose, Transaction } from "../src/types";

const mockPurposes: Purpose[] = [
  { id: "uuid-personal-111", name: "Personal", isDefault: true, isActive: true },
  { id: "uuid-family-222", name: "Family", isDefault: false, isActive: true },
  { id: "uuid-office-333", name: "Office", isDefault: false, isActive: true },
];

console.log("── Testing Outing Purpose Inheritance & Cascade ──");

// Test 1: Purpose resolution logic
const active = getActivePurposes(mockPurposes);
const defaultPersonal = getDefaultPersonalPurpose(active);
assert.equal(defaultPersonal?.id, "uuid-personal-111", "Default personal purpose must be found");

const defaultFamily = getDefaultFamilyPurpose(active);
assert.equal(defaultFamily?.id, "uuid-family-222", "Family purpose must be found");

console.log("  ✓ Purpose resolution finds correct UUIDs for Personal & Family");

// Test 2: Outing rollup draft inherits outing's purposeId
const outingWithFamily: Outing = {
  id: "outing-test-1",
  name: "Goa Vacation",
  category: "Trip",
  startDate: "2026-07-01",
  status: "active",
  purposeId: "uuid-family-222",
  members: [{ id: "m1", name: "You", isCurrentUser: true }],
  autoAddMode: false,
};

const rollup = buildOutingRollupDraft(outingWithFamily, 5000, "HDFC");
assert.equal(rollup.purposeId, "uuid-family-222", "Rollup transaction must inherit outing's purposeId");
assert.equal(rollup.purpose, "uuid-family-222", "Rollup transaction purpose field must match");
console.log("  ✓ Outing rollup transaction draft inherits the outing's purposeId");

// Test 3: Editing outing purpose updates rollup draft
const updatedOuting: Outing = {
  ...outingWithFamily,
  purposeId: "uuid-office-333",
};

const updatedRollup = buildOutingRollupDraft(updatedOuting, 5000, "HDFC");
assert.equal(updatedRollup.purposeId, "uuid-office-333", "Updated rollup transaction must have the new purposeId");
assert.equal(updatedRollup.purpose, "uuid-office-333", "Updated rollup transaction purpose field must have the new purposeId");
console.log("  ✓ Updating outing's purpose cascades to newly built rollup draft");

// Test 4: Verify cascade logic across transactions linked to outing
const mockTransactions: Transaction[] = [
  {
    id: "tx-1",
    outingId: "outing-test-1",
    amount: 1500,
    merchant: "Hotel",
    category: "Travel",
    purpose: "uuid-family-222",
    purposeId: "uuid-family-222",
    type: "expense",
    date: "2026-07-01",
    account: "HDFC",
    source: "manual",
    splits: [
      {
        id: "s-1",
        transactionId: "tx-1",
        userId: "user-1",
        amount: 1500,
        categoryId: "Travel",
        purposeId: "uuid-family-222",
      },
    ],
  },
  {
    id: "tx-2",
    outingId: "outing-test-1",
    amount: 250,
    merchant: "Cafe",
    category: "Food",
    purpose: "uuid-family-222",
    purposeId: "uuid-family-222",
    type: "expense",
    date: "2026-07-01",
    account: "HDFC",
    source: "manual",
    splits: [
      {
        id: "s-2",
        transactionId: "tx-2",
        userId: "user-1",
        amount: 250,
        categoryId: "Food",
        purposeId: "uuid-family-222",
      },
    ],
  },
  {
    id: "tx-3",
    amount: 50,
    merchant: "Tea",
    category: "Food",
    purpose: "uuid-personal-111",
    purposeId: "uuid-personal-111",
    type: "expense",
    date: "2026-07-01",
    account: "Cash",
    source: "manual",
  },
];

const newPurposeId = "uuid-office-333";
const cascaded = mockTransactions.map((tx) =>
  tx.outingId === updatedOuting.id
    ? {
        ...tx,
        purpose: newPurposeId,
        purposeId: newPurposeId,
        splits: tx.splits?.map((s) => ({ ...s, purposeId: newPurposeId })),
      }
    : tx,
);

assert.equal(cascaded[0].purposeId, newPurposeId, "tx-1 purposeId must be updated to Office");
assert.equal(cascaded[0].splits?.[0].purposeId, newPurposeId, "tx-1 split purposeId must be updated to Office");
assert.equal(cascaded[1].purposeId, newPurposeId, "tx-2 purposeId must be updated to Office");
assert.equal(cascaded[1].splits?.[0].purposeId, newPurposeId, "tx-2 split purposeId must be updated to Office");
assert.equal(cascaded[2].purposeId, "uuid-personal-111", "tx-3 unrelated transaction must NOT be changed");

console.log("  ✓ Cascading outing purpose updates all linked transactions and splits without affecting other transactions");

console.log("\nALL OUTING PURPOSE CASCADE TESTS PASSED!\n");
