# SpentX — additional verified bugs (pass 2)

**Date:** 2026-07-25  
**Method:** Code comparison only (web `src/`, Flutter `Mobile app/SpentX/lib/`, `supabase/migrations`).  
**Companion:** [BUGS.md](./BUGS.md) · [web-flutter-db-mismatch.md](./web-flutter-db-mismatch.md)

This pass covers **transfers, accounts, friends, multi-splits, plans, receipts, outing status, and pending SMS** — areas not fully listed in pass 1.

---

## Transfers (Wealth / Cash)

### BUG-TR-01 — P0 — Transfer encoding differs (web Settlements vs mobile tags)

| | Web | Flutter |
|---|-----|---------|
| Create | Two legs: expense + income, **category = `Settlements`**, no `transfer` tag | Two legs with **`isTransfer: true`**, tags `transfer` + `transfer_to:…`, category often not Settlements |
| Detect transfer | `isTransferTransaction`: category settlements/transfer **or** tag `transfer` | Local flag + tag `transfer` on pull |

**DB after web transfer:** splits.category_id ≈ `Settlements`, tags empty.  
**DB after mobile transfer:** tags include `transfer`, payment_method UPI/Cash.

**User effect**

- Mobile pull of **web** transfer: `isTransfer` becomes **false** (no tag); category becomes Settlements — monthly filters still skip settlements, but **transferTo is lost**, tile/display treats legs as normal settlements-ish txs.
- Web pull of **mobile** transfer: works if tags present (`isTransferTransaction` checks tag).
- Analytics/source reports that only look for one encoding will mis-count.

**Files:** `WealthPage.tsx` `handleTransfer`; `investments.ts` `isTransferTransaction`; mobile transfer sheet + `TransactionMap.toRemote` / `toLocal`.

---

### BUG-TR-02 — P1 — Web transfer never writes `tags: ['transfer']`

Web intentionally documents mobile tags in `isTransferTransaction` but **QuickAccountTransfer / WealthPage never set tags**.

**Effect:** Cross-platform detection relies only on category name `"Settlements"`. Renaming category or localizing breaks transfer detection.

**Files:** `src/components/wealth/WealthPage.tsx` (lines ~108–129).

---

### BUG-TR-03 — P1 — Merchant string formats differ for transfers

| Client | Expense merchant | Income merchant |
|--------|------------------|-----------------|
| Web | `Transfer to {account}` | `Transfer from {account}` |
| Mobile | Often custom / account pair / `TR …` style | Varies |

**Effect:** Dedup, search, and “same transfer” matching across platforms fail; user sees different titles for the same money move.

---

## Multi-purpose / multi-category splits

### BUG-SP-01 — P0 — Mobile keeps only the first split

On pull, sync does:

```dart
splitByTx.putIfAbsent(transaction_id, () => row); // first split only
```

Push always sets `has_splits: false` and writes **one** split.

**Effect:** Web multi-purpose or multi-category expense → mobile shows **one** purpose/category/amount only. Edit on mobile and re-push can **destroy** extra splits.

**Files:** `sync_service.dart` (~955); `TransactionMap.splitToRemote` / `hasSplits: false`.

---

### BUG-SP-02 — P1 — Web multi-split not editable on mobile UI

Mobile transaction model has single `category` / `purpose` / `amount` — no splits array.

**Effect:** Feature parity gap; data model on DB supports splits that app cannot show.

---

## Accounts

### BUG-ACC-01 — P1 — `opening_balance_date` web-only

| | Web | Flutter |
|---|-----|---------|
| Model | `openingBalanceDate` | missing |
| DB | `accounts.opening_balance_date` | AccountMap does **not** read/write |

**Effect:** Web “opening from date” balance timeline ignored on mobile; NW history can differ around opening date.

**Files:** web `supabase-data.ts` account payload; mobile `AccountMap`.

---

### BUG-ACC-02 — P1 — Field name `last4` vs `last4Digits`

| DB | Web | Flutter |
|----|-----|---------|
| `last4` | `last4` | local `last4Digits` ↔ map to `last4` |

Maps correctly, but any code that assumes same JSON key across clients will break offline backups / exports.

---

### BUG-ACC-03 — P2 — Account type casing

| DB / web | Flutter UI |
|----------|------------|
| `bank` \| `cash` \| `wallet` \| `credit` | `Bank` \| `Cash` \| `Wallet` \| `Credit` |

Mapped in `AccountMap.toRemoteType` / `toLocalType` — OK if always used; **raw Hive JSON** may store Title Case and confuse tools.

---

### BUG-ACC-04 — P1 — Default account / purpose on accounts

Web accounts may carry `purpose_ids[]`.  
Mobile account model has no purpose linkage.

**Effect:** Purpose-scoped account filters on web not mirrored on app.

---

## Friends

### BUG-FR-01 — P0 — Friend UPI / email not pushed from mobile

`FriendMap.toRemote` only sends:

- `name`, `phone`, `is_active`

DB/web also have: `upi`, `upi_ids`, `email`, `notes`.

**Effect:** UPI saved for a friend on **web** can be used for repayment matching; UPI/email set on paths that only use FriendMap push from mobile **do not sync** those fields. Web friend with UPI may not update mobile friend UPI store used by SMS repayment matcher (separate local UPI maps may exist — still not the friends table).

**Files:** `FriendMap` comment: “only name/phone are pushed”; web `saveFriend` full fields.

---

### BUG-FR-02 — P1 — Friend id strategy differs

Mobile: deterministic uuid v5 from **name**.  
Web: random uuid on create.

**Effect:** Same person name can exist as two friend rows if created once on each client before sync merges by name; phone/UPI may not merge.

---

## Plans / budgets

### BUG-PL-01 — P1 — Allocation JSON key style mixed but accepted

Both use `plannedAmount` in app push; pull accepts `planned_amount`. Web may store camelCase in jsonb.

**Risk:** If any path writes snake_case only, older app builds still OK (dual read). Low risk if both write camelCase.

---

### BUG-PL-02 — P1 — Plan fields ignored by mobile

DB `monthly_plans` has: `daily_safe_limit`, `savings_target`, `is_budget_locked`, `change_history`, `rollover` on allocations (web).

Mobile push/pull focuses on: month, title, purpose, expected_income, allocations.

**Effect:** Web plan lock / daily safe / savings target / allocation rollover **not visible or preserved** on mobile re-save (upsert may wipe unsent columns depending on PostgREST upsert defaults — **risk of nulling** if full row replace without defaults).

**Verify:** Supabase upsert with partial columns typically leaves unspecified columns unchanged — **usually safe**. Still feature gap.

---

### BUG-PL-03 — P2 — Mobile plan `expectedIncome` sometimes derived from sum of limits

`plan_provider` can set expected income from sum of allocation limits in some bootstrap paths — web uses independent expected income.

**Effect:** Plan “income target” differs after mobile-side rebuild of plan.

---

## Categories / investments

### BUG-CAT-01 — P1 — `is_investment` not on mobile categories sync

DB `categories.is_investment` and global default “Investment” category.  
Web excludes investment expenses from spend KPIs.  
Mobile `CategoryMap.toRemote` does not send `is_investment`; local category model may not flag investment.

**Effect:** Same “Investment” category spend counts in mobile Home expense, excluded on web Dashboard outflow (when category list loaded with flag).

---

### BUG-CAT-02 — P2 — Mobile category color/icon hard-coded on create

`CategoryMap.toRemote` forces color by type and icon `tag` — web user-chosen color/icon can be overwritten if mobile re-upserts category.

---

## Receipts / media

### BUG-RC-01 — P1 — Receipt images web-only

DB `transactions.receipt_url` + storage bucket `receipts`.  
Web maps `receiptImageUrl`.  
Flutter transaction model has **no** receipt field.

**Effect:** Receipt attached on web never appears on app.

---

## Outings status / settlements

### BUG-OUT-04 — P1 — Outing `cancelled` status dropped on mobile

DB allows `active` | `completed` | `cancelled`.  
Mobile maps: local `isActive` true → `active`, else → **`completed` only**.

**Effect:** Web-cancelled outing becomes “completed” on mobile, not cancelled.

---

### BUG-OUT-05 — P1 — Settlement model: web outing-level vs mobile per-expense

Web `settlements` = from_member → to_member at outing level.  
Mobile stores per-expense payments; embeds expense id in note `exp:{id}`.

**Effect:** Settlements created on web without `exp:` note apply **FIFO** on mobile pull (documented in SettlementMap). Balances can look “settled” against wrong expense lines.

---

### BUG-OUT-06 — P2 — Budget on outing

Web outing has `budget` field in model/DB.  
Mobile OutingMap toRemote does not clearly map budget in the section reviewed (title, type, dates, members, total_spent…).

**Effect:** Outing budget set on web may not show on app.

---

## Pending / SMS (mobile-only data)

### BUG-SMS-01 — P1 — `isPendingVerification` never on server

Mobile local flag for unverified SMS merchants.  
Not a DB column; never synced.

**Effect:** Expected offline-only — but web cannot show “pending verify” queue. Document as product split, not a money bug.

---

### BUG-SMS-02 — P1 — `rawMessage` / SMS body not stored on transactions parent

Mobile keeps `rawMessage` in Hive.  
Push does not write a full SMS body column (only tags for bank/last4/upi).

**Effect:** Web cannot show original SMS for mobile-created auto txs.

---

### BUG-SMS-03 — P2 — `time` display field local-only

Mobile `time` string (`Synced`, `Trip total`, clock) not in DB; web uses `transaction_date` only.

**Effect:** Cosmetic only after sync.

---

## Contributors / income source

### BUG-CO-01 — P1 — Contributor name vs uuid round-trip fragile

Web stores `contributor_id` uuid on split; displays name after enrich.  
Mobile stores `contributorSource` name; resolves uuid on push via cache.

**Effect:** Rename contributor on one client leaves historical splits pointing at old uuid; other client shows raw id or wrong name until re-enrich.

---

## Date / month_key

### BUG-DT-01 — P1 — `month_key` from device-local DateTime parse

Mobile: `monthKeyFor` uses `DateTime.tryParse(isoDate)` then **local** year/month.  
Web: `deriveMonthKey` from ISO string (implementation may use UTC slice).

**Effect:** Near midnight IST vs UTC, same spend can land in **different month_key** → month filters disagree.

**Files:** `TransactionMap.monthKeyFor`; web `deriveMonthKey` in `supabase-data.ts`.

---

### BUG-DT-02 — P2 — Date-only strings forced to noon on web

Web often builds `…T12:00:00` for date-only.  
Mobile may store full local DateTime with current clock time.

**Effect:** Sort order within day differs; rare filter edge at day boundaries.

---

## Net worth / purpose split

### BUG-NW-01 — P1 — Opening balance attributed to Personal only (web)

Web `openingBalanceForPurpose` gives full opening to Personal purpose.  
Mobile `netWorthByPurpose` uses similar Personal-only opening in places (`isPersonal ? opening : 0`).

**Mostly aligned** — but if mobile attributes opening differently for “Home” bank accounts named Personal/Home historically, purpose NW cards can still drift.

---

### BUG-NW-02 — P2 — Legacy mobile account names “Personal” / “Home”

Older mobile treated `account` as purpose-like (“Personal”/“Home”).  
Web accounts are real bank/cash names.

**Effect:** After sync, old local rows with account=`Personal` may not match any remote account uuid resolution → push fails or maps to wrong account.

---

## Admin / web-only totals

### BUG-ADM-01 — P1 — Admin spend RPCs historically double/miss outing totals

Admin list/detail used raw `sum(total_amount)` including rollups.  
Migration `20260732_admin_spend_outing_totals.sql` fixes this **only after applied**.

**Effect:** Until migration is run on the project, Admin Users spend ≠ app Dashboard.

---

## Sync safety nets that hide bugs

### BUG-SYNC-10 — P1 — Outing FK failure strips `outing_id` on push

`_upsertTransactionWithOutingFallback`: if outing not on server, transaction is pushed **without** outing_id.

**Effect:** Spend appears on web ledger **unlinked** from trip until outing exists and a re-link runs. Outing totals and web rollup stay wrong until heal.

**Files:** `sync_service.dart` `_upsertTransactionWithOutingFallback`.

---

### BUG-SYNC-11 — P2 — Mobile push always `source: mobile`

Even when editing a web-created row, re-push may stamp source/entry_source as mobile.

**Effect:** Audit trails and “source” filters wrong after mobile edit.

---

## UI labels (additional)

| ID | Web | App | DB |
|----|-----|-----|-----|
| BUG-UI-01 | Settlements category for transfers | Transfer / Online transfer UX | category_id text |
| BUG-UI-02 | Period Inflow / Outflow | Income / Expense chips | derived |
| BUG-UI-03 | Outing name | Title | outings.title |
| BUG-UI-04 | Merchant / payee | TITLE / MERCHANT | merchant |
| BUG-UI-05 | Description + Note | Note only | description + note |

---

## Pass 2 fix priority (append to pass 1)

| Priority | IDs | Theme |
|----------|-----|--------|
| 1 | TR-01, TR-02, TR-03 | Unified transfer encoding (tags + category) |
| 2 | SP-01, SP-02 | Multi-split pull/push or explicit “single split only” product rule |
| 3 | FR-01 | Friend UPI/email/phone full map |
| 4 | ACC-01 | opening_balance_date |
| 5 | OUT-04, OUT-05, SYNC-10 | Outing status + settlement + FK fallback |
| 6 | CAT-01, RC-01, DT-01 | Investment flag, receipts, month_key TZ |
| 7 | ADM-01 | Confirm admin migration applied |

---

## Source index (pass 2)

| Area | Web | Flutter |
|------|-----|---------|
| Transfer create | `WealthPage.tsx` | transfer bottom sheet / add_transaction type transfer |
| Transfer detect | `investments.ts` | `TransactionMap` tags + `isTransfer` |
| Splits pull | `supabase-data.ts` all splits | `sync_service.dart` putIfAbsent first split |
| Friends | `saveFriend` full columns | `FriendMap` name/phone only |
| Accounts | `opening_balance_date` | `AccountMap` no date |
| Plans | `monthly_plans` full | `sync_service` plan upsert subset |
| Outing status | cancelled allowed | only active/completed |

---

*Pass 2 complete. Update `BUGS.md` statuses when fixed.*
