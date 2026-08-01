import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = createClient(url, anonKey);

const { data: signInData } = await client.auth.signInWithPassword({
  email: "ui-verify-test@example.test",
  password: "VerifyTest123!",
});
const userId = signInData!.user!.id;

const { data: account } = await client.from("accounts").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle();
const { data: purpose } = await client.from("purposes").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle();

// Create an "Investment" category expense transaction (₹5000)
const { data: txnId, error: err1 } = await client.rpc("create_transaction_with_splits", {
  p_transaction: {
    accountId: account!.id, merchant: "Gold ETF Purchase", totalAmount: 5000, type: "expense",
    transactionDate: new Date().toISOString(), monthKey: new Date().toISOString().slice(0,7),
  },
  p_splits: [{ purposeId: purpose!.id, categoryId: "Investment", amount: 5000 }],
});
if (err1) throw err1;
console.log("Created investment-category transaction:", txnId);

// Query the view directly
const { data: viewRow } = await client.from("investment_totals").select("*").eq("user_id", userId).maybeSingle();
console.log("investment_totals view row:", JSON.stringify(viewRow));

// Test client-side helper too, using real fetched categories + transaction
const { data: categories } = await client.from("categories").select("*").eq("user_id", userId);
const { data: gs } = await client.from("global_settings").select("default_categories").eq("id","app").maybeSingle();
const mappedCategories = (gs!.default_categories as any[]).map((c) => ({
  id: c.id, name: c.name, type: c.type, color: c.color, isInvestment: c.isInvestment ?? false,
})).concat((categories ?? []).map((c: any) => ({ id: c.id, name: c.name, type: c.type, color: c.color, isInvestment: c.is_investment ?? false })));

const { isInvestmentTransaction } = await import("../src/lib/investments");
const mockTransaction = { category: "Investment", type: "expense", amount: 5000 } as any;
console.log("isInvestmentTransaction (categories-aware):", isInvestmentTransaction(mockTransaction, mappedCategories as any));

// cleanup
await client.from("transactions").delete().eq("id", txnId);
console.log("Cleaned up test transaction.");
