/**
 * Test: Website stops saving ₹0 snapshots during user bootstrap.
 *
 * Verifies that bootstrapUserWorkspace does not query or insert into:
 * - net_worth_history
 * - account_balance_history
 *
 * Run: npx tsx scripts/test-user-bootstrap-snapshots.ts
 */
import assert from "node:assert/strict";
import {
  bootstrapUserWorkspace,
  clearBootstrapSessionCache,
} from "../src/lib/user-bootstrap";
import type { SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      console.error(`  ✗ ${name}`);
      throw e;
    });
}

function createMockSupabaseClient() {
  const accessedTables: string[] = [];
  const insertedRows: Record<string, unknown[]> = {};

  function makeQueryBuilder(table: string) {
    accessedTables.push(table);

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: async () => {
        if (table === "users") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        return { data: { id: "mock-id-123" }, error: null };
      },
      insert: (payload: unknown) => {
        if (!insertedRows[table]) insertedRows[table] = [];
        insertedRows[table].push(payload);
        return builder;
      },
      update: () => builder,
      then: (resolve: (val: unknown) => unknown) => {
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };

    return builder;
  }

  const mockClient = {
    from: (table: string) => {
      if (table === "net_worth_history") {
        throw new Error("FAIL: net_worth_history was accessed during user bootstrap!");
      }
      if (table === "account_balance_history") {
        throw new Error("FAIL: account_balance_history was accessed during user bootstrap!");
      }
      return makeQueryBuilder(table);
    },
    accessedTables,
    insertedRows,
  };

  return mockClient as unknown as SupabaseClient & {
    accessedTables: string[];
    insertedRows: Record<string, unknown[]>;
  };
}

async function main() {
  console.log("── User Bootstrap Snapshot Regression Tests ──");

  await check("bootstrapUserWorkspace never accesses net_worth_history or account_balance_history", async () => {
    const testUserId = "user-test-zero-snapshot-123";
    clearBootstrapSessionCache(testUserId);

    const mockDb = createMockSupabaseClient();

    const result = await bootstrapUserWorkspace(
      mockDb,
      testUserId,
      {
        email: "test@example.com",
        name: "Test User",
      },
      {
        platform: "Web",
        userAgent: "TestAgent/1.0",
      },
    );

    assert.equal(result.userId, testUserId);
    assert.equal(result.createdUser, true);

    // Verify neither table was ever accessed
    assert.ok(
      !mockDb.accessedTables.includes("net_worth_history"),
      "net_worth_history must not be accessed during bootstrap",
    );
    assert.ok(
      !mockDb.accessedTables.includes("account_balance_history"),
      "account_balance_history must not be accessed during bootstrap",
    );

    // Verify neither table has inserted rows
    assert.equal(mockDb.insertedRows["net_worth_history"], undefined);
    assert.equal(mockDb.insertedRows["account_balance_history"], undefined);

    // Verify standard tables were still seeded
    assert.ok(mockDb.insertedRows["users"]?.length! > 0, "user profile created");
    assert.ok(mockDb.insertedRows["purposes"]?.length! > 0, "purposes seeded");
    assert.ok(mockDb.insertedRows["accounts"]?.length! > 0, "cash account seeded");
    assert.ok(mockDb.insertedRows["budget_templates"]?.length! > 0, "budget template seeded");
  });

  console.log(`\nALL ${passed} USER BOOTSTRAP SNAPSHOT TESTS PASSED\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
