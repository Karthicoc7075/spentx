---
name: spentx-tests
description: Use whenever writing a new test script under scripts/test-*.ts in this repo — so the new test matches this project's established structure (plain node:assert scripts run with tsx, no Jest/Vitest) instead of inventing a new one. Triggers on requests like "write a test for X", "add a regression test", "test this function".
---

# SpentX test patterns

Concrete, copy-from-a-real-file conventions for this repo. When asked to add a new test, follow the pattern below instead of reaching for a test framework this repo doesn't use.

There is no Jest/Vitest in this repo — tests are plain Node scripts run with `tsx`, using `node:assert/strict`.

**Reference files:** `scripts/test-net-worth.ts`, `scripts/test-financial-invalidation.ts`.

**Pattern:**
```ts
/**
 * <One-line description of what this regression-tests and why it exists.>
 * Run: npx tsx scripts/test-<name>.ts
 */
import assert from "node:assert/strict";
import { thingUnderTest } from "../src/lib/thing";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log("── <Section name> ──");

check("<behavior being asserted>", () => {
  // arrange minimal fixtures — small local factory functions (see `tx()`/`account()`
  // in test-net-worth.ts) that take a Partial<T> and spread sensible defaults
  assert.equal(thingUnderTest(/* ... */), /* expected */);
});

// ...more check() blocks...

console.log(`\nALL ${passed} <NAME> TESTS PASSED`);
```

**Rules:**
- Import the real functions from `src/lib/**` — these are unit tests of pure logic, not integration tests against Supabase.
- One `check()` per behavior; a thrown `assert` failure inside `check()` re-throws, which makes `tsx` exit non-zero — that's the pass/fail signal (no test runner, no reporter).
- If the test exists to lock in a bug fix (like `test-financial-invalidation.ts`), say so in the header comment: root cause, what would silently regress without this test.
- Wire the new script into `package.json`: add a `"test:<name>": "npx tsx scripts/test-<name>.ts"` entry, and append it to both `test` (if it belongs in the fast/default set) and `test:all`.
