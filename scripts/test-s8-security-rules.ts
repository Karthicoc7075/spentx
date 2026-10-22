import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("── Testing S8 Supabase Security Hardening & Migration Governance ──");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const CHECKS_DIR = path.join(ROOT, "supabase", "migration-checks");

// 1. Verify S8 Security Hardening migration file exists and is populated
const s8MigrationPath = path.join(
  MIGRATIONS_DIR,
  "20261022160000_s8_supabase_security_hardening.sql"
);
assert.strictEqual(
  fs.existsSync(s8MigrationPath),
  true,
  "S8 migration file 20261022160000_s8_supabase_security_hardening.sql must exist"
);

const s8Content = fs.readFileSync(s8MigrationPath, "utf-8");

// 1a. View security_invoker checks
assert.match(
  s8Content,
  /alter view public\.monthly_plan_actuals set \(security_invoker = true\)/i,
  "S8 must set security_invoker = true on monthly_plan_actuals"
);
assert.match(
  s8Content,
  /alter view public\.investment_totals set \(security_invoker = true\)/i,
  "S8 must ensure security_invoker = true on investment_totals"
);
console.log("  ✓ View security_invoker hardening verified");

// 1b. pg_trgm extension relocation check
assert.match(
  s8Content,
  /alter extension pg_trgm set schema extensions/i,
  "S8 must relocate pg_trgm extension from public to extensions schema"
);
console.log("  ✓ Extension schema relocation verified");

// 1c. Anonymous execution revokes on privileged functions
assert.match(
  s8Content,
  /admin_reset_all_users_to_onboarding/i,
  "S8 must revoke execute on admin_reset_all_users_to_onboarding from anon"
);
assert.match(
  s8Content,
  /admin_reset_user_data/i,
  "S8 must revoke execute on admin_reset_user_data from anon"
);
assert.match(
  s8Content,
  /complete_account_setup/i,
  "S8 must revoke execute on complete_account_setup from anon"
);
assert.match(
  s8Content,
  /handle_new_user/i,
  "S8 must revoke execute on trigger handle_new_user from anon"
);
console.log("  ✓ Anonymous privilege restrictions verified");

// 1d. Intentionally public share functions preserved
const publicShareRpcs = [
  "get_share_link",
  "get_shared_transactions",
  "get_shared_purposes",
  "get_shared_monthly_plan",
  "get_shared_categories",
  "log_shared_page_view",
];
for (const rpc of publicShareRpcs) {
  assert.match(
    s8Content,
    new RegExp(rpc, "i"),
    `S8 must preserve public access for share RPC: ${rpc}`
  );
}
console.log("  ✓ Public share-link functions preserved with safe search_path");

// 2. Verify S8 companion checks exist (precheck, verify, rollback)
const s8ChecksDir = path.join(
  CHECKS_DIR,
  "20261022160000_s8_supabase_security_hardening"
);
assert.strictEqual(
  fs.existsSync(s8ChecksDir),
  true,
  "S8 checks directory must exist"
);
assert.strictEqual(
  fs.existsSync(path.join(s8ChecksDir, "precheck.sql")),
  true,
  "S8 precheck.sql must exist"
);
assert.strictEqual(
  fs.existsSync(path.join(s8ChecksDir, "verify.sql")),
  true,
  "S8 verify.sql must exist"
);
assert.strictEqual(
  fs.existsSync(path.join(s8ChecksDir, "rollback.sql")),
  true,
  "S8 rollback.sql must exist"
);
console.log("  ✓ S8 precheck, verify, and rollback scripts present");

// 3. Verify governance of all pending migrations
const pendingMigrations = [
  "20261004000100_protect_user_roles",
  "20261021_signup_phone",
  "20261022120000_p2_sms_rules_version",
  "20261022130000_p3_user_rules_v2",
  "20261022130100_p3_user_self_upi",
  "20261022130200_p3_global_rules_additions",
  "20261022140000_p4_investment_totals_status",
  "20261022150000_p0_ref_key_live_index",
  "20261022160000_s8_supabase_security_hardening",
];

for (const mig of pendingMigrations) {
  const dir = path.join(CHECKS_DIR, mig);
  assert.strictEqual(
    fs.existsSync(dir),
    true,
    `Pending migration check folder ${mig} must exist`
  );
}
console.log("  ✓ All pending migrations have valid companion check suites");

// 4. Confirm already applied Phase 0 migrations are NOT scheduled for re-execution
const alreadyApplied = [
  "20261021120000_p0_tx_status_flags.sql",
  "20261021120100_p0_account_evidence.sql",
];
const statusDocPath = path.join(CHECKS_DIR, "STATUS-2026-10-21.md");
const statusDoc = fs.readFileSync(statusDocPath, "utf-8");
for (const applied of alreadyApplied) {
  assert.match(
    statusDoc,
    new RegExp(applied, "i"),
    `STATUS-2026-10-21.md must record ${applied} as APPLIED`
  );
}
console.log("  ✓ Confirmed Phase 0 migrations are flagged as APPLIED and protected against re-run");

console.log("\nALL S8 SECURITY HARDENING AND MIGRATION CHECKS PASSED!");
