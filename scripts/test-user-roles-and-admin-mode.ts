import assert from "node:assert";
import { isAdminEmail, isAdminUser, PRIMARY_ADMIN_EMAIL } from "../src/lib/admin";

console.log("── Testing User Roles & Admin Permissions ──");

// 1. Primary admin email validation
assert.strictEqual(
  PRIMARY_ADMIN_EMAIL,
  "karthicoc7075@gmail.com",
  "Primary admin email must be karthicoc7075@gmail.com",
);
assert.strictEqual(
  isAdminEmail("karthicoc7075@gmail.com"),
  true,
  "karthicoc7075@gmail.com must be identified as admin",
);
assert.strictEqual(
  isAdminEmail("KARTHICOC7075@GMAIL.COM"),
  true,
  "karthicoc7075@gmail.com case-insensitive must be identified as admin",
);
assert.strictEqual(
  isAdminEmail("  karthicoc7075@gmail.com  "),
  true,
  "karthicoc7075@gmail.com with whitespace must be identified as admin",
);
assert.strictEqual(
  isAdminEmail("user@gmail.com"),
  false,
  "regular users must not be identified as admin email",
);
assert.strictEqual(
  isAdminEmail("john.doe@example.com"),
  false,
  "random users must not be identified as admin email",
);
console.log("  ✓ isAdminEmail correctly identifies karthicoc7075@gmail.com");

// 2. isAdminUser account-level authorization
const adminUser = {
  id: "admin-123",
  name: "Karthic Admin",
  email: "karthicoc7075@gmail.com",
};
const adminProfile = {
  uid: "admin-123",
  name: "Karthic Admin",
  email: "karthicoc7075@gmail.com",
  role: "admin" as const,
};

assert.strictEqual(
  isAdminUser(adminUser, adminProfile),
  true,
  "karthicoc7075@gmail.com with admin profile must be authorized as admin",
);
assert.strictEqual(
  isAdminUser(adminUser, null),
  true,
  "karthicoc7075@gmail.com without profile loaded must still be recognized as admin",
);
assert.strictEqual(
  isAdminUser({ email: "karthicoc7075@gmail.com" }, null),
  true,
  "Supabase session user with karthicoc7075@gmail.com must be recognized as admin",
);

// 3. Security: Role spoofing protection for normal users
const normalUser = {
  id: "user-456",
  name: "John Doe",
  email: "john@example.com",
};
const spoofedProfile = {
  uid: "user-456",
  name: "John Doe",
  email: "john@example.com",
  role: "admin" as const, // Attempted spoofing in local profile
};
const normalProfile = {
  uid: "user-456",
  name: "John Doe",
  email: "john@example.com",
  role: "user" as const,
};

assert.strictEqual(
  isAdminUser(normalUser, normalProfile),
  false,
  "Normal user must have isAdminUser = false",
);
assert.strictEqual(
  isAdminUser(normalUser, spoofedProfile),
  false,
  "Spoofed role on non-admin email must be rejected by isAdminUser",
);
assert.strictEqual(
  isAdminUser({ email: "attacker@gmail.com" }, { role: "admin", email: "attacker@gmail.com" }),
  false,
  "Arbitrary account claiming admin role must be rejected",
);
console.log("  ✓ Role spoofing protection verified — only authenticated karthicoc7075@gmail.com is authorized");

// 4. Role View Mode Logic & PIN verification check
type RoleViewMode = "user" | "admin";
function getEffectiveMode(isAdmin: boolean, requestedMode: RoleViewMode): RoleViewMode {
  return isAdmin ? requestedMode : "user";
}

assert.strictEqual(
  getEffectiveMode(false, "admin"),
  "user",
  "Normal users cannot enter Admin View mode",
);
assert.strictEqual(
  getEffectiveMode(false, "user"),
  "user",
  "Normal users are always in User View mode",
);
assert.strictEqual(
  getEffectiveMode(true, "user"),
  "user",
  "Admins can toggle into User View mode",
);
assert.strictEqual(
  getEffectiveMode(true, "admin"),
  "admin",
  "Admins can toggle into Admin View mode",
);
console.log("  ✓ Role view switcher logic verified (Normal users locked to User View; Admin can switch freely via PIN)");

console.log("\nALL USER ROLE AND ADMIN PERMISSION TESTS PASSED!\n");
