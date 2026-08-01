/**
 * Seed Supabase `sms_template_rules` from mobile catalog:
 *   Mobile app/SpentX/assets/bank_sms_templates_v4_full.json
 *
 * Usage (from repo root):
 *   npx tsx scripts/seed-bank-sms-templates.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 * (service role bypasses admin RLS for bulk seed).
 *
 * Idempotent: deterministic UUID per template `id` → safe to re-run (upsert).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(__dirname, "..");
const DEFAULT_JSON = resolve(
  ROOT,
  "Mobile app/SpentX/assets/bank_sms_templates_v4_full.json",
);

/** UUID v5-style deterministic id from template string id (namespace SpentX SMS). */
function templateUuid(templateId: string): string {
  // Stable UUID derived from SHA-1 of namespace + name (uuid v5 shape).
  const ns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS namespace
  const hash = createHash("sha1")
    .update(Buffer.from(ns.replace(/-/g, ""), "hex"))
    .update(`spentx:sms-tpl:${templateId}`)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8]! & 0x3f) | 0x80; // variant
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const TAG_TO_TOKEN: Record<string, string> = {
  Amount: "{AMOUNT}",
  AccountLast4: "{ACCOUNTLAST4}",
  Title: "{TITLE}",
  Payee: "{TITLE}",
  Date: "{DATE}",
  ReferenceId: "{REFERENCEID}",
  Balance: "{BALANCE}",
  UPI: "{UPIID}",
  UPIID: "{UPIID}",
  CardLast4: "{ACCOUNTLAST4}",
  Time: "{TIME}",
};

const TAG_TO_FIELD: Record<string, string> = {
  Amount: "amount",
  AccountLast4: "accountLast4",
  Title: "title",
  Payee: "title",
  Date: "date",
  ReferenceId: "referenceId",
  Balance: "balance",
  UPI: "upiId",
  UPIID: "upiId",
  CardLast4: "accountLast4",
  Time: "time",
};

function mapType(raw: string, subtype: string, sample: string): "debit" | "credit" | "transfer" {
  const t = (raw || "").toLowerCase();
  const sub = (subtype || "").toLowerCase();
  const text = sample.toLowerCase();
  if (sub === "salary" || t === "credit" || text.includes("credited")) {
    if (sub === "atm" || sub === "neft" && t === "transfer") {
      /* fall through */
    } else if (t === "credit" || sub === "salary") {
      return "credit";
    }
  }
  if (t === "credit") return "credit";
  if (t === "transfer" || sub === "atm") return "transfer";
  return "debit";
}

function mapMode(subtype: string): string {
  const s = (subtype || "").toLowerCase();
  if (s === "upi") return "upi";
  if (s === "atm") return "atm";
  if (s === "card" || s === "creditcard") return "card";
  if (s === "neft" || s === "imps" || s === "rtgs") return "neft";
  if (s === "salary") return "salary";
  if (s === "emi") return "emi";
  if (s === "bankcharges") return "bank_charge";
  return s || "unknown";
}

function toTemplatePattern(template: string): string {
  let out = template || "";
  for (const [tag, token] of Object.entries(TAG_TO_TOKEN)) {
    out = out.split(`[${tag}]`).join(token);
  }
  return out;
}

function extractionMapFromTags(tags: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tag of tags) {
    const field = TAG_TO_FIELD[tag];
    if (field) map[tag] = field;
  }
  return map;
}

function keywordsFrom(bank: string, subtype: string, sample: string, description: string): string[] {
  const set = new Set<string>();
  const bankLower = bank.toLowerCase();
  if (bankLower) set.add(bankLower);
  const sub = subtype.toLowerCase();
  if (sub) set.add(sub);
  const blob = `${sample} ${description}`.toLowerCase();
  for (const kw of [
    "upi",
    "debited",
    "credited",
    "withdrawn",
    "neft",
    "imps",
    "atm",
    "a/c",
    "rs.",
    "inr",
    "sent",
    "received",
    "emi",
    "salary",
  ]) {
    if (blob.includes(kw)) set.add(kw.replace(".", ""));
  }
  return [...set].slice(0, 12);
}

type FullRoot = {
  banks: Array<{
    bank: string;
    status?: string;
    templates: Array<{
      id: string;
      type?: string;
      subtype?: string;
      description?: string;
      template?: string;
      tags?: string[];
      sampleMessage?: string;
    }>;
  }>;
};

type DbRow = {
  id: string;
  bank_name: string;
  type: string;
  mode: string;
  template_pattern: string;
  extraction_map: Record<string, string>;
  keywords: string[];
  sample_message: string;
  similarity_threshold: number;
  is_active: boolean;
  updated_at: string;
};

function convertFullCatalog(root: FullRoot): DbRow[] {
  const rows: DbRow[] = [];
  const now = new Date().toISOString();

  for (const bank of root.banks ?? []) {
    const bankName = bank.bank || "Unknown";
    for (const tpl of bank.templates ?? []) {
      const sample = (tpl.sampleMessage || "").trim();
      const template = (tpl.template || "").trim();
      if (!sample || !template) continue;

      const pattern = toTemplatePattern(template);
      if (!pattern) continue;

      const type = mapType(tpl.type || "Debit", tpl.subtype || "", sample);
      const mode = mapMode(tpl.subtype || "");
      const tags = tpl.tags || [];
      const keywords = keywordsFrom(
        bankName,
        tpl.subtype || "",
        sample,
        tpl.description || "",
      );

      rows.push({
        id: templateUuid(tpl.id || `${bankName}_${pattern.slice(0, 40)}`),
        bank_name: bankName,
        type,
        mode,
        template_pattern: pattern,
        extraction_map: extractionMapFromTags(tags),
        keywords,
        sample_message: sample,
        similarity_threshold: 0.65,
        is_active: true,
        updated_at: now,
      });
    }
  }
  return rows;
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const jsonPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : DEFAULT_JSON;
  if (!existsSync(jsonPath)) {
    console.error("JSON not found:", jsonPath);
    process.exit(1);
  }

  console.log("Loading", jsonPath);
  const root = JSON.parse(readFileSync(jsonPath, "utf8")) as FullRoot;
  const rows = convertFullCatalog(root);
  console.log(`Converted ${rows.length} templates from ${root.banks?.length ?? 0} banks`);

  if (rows.length === 0) {
    console.error("No rows to insert");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ensure sample_message column exists (migration may not be applied yet).
  // Upsert in chunks of 50.
  const chunkSize = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // Try full row first; fall back without optional columns if schema lag.
    let { error } = await supabase.from("sms_template_rules").upsert(chunk, {
      onConflict: "id",
    });
    if (error && /sample_message|similarity_threshold/i.test(error.message)) {
      const legacy = chunk.map(
        ({ sample_message: _s, similarity_threshold: _t, ...rest }) => rest,
      );
      const retry = await supabase.from("sms_template_rules").upsert(legacy, {
        onConflict: "id",
      });
      error = retry.error;
    }
    if (error) {
      console.error(`Chunk ${i / chunkSize + 1} failed:`, error.message);
      process.exit(1);
    }
    upserted += chunk.length;
    console.log(`  upserted ${upserted}/${rows.length}`);
  }

  const { count, error: countError } = await supabase
    .from("sms_template_rules")
    .select("*", { count: "exact", head: true });

  console.log("\nDone.");
  console.log(`  Seeded this run : ${upserted}`);
  console.log(
    `  Table total rows: ${countError ? "(could not count)" : count}`,
  );
  console.log(
    "  Mobile: open app online → Developer Options → Refresh SMS rules (or wait for daily pull).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
