import assert from "node:assert";
import { catalogDefaults, defaultToCategory, mergeDefaultAndCustom } from "../src/lib/category-catalog";
const rows = [
  { slug: "food_dining", app_category: "Food & Dining", txn_type: "expense", sort_order: 0, icon: "restaurant", color_hex: "#FF7043" },
  { slug: "taxes_govt", app_category: "Bills & EMI", txn_type: "expense", sort_order: 15 },
  { slug: "bills_emi", app_category: "Bills & EMI", txn_type: "expense", sort_order: 10 },
  { slug: "fitness", app_category: "Fitness", txn_type: "expense", sort_order: 14 },
  { slug: "ott", app_category: "Entertainment", txn_type: "expense", parent_slug: "entertainment" },
  { slug: "transfer", app_category: null, txn_type: "transfer" },
  { slug: "income", app_category: "Other Income", txn_type: "income", sort_order: 199 },
  { slug: "salary", app_category: "Salary", txn_type: "income", parent_slug: "income", sort_order: 99 },
];
const d = catalogDefaults(rows, (i) => i === "Utensils");
assert.deepStrictEqual(d.map((c) => c.name), ["Food & Dining", "Bills & EMI", "Fitness", "Salary", "Other Income"]);
assert.strictEqual(d[0].icon, "");
const defs = d.map(defaultToCategory);
const m = mergeDefaultAndCustom(defs, [
  { id: "u1", name: "fitness", type: "expense", color: "#000000", isActive: false },
  { id: "u2", name: "Food & Dining", type: "expense", color: "#111111", isActive: true },
  { id: "u3", name: "Pets", type: "expense", color: "#222222", isActive: true },
]);
assert.deepStrictEqual(m.filter((c) => c.isActive !== false).map((c) => c.name), ["Bills & EMI", "Salary", "Other Income", "Food & Dining", "Pets"]);
assert.strictEqual(m.find((c) => c.name === "Food & Dining")!.color, "#111111");
console.log("category-catalog web OK");
