# Balance & Daily Snapshot Audit

_Read-only audit, 31 Oct 2026 (IST). No code was changed. Mobile app branch `onboarding-flow` @ 5b28cd5. Supabase checked with read-only SELECTs._

Confidence marks: **[Confirmed]** = seen in code and data. **[Likely]** = strong evidence but not seen on the phone. **[Unconfirmed]** = needs the phone test in Part 4D.

---

## TL;DR: why the salary is missing

1. **The snapshot never saves from the phone.** Every snapshot row on the server (27 days, Jul 29 to Oct 31) was written by the **website's** sign-in bootstrap with **₹0** (`src/lib/user-bootstrap.ts`, the "record net worth snapshot" step plus a Cash ₹0 row). The phone tries to save the same day under a different row id, so the database rejects it as a duplicate (unique key `user_id + snapshot_date`, error 23505). The phone treats that as a permanent error and gives up. Then the phone's `_pullHistory` copies the server's ₹0 row over its own correct number. **[Confirmed in code and data: 0 phone-written rows exist, and all 27 rows are ₹0.]**
2. **Past days are never recalculated.** Snapshots are "today only". The salary is dated **Oct 30, 10:54 PM IST** but was restored on **Oct 31, 12:29 PM IST**, so Oct 30's snapshot can never include it, even after cause 1 is fixed. **[Confirmed in code]**
3. **The live account balance should already include it.** On the server the salary row is clean: account "HDFC ••0034", status completed, no review flags, ₹12,000 income. The balance formula counts it whatever its date. **[Confirmed for the server row. Unconfirmed on the phone. Run test 4D, steps 1–2.]** If the phone still shows ₹-150 for HDFC ••0034, the local copy of the row has a different account name than the account card (see Bug B6).

---

## Part 1: How an account balance works

### Example: HDFC ••0034

| Item | Value |
|---|---|
| Opening balance | ₹0 (`accounts.opening_balance`), date **empty** (`opening_balance_date` = null) |
| Swiggy, Oct 26 | −₹150 |
| Salary INFOGRASS, Oct 30 (restored) | +₹12,000 |
| **Expected balance** | **₹11,850** |

### Where the opening balance lives
- Phone: `AccountModel.openingBalance` and `openingBalanceDate` in `lib/core/models/account_model.dart`, kept in the encrypted Hive user state.
- Server: `accounts.opening_balance` and `accounts.opening_balance_date`.

### Formula (`lib/features/transactions/data/transaction_provider.dart`)
```
balance = openingBalance + rolloverDelta + sum(income) − sum(expense) + transfers in − transfers out
```
- `getFullAccountBalance(name)` = `openingBalance` + `getRolloverDelta(name)` + `getAccountBalance(name)`.
- `getAccountBalance` loops over **every** transaction in the phone's ledger. It has **no date filter** and **ignores `openingBalanceDate`**.
- A transaction matches the account by **name text**: `tx.account.trim().toLowerCase() == account name`.
- `getRolloverDelta` reads the setting `account_rollover_deltas`. Nothing in the app ever writes it, so it is always 0.

### What is counted and what is skipped (`lib/core/finance/countable.dart`)

| Transaction type | Moves the balance? |
|---|---|
| Normal completed or success | ✅ Yes |
| Failed, pending, cancelled, reversed, unknown status, reversal entry | ❌ No |
| Unverified SMS (review card, `isPendingVerification`) | ❌ No |
| "Needs account" (`needsAccount` flag) | ❌ No (it isn't attached to any account) |
| Amount-guessed | ✅ Yes (it's only a tag) |
| Needs category or needs classification | ✅ Yes |
| Outing-linked real transaction | ✅ Yes |
| Outing roll-up display row | ❌ No (avoids double counting) |
| Manual outing cash expense with no linked transaction | ✅ Yes, reduces the named account (or Cash) |
| Transfer | ✅ From-account −, to-account + |
| Refund, linked or unlinked | ✅ Yes, adds money |
| "Opening Balance" category row | ❌ No (the opening amount is already in the account) |

### Live or stored?
- **Live.** It is recalculated in memory every time the ledger changes.
- The Accounts screen watches `transactionProvider`, and liquidity uses `_ledgerFingerprint`.
- Nothing about the balance is stored.

### Other account types
- **Bank, wallet, cash:** same formula.
- **Debit cards:** not separate accounts. A card's last 4 digits are linked to its bank account (`linkedCardLast4`), and spends book to that bank. For example, HDFC ••0034 has card 8191.
- **Credit cards** show "owed":
  - If the opening balance > 0: `owed = max(0, opening − ledger)`.
  - Otherwise: `owed = max(0, −(opening + ledger))`.

---

## Part 2: How daily snapshots work (`lib/features/wealth/data/daily_snapshot_provider.dart`)

| Question | Answer |
|---|---|
| When is one made? | When the app opens, and 250 ms after any change to transactions, accounts or investments while the app is open. Nothing runs at midnight or in the background. |
| What does it store? | **Today only**: cash, bank, wallet, investments, credit owed, net worth, and per-account balances (each taken from the live balance above). |
| Which date? | `_todayKey()` uses the **UTC** date. Between 12:00 and 5:30 AM IST it files under **yesterday**. |
| Are past snapshots recalculated? | **No, never.** A past-dated add, edit or delete leaves old days unchanged. |
| Days with no snapshot? | The phone simply has no row (a gap). But the **website writes a ₹0 row** whenever you sign in on the web, so those days show **₹0**. |
| Where is it stored? | Phone: Hive box `wealth_snapshots`. Server: `net_worth_history` (one row per day) and `account_balance_history` (one row per account per day). |
| How does it sync? | `SnapshotOutbox` (built on `DurableCollection`) upserts by a fixed row id (`SyncIds.forNetWorthSnapshot`). After that, `_pullHistory` downloads the server rows and **the server wins** for the same date. |
| Per-account rows | Only sent when the account has a server UUID. In the data, only "Cash" rows exist (all ₹0, from the website). |

**What the data shows:**
- 27 `net_worth_history` rows, all `net_worth = 0`, all with random v4 ids, which means the website wrote them.
- The phone writes v5 ids, and there are **0** of those.
- Oct 31's row was created at 12:14 PM IST and never updated.

---

## Part 3: The restore path, traced

1. `LostSmsRecovery.findCandidates` (`lib/features/sms/recovery/lost_sms_recovery.dart`) finds the confirmed salary SMS whose transaction isn't in the ledger.
2. `addSelected` clears the dedupe marks, then calls `SmsDetectionPipeline.processInbound(..., preferBackground: true, receivedAt: <original SMS time>)`.
3. Next comes `AutoRuleEngine.handleBackgroundSms` and then `_autoSaveTrusted` (`auto_rule_engine.dart`).
   - **Account:** `ctx.accountName`, or else `resolveAccountName(bank, last4)`. That matches on last4 in the onboarding account list, then on bank name, then falls back to the first bank account.
   - **Flags:** `isPendingVerification = false`, no review flags, status completed.
4. It is saved to Hive (`_appendTransactionToHive`) and queued for upload. This is the same upload queue as normal saves, but not literally `TransactionSave.save`.
5. The foreground app is refreshed with `transactionProvider.reloadFromStorage()`, so the list and balances **do** recompute.
6. **The snapshot only recomputes today.** Oct 30 is never touched, and today's value is then lost to the server ₹0 row (cause 1).

**Server result:**
- The row went to "HDFC ••0034", ₹12,000, completed, `review_flags = []`, `balance_applied = true`.
- `SyncService._resolveRemoteAccountId` matched it by exact name. That means the phone's `tx.account` text **was** "HDFC ••0034" (or a cached alias of it).

### Exact causes
| # | Cause | File / function | Confidence |
|---|---|---|---|
| C1 | Website bootstrap inserts ₹0 snapshot rows. The phone's upsert then hits the unique `(user_id, snapshot_date)` key and is parked as a permanent failure | `src/lib/user-bootstrap.ts` (net worth and balance snapshot steps), `snapshot_outbox.dart`, `sync_error_kind.dart` (`23xxx` = permanent) | Confirmed |
| C2 | The server ₹0 row overwrites the phone's correct snapshot | `DailySnapshotNotifier._pullHistory` | Confirmed (code) |
| C3 | Past days are never recalculated | `DailySnapshotNotifier._computeToday` (today only) | Confirmed |
| C4 | The live balance is missing only if the local account text differs from the account card name | `getAccountBalance` (name match), `resolveAccountName` | Unconfirmed (server says the name matches) |

---

## Part 4: Results

### A. ✅ What works
- The restore finds the salary and saves it as a normal, fully counted transaction on the right account.
- It appears in the list, and the foreground ledger reloads.
- The live balance formula counts any date and recomputes instantly.
- Failed, pending and unverified items are correctly kept out.
- Transfers count both sides and outing roll-ups aren't double counted.

### B. ❌ Bugs (9)
| # | Bug | Example |
|---|---|---|
| B1 | Website writes ₹0 snapshots, which block the phone's real snapshot | Oct 26–31 all show ₹0 net worth, though Swiggy −150 existed |
| B2 | Server row overwrites the phone's fresh snapshot | Phone computes ₹11,850, then the pull replaces it with ₹0 |
| B3 | Past snapshots are never recalculated | Salary on Oct 30 is added Oct 31, so Oct 30 stays wrong forever |
| B4 | Snapshot date uses UTC | A spend at 2 AM IST on Nov 1 is filed under Oct 31 |
| B5 | Per-account snapshot rows are skipped without a server UUID | No HDFC ••0034 history rows at all |
| B6 | Balance matches by account **name text** | Rename "HDFC ••0034" to "HDFC Salary" and old rows drop out of the balance |
| B7 | `openingBalanceDate` is ignored | Set ₹50,000 "as of Oct 31", restore an Oct 30 salary, and it's counted twice |
| B8 | Snapshot credit math ≠ net worth credit math | Card A owes ₹5,000 and card B has a ₹1,000 credit: snapshot says ₹4,000, net worth says ₹5,000 |
| B9 | No-data days show ₹0 (website rows), and "vs yesterday" compares with the last existing row | Opened the app Oct 26 and Oct 31: "yesterday" is really Oct 26 |

Plus dead code: `account_rollover_deltas` is never written.

### C. Fix plan, in order
1. **Stop the website writing snapshots** (`src/lib/user-bootstrap.ts`): remove the ₹0 net worth and Cash balance inserts. Do a one-time cleanup of the ₹0 v4 rows only with Karthi's approval.
2. **Phone upsert on the natural key** (`snapshot_outbox.dart`): upsert with `onConflict: 'user_id,snapshot_date'` and `'account_id,snapshot_date'`, and re-queue parked rows.
3. **Don't let the pull overwrite unsent local values** (`daily_snapshot_provider.dart` `_pullHistory`): keep local while the outbox has a pending or failed change for that date.
4. **Recalculate past days** (`daily_snapshot_provider.dart`): add `recomputeFrom(date)`, which rebuilds end-of-day balances = opening + transactions up to that day, for each day from that date to today, and stages them in the outbox. Call it from `TransactionSave`, the edit and delete paths in `transaction_provider.dart`, `auto_rule_engine.dart` `_autoSaveTrusted`, and `lost_sms_recovery.dart` `addSelected`.
5. **Use local (IST) dates** for `_todayKey()`.
6. **Send per-account rows**: resolve the server id through `RemoteIdCache` or `SyncService`.
7. **One credit formula**: reuse the `netWorth` clamp logic in `_computeToday`.
8. **Gaps, never ₹0**: store no row for empty days, and show "no data" in the chart and the "vs yesterday" card (`accounts_screen.dart`, the wealth widgets).
9. **Match balances by account id** (or name + last4), and respect `openingBalanceDate` (`transaction_provider.dart`, `auto_rule_engine.dart` `resolveAccountName` using live accounts).

### D. Manual phone test (5 minutes)
1. Open **Accounts → HDFC ••0034**. Expected **₹11,850**. If it shows −₹150, the live balance bug (C4) is real.
2. Open the **salary transaction**. The account must read exactly "HDFC ••0034", not "Hdfc", "HDFC Bank" or "Needs account".
3. If it differs, change the account to HDFC ••0034 and save. The balance should jump by ₹12,000.
4. Open **Wealth / Daily snapshot**. Today will likely show ₹0 (cause C1/C2) and Oct 30 won't have the salary (C3). Both are expected until fixes 1–4 land.
5. After the fixes: add a ₹100 expense dated 3 days ago. Today's and that day's snapshots should both drop by ₹100. Days you never opened the app should show a gap, not ₹0.
