# SpentX — Functional QA Report

**Method note:** The Chrome browser bridge would not connect reliably in this session, so this pass is a deep static/code-level QA (full read of every relevant module, cross-checked line-by-line against `SpentX Project Plan.md`) plus a clean `tsc --noEmit` and `eslint` run after every change — not a manual click-through. A manual test checklist is included at the end so you can verify quickly against a running `localhost:3000`.

---

## Page-by-page checklist

| Page | Status | Notes |
|---|---|---|
| Auth (sign in / sign up / forgot password / Google) | ✅ | Real Firebase Auth calls throughout. Sign-up correctly seeds default Purposes, Categories, a Cash account, and profile on first login. Not clicked through (OAuth needs a real browser popup). |
| Dashboard (KPIs, charts, recent transactions) | ❌ → fixed | Net worth KPI was including archived accounts' balances. Fixed. |
| All Transactions (list, filter, search, pagination, add/edit/delete) | ❌ → fixed | Add/Edit/Delete were wired to real Firestore already. Two things were missing entirely: the duplicate-transaction warning and the undo-on-delete/edit toast. Both built. Also: archived accounts/categories were still selectable when adding a new transaction — fixed. |
| Analysis (category breakdown, trend charts, PDF export) | ❌ → fixed | Charts/export were working. **Smart Views were completely dead** — the save/apply/delete logic existed in a hook but nothing in the UI ever called it, so the feature was invisible and unusable. Wired up. |
| Plan / Budget (budget vs actual, threshold warnings) | ❌ → fixed | Budget vs actual and threshold status worked. **Rollover Budget was entirely unimplemented** — no field, no calculation, no UI. Built. |
| Wealth (accounts, net worth, snapshots, discrepancy flags) | ❌ → fixed | Snapshot discrepancy flags and account balances were correct. Net worth math was double-counting: credit-card balances were added as an asset instead of subtracted as debt. Fixed. Archived accounts were also still counted — fixed. |
| Accounts / Categories / Purposes management (CRUD) | ❌ → fixed | **Account and Category "delete" were permanently destroying the Firestore document** (hard delete) instead of archiving, unlike Purposes which already did this correctly. This orphans historical transactions that reference a deleted account/category. Fixed to match the working Purpose pattern. |
| Outings / TripSplit | ✅ | Reviewed the module end to end (create outing, add expense, split methods, settlement algorithm, rollup into personal ledger) — wired to real Firestore, logic matches spec. Not manually clicked through. |
| Smart Views (save, delete, limit enforcement) | ❌ → fixed | Was non-functional (see Analysis row). Now has save/apply/delete and the spec's 10-view cap. |
| Settings (profile, purposes colors, backup/restore) | ❌ → fixed | Profile/Preferences/Purposes/Accounts/Categories/Sharing tabs all worked. **Security tab and Data & Backups section didn't exist at all.** Both built. |
| Viewer (read-only brother) dashboard | ✅ | Reviewed the sharing model (`purposeShares` / `viewerGrants`), restricted sidebar, read-only badge, and Firestore rules scoping reads to the shared Purpose only. Not verified with a live second account. |

---

## Bugs fixed (root cause)

1. **Account/Category delete permanently destroyed data.** `deleteAccount()` and `deleteCustomCategory()` in `lib/firebase.ts` called Firestore `deleteDoc()` directly. Per spec, these should be soft-deletes (archive, `is_active: false`) — exactly like `deletePurpose()` already did correctly in the same file. A hard delete on an account/category that has existing transactions leaves those transactions pointing at a record that no longer exists. Rewrote both to archive instead, matching the existing correct pattern.
   - Side effect I also had to close: the `Category` type had no active/inactive field at all (only `isDefault`), so I added `is_active` to match `Account`/`Purpose`.
   - Side effect I also had to close: nothing filtered archived accounts/categories out of the "select an account/category" dropdowns in Add Transaction / Add Investment, or out of the Wealth-page and Dashboard net-worth totals. Since accounts/categories could never actually be inactive before (hard delete meant they just vanished), this gap was invisible until now. Added `is_active !== false` filtering at those specific points only — filter/search dropdowns were left untouched since showing archived items there is correct (so you can still filter old transactions by a since-archived account).

2. **Net worth counted credit-card debt as an asset.** `computeNetWorthBreakdown()` in `lib/wealth.ts` summed every account type — including `credit` — directly into the total. Spec §8.3 is explicit: credit balances represent debt and should be subtracted, not added. Fixed on the Wealth page (see "Needs your input" below for the Dashboard KPI caveat).

3. **Smart Views / saved filter views were dead code.** `useAnalyticsFilters.ts` had fully-built `saveCurrentView` / `applySavedView` / `deleteSavedView` / `presetViews` logic, but `AnalysisPage.tsx` never destructured or rendered any of it — there was no button, no dropdown, nothing clickable. Added a "Smart Views" control (save current filters, apply a saved or preset view, delete, 10-view limit) to the Analysis page filter row.

---

## Features built (per your direction to build the missing spec logic + matching UI)

These were listed in your test scope but didn't exist anywhere in the app before this pass:

- **Duplicate transaction warning** (spec A1.1) — same amount + account + date triggers a warning banner in the Add Transaction drawer with Save Anyway / Cancel. Runs on create only, not edit, per spec.
- **Undo toast on delete/edit** (spec A1.2) — deleting a transaction hides it immediately and gives a 5-second Undo window before the Firestore delete actually happens; editing shows an Undo action that reverts to the prior values.
- **Rollover Budget** (spec A3) — per-category rollover checkbox on the Plan page's Allocation Sheet. Unused budget from last month adds to this month's effective budget (never subtracts for overspend, per spec). The Fits-Income banner still uses base estimates only, as specified.
- **Smart Views UI** (spec A4) — save/apply/delete filter presets from the Analysis page, plus the 5 built-in presets, with the spec's 10-view limit enforced.
- **Backup & Restore** (spec A5) — Settings → Data & Backups: "Backup Now" (downloads a JSON file to your device + best-effort cloud upload), "Download Latest," and "Restore" (validates the file, requires typing RESTORE, backs up your current data first). A silent weekly auto-backup also runs on Dashboard load.
- **Settings → Security tab** (spec 9.9) — "Send password reset email" action.

All of the above compiles cleanly (`tsc --noEmit`) and passes lint with no new warnings/errors beyond what already existed in the codebase before I touched it.

---

## Needs your input / couldn't fully resolve

- **Nothing above was visually confirmed in a browser.** The Claude-in-Chrome bridge wouldn't hold a connection this session (repeated timeouts even after you installed/connected the extension). Everything is verified by compiling, type-checking, and careful reading — not by clicking. Please run through the manual checklist below.
- **Backup cloud upload needs a deploy step.** I added `storage.rules` (matching spec A5.3) and pointed `firebase.json` at it, but Firebase Storage rules default to deny-all until deployed. Run `firebase deploy --only storage` for "Backup Now" and the weekly auto-backup to actually reach the cloud — until then they fail silently on the upload step (by design) but still succeed at downloading the JSON locally.
- **Restore is an upsert, not a full wipe.** Spec A5.4 describes restore as replacing *all* current data. I implemented it as "overwrite every record from the backup by its original ID," not "delete everything then reinsert" — a full wipe-first approach risks total data loss if it fails partway through, and I had no way to test that against your real Firestore. Net effect: restoring will not remove records you created *after* the backup was taken. Tell me if you want true wipe-and-replace instead — it's a bigger, riskier change I'd want to test carefully with you.
- **Credit-card net worth fix is Wealth-page only.** The Dashboard KPI card computes net worth as one aggregate (sum of all opening balances + all income − all expense) rather than per-account, so making it credit-aware safely would mean restructuring that calculation — I didn't want to do that blind without being able to click-test it. Low real-world impact right now: the Settings → Accounts "Add account" flow only allows creating Bank-type accounts today (Wallet/Credit are locked in that form), so credit accounts can't actually be created through the UI as it stands.
- **Undo toast scope.** I built it for Transaction delete/edit (what your checklist calls out under Transactions). Spec A1.2 also lists it for Category/Account/Purpose archive, Outing expense delete, and Snapshot delete — I didn't extend it there to keep the change small; say the word if you want full coverage.
- **Smart Views live on the Analysis page**, backed by the same `localStorage`-based hook that already existed, not a Firestore `smartViews` collection with sidebar entries as the spec addendum describes. I wired up what was already half-built rather than standing up a second, competing system. Flag if you want the full spec version (global, Firestore-backed, usable from the Transactions page and the sidebar).
- **Google OAuth, Outings/TripSplit, and the Viewer dashboard** were reviewed at the code level only — not exercised live (OAuth needs a real popup; Viewer needs a second test account).

---

## Manual test checklist (5–10 min on localhost:3000)

1. **Delete an account or category** in Settings, then open Add Transaction — confirm it no longer appears in the dropdown, and confirm an old transaction that used it still displays correctly.
2. **Add a duplicate transaction** (same amount, account, date as an existing one) — confirm the warning banner appears with Save Anyway / Cancel.
3. **Delete a transaction** from All Transactions — confirm it disappears immediately and an Undo toast appears; click Undo and confirm it comes back.
4. **Edit a transaction** — confirm the "updated" toast has an Undo action that reverts the edit.
5. **Plan page** — toggle rollover on a category with unused budget from last month, confirm the Rolled/Effective columns update.
6. **Analysis page** — set some filters, save as a Smart View, reload the page, apply it back, then delete it.
7. **Wealth page** — confirm Net Worth total looks right (no credit accounts should exist to test the debt-subtraction fix directly, per the note above).
8. **Settings → Security** — send yourself a password reset email.
9. **Settings → Data & Backups** — click Backup Now (should download a JSON file), then Restore that same file and confirm the typed-RESTORE confirmation gate works.

---

## Round 2 — follow-up fixes

You reported five issues after the first pass. Here's what changed for each:

**1. Dashboard KPI cards showing "mock data."** I could not reproduce this from the code. `DashboardKpiRow.tsx` and `useDashboardData.ts` only ever render values computed from your real Firestore accounts/transactions (`kpis.netWorth`, `kpis.income`, etc.) — there is no hardcoded number or fallback dataset in that path. I also confirmed the `mock-data.ts` file's sample accounts/investments/friends/outings arrays aren't imported anywhere outside that file, so nothing from it can leak into a real KPI. Given no live browser access this session, I can't rule out a stale cache or a specific number that looks wrong to you — if it happens again, tell me the exact card and number (or send a screenshot) and I'll trace it precisely.

**2. Contributors — default to "Me," add/delete in Settings, only show the picker with 2+ contributors.** Built from scratch:
- New Firestore collection `contributors` (per-user), seeded with a permanent "Me" on signup.
- New Settings → **Contributors** tab: add a name, delete any contributor except "Me" (locked with a padlock icon).
- Add/Edit Transaction: the Contributor field is now driven by your live list instead of a hardcoded Me/Brother/Father/Other set, defaults to "Me," and **only appears once you've added a second contributor** — exactly as you asked.
- The Transactions filter dropdown and the Analysis page's Contributor Breakdown chart were also updated to use the same live list (previously both were still hardcoded to the old 4 names — fixed so they can't silently drift out of sync with what you add/delete in Settings).
- Security rules updated to scope `contributors` reads/writes to the owning user (**needs `firebase deploy --only firestore:rules`** — see below).

**3. Plan page "Missing or insufficient permissions" error.** Root cause: Firestore evaluates security rules even when a queried document doesn't exist — the Plan page's rollover feature checks last month's plan, which usually doesn't exist yet for a new month, and the old rule dereferenced `resource.data.userId` on a null `resource`, which Firestore reports as a permission error rather than a clean "not found." Fixed two ways: (a) the rules for every user-scoped collection now check `resource == null` first, and (b) `fetchMonthlyPlan()` now also catches permission errors defensively and treats them as "no plan yet" instead of throwing. Part (b) works immediately; part (a) needs `firebase deploy --only firestore:rules` to take effect on the backend.

**4. Wealth page "Log Snapshot" modal — remove unnecessary content.** Trimmed it down. It used to show a full breakdown (opening balance, income-through-date, expense-through-date, "account not open yet" messaging, transaction-count footnotes) every time you opened it. Now it just shows: computed balance for the date you picked, your last saved snapshot, and the difference between them — plus the date picker, balance input, and note field you actually use to log a snapshot. Nothing about how you save a snapshot changed, only what's displayed.

**5. Settings → Security tab "missing."** I checked again — it's present and wired correctly (sidebar item → password reset card, not gated behind admin). If it's not showing up for you, it's likely a stale build/cache on your end rather than missing code; a hard refresh or restarting `npm run dev` should surface it. Let me know if it's still not there after that and I'll dig further.

### Deploys needed on your end

Two rule files changed and need to be pushed to Firebase before the related fixes are fully live:
- `firebase deploy --only firestore:rules` — needed for the Plan-page permission fix and the new Contributors collection.
- `firebase deploy --only storage` — needed for Backup/Restore's cloud upload step (from Round 1; still pending if you haven't run it).

### Other missing features/UI scan

I re-swept the full spec against the current code looking for anything else missing. Nothing new stood out beyond what Round 1 already found and built (Duplicate Warning, Undo Toast, Rollover Budget, Smart Views, Backup/Restore, Security tab) plus Contributors from this round. The Settings tab set now matches spec §9.9 exactly (Profile, Preferences, Purposes, Accounts, Categories, Sharing, Security) with Contributors and Data & Backups as the two additions you asked for beyond spec.

`tsc --noEmit` and `eslint` are clean on every file touched this round (only pre-existing warnings elsewhere in the codebase, none introduced by this pass).
