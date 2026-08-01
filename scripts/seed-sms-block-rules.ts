/**
 * Seed Supabase `sms_block_rules` with default OTP / promo / spam blockers.
 *
 * Source: scripts/data/default_sms_block_rules.json
 *
 * Usage:
 *   npx tsx scripts/seed-sms-block-rules.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 * Idempotent (deterministic UUID per rule key).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(__dirname, "..");
const DEFAULT_JSON = resolve(ROOT, "scripts/data/default_sms_block_rules.json");

function ruleUuid(key: string): string {
  const ns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const hash = createHash("sha1")
    .update(Buffer.from(ns.replace(/-/g, ""), "hex"))
    .update(`spentx:sms-block:${key}`)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
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

type CatalogRule = {
  key: string;
  name: string;
  keywords: string[];
  pattern?: string;
  sampleMessage?: string;
  similarityThreshold?: number;
};

type Catalog = {
  rules: CatalogRule[];
};

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

  const catalog = JSON.parse(readFileSync(jsonPath, "utf8")) as Catalog;
  const now = new Date().toISOString();

  const rows = (catalog.rules ?? []).map((rule) => ({
    id: ruleUuid(rule.key),
    name: rule.name,
    keywords: rule.keywords ?? [],
    pattern: rule.pattern || null,
    sample_message: rule.sampleMessage || "",
    similarity_threshold: rule.similarityThreshold ?? 0.55,
    is_active: true,
    updated_at: now,
  }));

  console.log(`Seeding ${rows.length} block rules from ${jsonPath}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let { error } = await supabase.from("sms_block_rules").upsert(rows, {
    onConflict: "id",
  });

  // Fallback if sample_message column not migrated yet.
  if (error && /sample_message/i.test(error.message)) {
    const legacy = rows.map(({ sample_message: _s, ...rest }) => rest);
    const retry = await supabase.from("sms_block_rules").upsert(legacy, {
      onConflict: "id",
    });
    error = retry.error;
  }

  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }

  const { count } = await supabase
    .from("sms_block_rules")
    .select("*", { count: "exact", head: true });

  console.log("\nDone.");
  console.log(`  Seeded block rules : ${rows.length}`);
  console.log(`  Table total rows   : ${count ?? "?"}`);
  for (const r of rows) {
    console.log(`  • ${r.name}`);
  }
  console.log(
    "\n  Mobile: open app online → Developer Options → Refresh SMS rules.",
  );
  console.log("  Admin: /admin/sms-rules → Block SMS tab.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
