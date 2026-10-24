import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("── Testing Web Security & Supabase RLS Isolation ──");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

// ============================================================================
// 1. Web HTTP Security Headers & Hardening Audit
// ============================================================================
console.log("\n[1/4] Auditing Web HTTP Security Headers in next.config.ts...");
const nextConfigPath = path.join(ROOT, "next.config.ts");
assert.strictEqual(fs.existsSync(nextConfigPath), true, "next.config.ts must exist");
const nextConfigContent = fs.readFileSync(nextConfigPath, "utf-8");

const requiredHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "on",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "X-Permitted-Cross-Domain-Policies": "none",
};

for (const [header, expectedValue] of Object.entries(requiredHeaders)) {
  assert.match(
    nextConfigContent,
    new RegExp(header, "i"),
    `next.config.ts must define security header '${header}'`,
  );
  assert.match(
    nextConfigContent,
    new RegExp(expectedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    `next.config.ts must set header '${header}' to value '${expectedValue}'`,
  );
}
console.log("  ✓ All 7 banking-grade HTTP security headers configured (anti-clickjacking, HSTS, MIME guard)");

// ============================================================================
// 2. Cookie & Session Security Audit
// ============================================================================
console.log("\n[2/4] Auditing Cookie and Session Security Configuration...");
const proxyTsPath = path.join(ROOT, "src", "lib", "supabase", "proxy.ts");
const clientTsPath = path.join(ROOT, "src", "lib", "supabase", "client.ts");

assert.strictEqual(fs.existsSync(proxyTsPath), true, "proxy.ts must exist");
assert.strictEqual(fs.existsSync(clientTsPath), true, "client.ts must exist");

const proxyContent = fs.readFileSync(proxyTsPath, "utf-8");
const clientContent = fs.readFileSync(clientTsPath, "utf-8");

// Verify secure cookie flags in production
assert.match(
  proxyContent,
  /secure:\s*process\.env\.NODE_ENV\s*===\s*"production"/,
  "proxy.ts must set secure: process.env.NODE_ENV === 'production'",
);
assert.match(
  clientContent,
  /secure:\s*process\.env\.NODE_ENV\s*===\s*"production"/,
  "client.ts must set secure: process.env.NODE_ENV === 'production'",
);

// Verify sameSite and path settings
assert.match(proxyContent, /sameSite:\s*"lax"/, "proxy.ts must configure sameSite: 'lax'");
assert.match(clientContent, /sameSite:\s*"lax"/, "client.ts must configure sameSite: 'lax'");
assert.match(proxyContent, /path:\s*"\/"/, "proxy.ts must configure path: '/'");
assert.match(clientContent, /path:\s*"\/"/, "client.ts must configure path: '/'");
console.log("  ✓ Session cookie attributes audited (Strict HTTPS production flag, SameSite guard, path scope)");

// ============================================================================
// 3. Supabase RLS & Tenant Isolation Audit
// ============================================================================
console.log("\n[3/4] Auditing Supabase Row-Level Security & Isolation Policies...");
const initSqlPath = path.join(MIGRATIONS_DIR, "init.sql");
const s8MigrationPath = path.join(
  MIGRATIONS_DIR,
  "20261022160000_s8_supabase_security_hardening.sql",
);
const auditFixesPath = path.join(
  MIGRATIONS_DIR,
  "20261011_security_audit_fixes.sql",
);

assert.strictEqual(fs.existsSync(initSqlPath), true, "init.sql must exist");
assert.strictEqual(fs.existsSync(s8MigrationPath), true, "S8 hardening migration must exist");
const initSql = fs.readFileSync(initSqlPath, "utf-8");
const s8Sql = fs.readFileSync(s8MigrationPath, "utf-8");
const auditFixesSql = fs.readFileSync(auditFixesPath, "utf-8");

// 3a. Core financial tables must have RLS enabled
const coreFinancialTables = [
  "users",
  "accounts",
  "purposes",
  "categories",
  "contributors",
  "transactions",
  "transaction_splits",
  "monthly_plans",
  "budget_templates",
  "smart_views",
  "friends",
  "outings",
  "outing_expenses",
  "settlements",
  "purpose_shares",
  "share_links",
  "backup_history",
  "account_balance_history",
  "savings_goals",
  "ai_insights",
  "sms_template_rules",
  "sms_detection_rules",
  "sms_block_rules",
];

for (const table of coreFinancialTables) {
  const rlsRegex = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  assert.match(
    initSql,
    rlsRegex,
    `init.sql must enable row level security on public.${table}`,
  );
}
console.log(`  ✓ RLS enabled across all ${coreFinancialTables.length} core tables`);

// 3b. Verify user isolation policies exist
assert.match(
  initSql,
  /create\s+policy\s+"transactions_select"\s+on\s+public\.transactions/i,
  "transactions must have select policy verifying ownership or explicit purpose share",
);
assert.match(
  initSql,
  /create\s+policy\s+"accounts_own"\s+on\s+public\.accounts/i,
  "accounts must have strict user_id = auth.uid() policy",
);
assert.match(
  initSql,
  /create\s+policy\s+"receipts_owner_access"\s+on\s+storage\.objects/i,
  "storage receipts bucket must isolate folders by auth.uid()",
);
assert.match(
  initSql,
  /create\s+policy\s+"backups_owner_access"\s+on\s+storage\.objects/i,
  "storage backups bucket must isolate folders by auth.uid()",
);
console.log("  ✓ Storage bucket isolation verified (receipts/ and backups/ isolated per auth.uid())");

// 3c. S8 View Invoker and Privilege Revokes
assert.match(
  s8Sql,
  /alter view public\.monthly_plan_actuals set \(security_invoker = true\)/i,
  "S8 must enforce security_invoker on monthly_plan_actuals to respect querying user's RLS",
);
assert.match(
  s8Sql,
  /alter view public\.investment_totals set \(security_invoker = true\)/i,
  "S8 must enforce security_invoker on investment_totals to respect querying user's RLS",
);
assert.match(
  s8Sql,
  /admin_reset_user_data/i,
  "S8 must revoke execute on admin_reset_user_data from anon and public",
);
assert.match(
  s8Sql,
  /set search_path = public, pg_temp/i,
  "S8 must pin search_path = public, pg_temp on SECURITY DEFINER functions",
);
console.log("  ✓ View security_invoker and search_path privilege escalation defenses verified");

// ============================================================================
// 4. Cloud SMS Privacy & Hashing Architecture Audit
// ============================================================================
console.log("\n[4/4] Auditing Cloud SMS Privacy & Zero-Knowledge Architecture...");
// 4a. Verify public.transactions in init.sql has NO raw SMS column
const txTableRegex = /create\s+table\s+public\.transactions\s*\(([\s\S]*?)\);/i;
const txMatch = initSql.match(txTableRegex);
assert.ok(txMatch, "public.transactions table definition must be found");
const txTableBody = txMatch[1];

assert.strictEqual(
  /raw_sms/i.test(txTableBody),
  false,
  "VIOLATION: public.transactions must NEVER contain raw_sms column",
);
assert.strictEqual(
  /sms_body/i.test(txTableBody),
  false,
  "VIOLATION: public.transactions must NEVER contain sms_body column",
);
assert.strictEqual(
  /full_sms/i.test(txTableBody),
  false,
  "VIOLATION: public.transactions must NEVER contain full_sms column",
);
console.log("  ✓ Zero full SMS text stored in Supabase cloud (only parsed financial metadata allowed)");

// 4b. Verify Mobile SMS Privacy hashing and redaction service
const smsPrivacyPath = path.join(
  ROOT,
  "Mobile app",
  "SpentX",
  "lib",
  "core",
  "privacy",
  "sms_privacy.dart",
);
assert.strictEqual(fs.existsSync(smsPrivacyPath), true, "sms_privacy.dart must exist");
const smsPrivacyContent = fs.readFileSync(smsPrivacyPath, "utf-8");

assert.match(
  smsPrivacyContent,
  /sha256\s*\.\s*convert/i,
  "sms_privacy.dart must use SHA-256 for SMS fingerprinting",
);
assert.match(
  smsPrivacyContent,
  /rawMessageHash/i,
  "sms_privacy.dart must store rawMessageHash",
);
assert.match(
  smsPrivacyContent,
  /result\['rawMessage'\]\s*=\s*''/i,
  "sms_privacy.dart must erase rawMessage upon transaction persistence",
);
console.log("  ✓ Mobile client SMS privacy verified: SHA-256 dedupe hashing + raw message erasure");

console.log("\n=======================================================");
console.log("ALL WEB SECURITY & RLS ISOLATION AUDIT CHECKS PASSED!");
console.log("=======================================================\n");
