# SpentX — Web ↔ Flutter ↔ DB mismatch audit

**Date:** 2026-07-25  
**Scope:** Real code only (web `src/`, Flutter `Mobile app/SpentX/lib/`, Postgres `supabase/migrations/init.sql` + later migrations).  
**Goal:** List verified UI label / field / DB column mismatches and page-level total bugs so each can be fixed later.  
**Not included:** Guessed product bugs, unproven runtime race conditions, style-only differences.

---

## How to read this

| Severity | Meaning |
|----------|---------|
| **P0** | Wrong money / data loss / cross-platform display of wrong amount or name |
| **P1** | Field/label mismatch that confuses users or breaks round-trip of a real field |
| **P2** | Structural drift (defaults, tags, secondary columns) that can cause bugs under load |

Each item states: **where**, **what code does**, **DB truth**, **user-visible effect**.

---

## 1. Canonical DB (ground truth)

### 1.1 `transactions`

| DB column | Type | Notes |
|-----------|------|--------|
| `merchant` | text NOT NULL | Primary display name of payee / title |
| `total_amount` | numeric | Only amount on parent row |
| `type` | `income` \| `expense` | Not boolean |
| `payment_method` | text default `UPI` | Free text in practice |
| `source` | `manual` \| `mobile` \| `bank-sync` \| `import` | Who wrote the row |
| `entry_source` | `manual` \| `mobile-manual` \| `sms-auto-detected` | Entry channel |
| `transaction_date` | timestamptz | Event time |
| `month_key` | text | `YYYY-MM` |
| `description` | text nullable | Optional short description |
| `note` | text nullable | Free note |
| `reference` / `reference_id` | text | UPI / UTR etc. |
| `tags` | text[] | e.g. `outing-rollup`, `transfer` |
| `outing_id` | uuid nullable | Link to outing |
| `account_id` | uuid FK → `accounts` | **No** account name on parent |

**Not on parent:** purpose, category (live on `transaction_splits`).

### 1.2 `transaction_splits`

| DB column | Notes |
|-----------|--------|
| `purpose_id` | uuid FK → `purposes` |
| `category_id` | **text** — stores **category name**, not category UUID (both clients) |
| `contributor_id` | uuid FK, income only |
| `amount` | split amount |
| `outing_id` | optional |

### 1.3 `outings`

| DB column | Notes |
|-----------|--------|
| `title` | Outing display name (NOT `name`) |
| `type` | Outing category e.g. Trip / Temple |
| `status` | `active` \| `completed` \| `cancelled` (running state) |
| `is_active` | soft-delete flag (not “trip is running”) |
| `auto_add_mode` | boolean, DB default **false** |
| `total_spent` | denormalized cache |

### 1.4 `outing_expenses`

| DB column | Notes |
|-----------|--------|
| `description` | Expense title/text (NOT `title`, NOT `merchant`) |
| `category_id` | text name |
| `expense_date` | timestamptz |
| `linked_transaction_id` | optional ledger link |
| `account_name` / `payment_mode` | added in later migration |

---

## 2. Transaction field map (add expense / income)

| Concept | DB | Web model / UI | Flutter model / UI | Sync map (mobile → DB) |
|---------|-----|----------------|--------------------|-------------------------|
| Payee / title | `merchant` | `merchant` — label **“Merchant / payee”** | `merchant` — label **“TITLE / MERCHANT”** | `merchant` ✓ |
| Amount | `total_amount` | `totalAmount` / `amount` | `amount` | `total_amount` ✓ |
| Type | `type` | `type: income\|expense` | `isExpense: bool` | maps to type ✓ |
| Category | `transaction_splits.category_id` | `category` (name) | `category` (name) | name string ✓ |
| Purpose | `transaction_splits.purpose_id` (uuid) | `purposeId` / legacy `purpose`; client often uses `"personal"` then resolves UUID | `purpose` **string name** (“Personal”) | name → uuid via cache ✓ if purpose row exists |
| Account | `account_id` (uuid) | `accountId` + display `accountName` | `account` **name string** | name → uuid ✓ |
| Payment | `payment_method` | `UPI` / `Cash` / other | `paymentType`: **Online** \| **Cash** | Online → **UPI**, Cash → Cash ✓ |
| Note | `note` | label **Note** | label **NOTE** | `note` ✓ |
| Description | `description` | label **Description** (separate field) | **No model field; never written** | **not pushed** |
| Reference | `reference_id` | UPI / Reference field | `referenceId` / UPI field | `reference_id` ✓ |
| Outing link | `outing_id` | optional outing | optional outing | ✓ |
| Tags | `tags` | array (rollup, transfer, …) | **not on model**; only encoded inside push tags for transfer/bank/upi | **lossy** on pull for non-encoded tags |
| Status | `status` | completed/pending/failed/refunded UI | always completed on push | mobile never sends pending/failed |
| Source | `source` / `entry_source` | `manual` / `manual` or similar | always `mobile` + `mobile-manual` or `sms-auto-detected` | ✓ for mobile origin |

### 2.1 Confirmed bugs / mismatches

#### BUG-TX-01 (P1) — UI label: Merchant vs Title
- **Web:** “Merchant / payee”  
- **Flutter:** “TITLE / MERCHANT”  
- **DB:** one column `merchant`  
- **Effect:** Same data, different vocabulary. User may think web “title” is another field.  
- **Files:** `AddTransactionSlideOver.tsx`, `add_transaction_sheet.dart`

#### BUG-TX-02 (P1) — Description exists only on web
- **Web** writes `description` + `note`.  
- **Flutter** has only `note`; `Transaction` model has **no** `description`.  
- **Mobile push** never sets `description`.  
- **Effect:** Description entered on web is **invisible on mobile**. Mobile edit of that row may leave description orphaned (not shown, not edited).  
- **Files:** web `AddTransactionSlideOver.tsx` + `toTransaction`; mobile `TransactionMap.toRemote` (no description key)

#### BUG-TX-03 (P1) — Payment method vocabulary Online vs UPI
- **Web UI values:** `UPI`, `Cash`, …  
- **Flutter UI values:** `Online`, `Cash`  
- **Push:** Online → DB `UPI`; pull: UPI → Online  
- **Effect:** Works if always mapped; any other web payment method (Card, NetBanking, etc. if added) collapses to Online/UPI on mobile.  
- **Files:** `TransactionMap.toRemote` / `toLocal`, web payment options

#### BUG-TX-04 (P1) — Status not round-tripped on mobile
- **Web** can set pending / failed / refunded.  
- **Mobile push** hardcodes `status: 'completed'`.  
- **Effect:** Mobile overwrite of a web “pending” row forces completed.  
- **Files:** `TransactionMap.toRemote`

#### BUG-TX-05 (P2) — Tags not stored on mobile model
- Web rollups use tag `outing-rollup`.  
- Mobile detects rollups primarily by **note** prefix (`Outing total…`).  
- Transfer uses tag `transfer` on push only (also `isTransfer` local flag).  
- **Effect:** If note is cleared but tag remains (or reverse), web and mobile disagree on whether a row is a rollup.  
- **Files:** web `outings.ts` `isOutingRollupTransaction`; mobile `outing_totals.dart` `isOutingRollupTransaction` (no tag check)

#### BUG-TX-06 (P1) — Purpose client id `"personal"` vs DB uuid
- **Web client constant** `PERSONAL_PURPOSE_ID = "personal"` is **not** a DB uuid.  
- **Write path** resolves to real purpose uuid in `supabase-data.resolvePurposeId`.  
- **Mobile** stores purpose **name** and resolves uuid via `RemoteIdCache`.  
- **Effect:** Safe when resolver runs; broken if a code path inserts `"personal"` as `purpose_id` without resolve (FK error) or if purpose name casing differs so cache miss creates a second purpose.  
- **Files:** `src/lib/purposes.ts`, `supabase-data.ts`, mobile `PurposeMap` / `RemoteIdCache`

#### BUG-TX-07 (P2) — Account name title-case on mobile pull
- Mobile `TransactionMap.toLocal` runs `_titleCase` on account name from cache.  
- **Effect:** `"HDFC"` → `"Hdfc"` class mismatches; balance matching is case-insensitive in many places but display and account pickers can show altered casing.  
- **Files:** `supabase_schema_map.dart` `TransactionMap.toLocal`

#### BUG-TX-08 (P0 historically / residual risk) — Outing rollup amount vs real expenses
- Web Transactions list showed **stale rollup amount** (first spend) while outing detail used live expense sum.  
- Partial mitigations exist (web live overlay + mobile `refreshOutingTotalSpent`).  
- **Still a system risk** if rollup DB row is not rewritten and a client reads stored `total_amount` only.  
- **Files:** web `buildTransactionsListRows`, `useOutingTransactionSync`; mobile `outing_total_refresh.dart`

---

## 3. Outing field map

| Concept | DB | Web | Flutter |
|---------|-----|-----|---------|
| Outing name | `title` | UI “Outing name” → model `name` / `title` → DB `title` | UI title → model `title` → DB `title` |
| Category | `type` | model `category` → DB `type` (Trip/Temple/…) | model `category` → DB `type` |
| Running state | `status` | `active` / `completed` | local `isActive` bool ↔ status active/completed |
| Soft delete | `is_active` | soft delete | push always `is_active: true` on upsert |
| Auto-add bank txs | `auto_add_mode` | default **false** in DB; model `autoAddMode` | default **true** (`isAutoMode`) |
| Total spent cache | `total_spent` | updated by rollup sync | updated via Hive + push |

### 3.1 Confirmed bugs

#### BUG-OUT-01 (P1) — auto_add_mode default opposite
- **DB / web create:** `auto_add_mode` defaults **false**.  
- **Mobile create:** `isAutoMode` defaults **true**.  
- **Effect:** Same user “create outing” on web vs app behaves differently for auto-linking SMS spends.  
- **Files:** `CreateOutingModal` / `outingPayload`; mobile `create_outing_sheet.dart` / `OutingMap.toRemote`

#### BUG-OUT-02 (P1) — Soft-delete vs completed confusion
- Mobile maps local `isActive` (trip running) → remote `status` active/completed, and **always** sends `is_active: true`.  
- Web soft-delete sets `is_active: false` + `deleted_at`.  
- **Effect:** Mobile re-push of a soft-deleted outing can resurrect it (`is_active: true`).  
- **Files:** `OutingMap.toRemote` comment + payload; web `cascadeDeleteOuting`

#### BUG-OUT-03 (P2) — Member identity shape
- Web members: `{ id, name, isCurrentUser, … }` with uuid-ish ids.  
- Mobile often uses name **“You”** and paid_by default **`you`**.  
- **Effect:** Settlement / paid-by matching across platforms is fragile when one side uses uuid member ids and the other uses `"you"`.  
- **Files:** `OutingMap`, `OutingExpenseMap` payer default `'you'`

---

## 4. Outing expense field map

| Concept | DB | Web | Flutter |
|---------|-----|-----|---------|
| Title text | `description` | expense description | local **`title`** ↔ DB description |
| Category | `category_id` | category string | category string |
| Date | `expense_date` | date | date |
| Split type | `split_type` enum: equally, solo, custom, percentage, shares | full enum | local int: **0=solo, 1=equally only** |
| Linked ledger | `linked_transaction_id` | `linkedTransactionId` | `transactionId` |
| Account | `account_name` | `accountName` | local `accountId` stores **display name** |
| Payment | `payment_mode` | payment mode | payment mode |

### 4.1 Confirmed bugs

#### BUG-OE-01 (P1) — Title vs description naming
- User enters **title** on mobile; stored as DB `description`.  
- Web forms use **description**.  
- **Effect:** Naming confusion only if docs/support say “title” vs “description”; data maps correctly via `OutingExpenseMap`.

#### BUG-OE-02 (P0/P1) — Split type lossy
- Mobile only serializes solo vs equally (`splitType` 0/1).  
- Web custom / percentage / shares become solo or equally on mobile pull (`equally` → 1, else solo).  
- **Effect:** Complex splits created on web **collapse** on mobile.  
- **Files:** `OutingExpenseMap.toRemote` / `toLocal`

#### BUG-OE-03 (P1) — accountId means name on mobile
- Mobile stores paying account **name** in field `accountId`.  
- Web uses separate `accountName` and ledger `account_id` uuid for transactions.  
- **Effect:** Easy to mis-wire if a future change treats mobile `accountId` as uuid.

---

## 5. Page-by-page: totals & UI

### 5.1 Web Dashboard vs Flutter Home

| Metric | Web Dashboard | Flutter Home | Match? |
|--------|---------------|--------------|--------|
| Net Worth | `computeNetWorthBreakdown` — accounts + ledger excl. opening rows & outing rollups − unlinked outing cash; credit as debt | `netWorthProvider` / `TransactionNotifier.netWorth` — same intended formula | **Intended match** (formulas aligned in comments + code) |
| Period income | `sumPeriodIncome` — no opening balance, no transfers | `monthlyIncomeProvider` — this calendar month, excludes transfer/opening/repayment | **Same idea**, different period control: web uses **date filter presets**; app is **always this calendar month** |
| Period expense | `sumPeriodExpense` — ledger excl. rollups + unlinked outing cash in range | `monthlyExpenseProvider` — excl. rollups by note; + unlinked cash **you paid** only | **Partial mismatch:** mobile unlinked cash only if paid by “you”; web sums all unlinked manual expenses in range |
| Labels | Period Inflow / Period Outflow / Net Worth | Income / Expense / NET WORTH | Label difference only |

#### BUG-HOME-01 (P1) — Period scope differs
- Web dashboard period follows global date filter (this month / last month / custom).  
- Mobile home income/expense is hard-coded **current calendar month**.  
- **Effect:** Comparing web “last month” to phone Home is invalid by design.

#### BUG-HOME-02 (P1) — Unlinked outing cash attribution
- Web: all unlinked non-`bank-detected` expenses in range count toward period outflow (and cash impact by account rules).  
- Mobile monthly expense: unlinked only if **paid by you**.  
- **Effect:** Shared-trip unlinked cash paid by a friend may still reduce web totals differently than mobile Home expense chip.

#### BUG-HOME-03 (P0 residual) — Transactions strip vs Dashboard (web-only, recently addressed)
- Web Transactions strip used **visible rollup amount**; Dashboard excluded rollup → **₹1,000-class drifts**.  
- Shared `period-totals.ts` was added so strip + dashboard use one formula.  
- **Verify after deploy:** same date range → Income / Expense / Net identical on Dashboard and Transactions.

---

### 5.2 Web Transactions page vs Flutter Activity / Transactions

| Behavior | Web | Flutter |
|----------|-----|---------|
| List primary label | `merchant` | `TransactionDisplayUtils.merchantTitle` / outing title prefix |
| Outing display | One **rollup** line when present; hide individuals | Groups by `outingId` into synthetic summary; **skips** note-based rollup rows |
| Summary expense | Canonical period expense (after fix) | Own summary chips; uses grouped list amounts |
| Add form label | Merchant / payee | TITLE / MERCHANT |

#### BUG-ACT-01 (P0/P1) — Outing list aggregation differs
- **Web:** prefers single rollup row (live total when expenses loaded).  
- **Mobile:** may **ignore** rollup and **sum individuals** into a synthetic group, or show `Outing: expense title` hybrid rows.  
- **Effect:** Same DB can show different outing line amounts if rollup stale and individuals incomplete (or reverse).  
- **Files:** web `buildTransactionsListRows`; mobile `transactions_screen.dart` grouping

#### BUG-ACT-02 (P1) — Rollup detection incomplete on mobile list
- Mobile list `isWebOutingRollup` only checks note prefixes, not tag `outing-rollup` and not description prefix (web also checks description).  
- **Effect:** Rollup without note prefix (tag-only) can be double-aggregated into outing group.

---

### 5.3 Web Wealth vs Flutter Wealth / Accounts

| Behavior | Web | Flutter |
|----------|-----|---------|
| Balance formula | opening + income − expense excl. opening & rollup − unlinked cash | documented same intent |
| Credit | debt (subtract absolute) | same intent in net worth |
| Investments | separate total / category flag | separate investments feature; **no** `isInvestment` on transaction model |

#### BUG-WL-01 (P1) — Investment as expense category
- Web can flag category `isInvestment` and exclude from “spending” KPIs.  
- Mobile transaction model has **no** investment flag; investment is a separate module.  
- **Effect:** Web “investment” expenses may still count as normal spend on mobile Home expense chip.

---

### 5.4 Web Analysis vs Flutter Analytics

| Behavior | Web | Flutter |
|----------|-----|---------|
| Outing in charts | Synthetic rows: category = Trip/Temple, merchant = outing name | Separate analytics screens; outing may be under-represented historically |
| Cash Flow Trend | Restored on Analysis page | Depends on analytics feature implementation |

#### BUG-AN-01 (P1) — Category meaning differs for outings
- After web analytics prep: outing spend buckets by **outing type** (Trip/Temple).  
- Normal spends bucket by **expense category** (Food/Travel).  
- Mobile analytics historically use expense categories only.  
- **Effect:** “Category breakdown” is not comparable across platforms for trip-heavy months.

---

### 5.5 Web Outings / Trip detail vs Flutter Groups / Outing detail

| Behavior | Web | Flutter |
|----------|-----|---------|
| Expense title field | description | title → description |
| Account on expense | accountName | accountId (name) |
| Split UI | full split types | primarily equal / solo |
| Rollup ledger row | created/updated by web sync hooks | created/updated by `refreshOutingTotalSpent` (note-based, **no** `outing-rollup` tag) |

#### BUG-TRIP-01 (P1) — Rollup tag missing on mobile-created rollups
- Mobile sets `note = 'Outing total · ${title}'` but does **not** set tags `['outing-rollup']`.  
- Web detection still works via note prefix.  
- Analytics / admin SQL helpers that check **tag only** would miss mobile rollups.  
- **Files:** `outing_total_refresh.dart` vs web `OUTING_ROLLUP_TAG`

#### BUG-TRIP-02 (P1) — total_spent cache lag
- Both update `total_spent` asynchronously.  
- **Effect:** Admin/DB raw `total_spent` can lag true sum of `outing_expenses` until next sync/heal.

---

### 5.6 Web Plan vs Flutter Plan / Budgets

| Behavior | Web | Flutter |
|----------|-----|---------|
| Plan key | user + month + purpose_id (uuid) | month + purpose **name** → deterministic uuid |
| Title | optional plan title | may differ |

#### BUG-PLAN-01 (P2) — Purpose resolution for plans
- Same risk as purposes: name vs uuid mismatch creates duplicate plan rows for same month if purpose resolution diverges.

---

### 5.7 Web Settings vs Flutter Settings

| Area | Web | Flutter |
|------|-----|---------|
| SMS rules | admin + user settings panels | full SMS rule engine + native |
| Theme | light/dark | theme provider (historically dark-first) |
| Merchants | less SMS-centric | Merchant Names + dual stores (legacy + v4; mirrored after prior fix) |

#### BUG-SET-01 (P2) — Features only on one client
- SMS auto-detect, notification listener, WorkManager: **mobile only**.  
- Admin portal, share tokens, impersonation: **web only**.  
- Not a field bug — product split — but explains “missing” screens when comparing apps.

---

## 6. Sync / backend connection gaps

| # | Severity | Issue | Detail |
|---|----------|--------|--------|
| SYNC-01 | P0 risk | Description not synced mobile | Web → DB `description` never appears on Flutter model |
| SYNC-02 | P1 | Tags lossy | Only transfer/bank/last4/upi encoded into tags on mobile push; `outing-rollup` not written by mobile |
| SYNC-03 | P1 | Status force-completed | Mobile push always completed |
| SYNC-04 | P1 | Outing soft-delete resurrection | Mobile upsert forces `is_active: true` |
| SYNC-05 | P1 | Split type collapse | custom/percentage/shares → solo/equal on mobile |
| SYNC-06 | P2 | source/entry_source | Web manual vs mobile always `mobile` — analytics “source” filters diverge |
| SYNC-07 | P2 | Account type casing | Web lowercase bank/cash; mobile Title Case Cash/Bank |
| SYNC-08 | P1 | Category_id is name | Both write names; renaming a category does not rewrite historical splits → orphan labels on both |
| SYNC-09 | P0 residual | Rollup amount stale in DB | UI may overlay live total; raw DB `transactions.total_amount` for rollup can lag until sync heal |

---

## 7. Fix order (recommended)

Work **one page at a time**; each row is a fix unit.

| Order | Page / area | Bugs to close | Done when |
|-------|-------------|-----------------|-----------|
| 1 | **Shared totals contract** | BUG-HOME-01/02, BUG-HOME-03 verify, SYNC-09 | Same month: Web Dashboard = Mobile Home income/expense/NW (within unlinked paid-by rule) |
| 2 | **Add expense / income form** | BUG-TX-01, TX-02, TX-03, TX-04 | Same labels or shared glossary; description round-trips; payment enum shared; status preserved |
| 3 | **Transactions / Activity list** | BUG-ACT-01, ACT-02, TX-05, TRIP-01 | One outing line, same amount web & app; rollup detection uses tag **and** note |
| 4 | **Outings create/detail** | BUG-OUT-01, OUT-02, OUT-03, OE-02, OE-03 | Same auto-add default; soft-delete safe; split types preserved |
| 5 | **Wealth / Accounts** | BUG-WL-01, TX-07 | Same balances per account name; investments excluded consistently |
| 6 | **Analysis / Analytics** | BUG-AN-01 | Document or unify outing category vs expense category |
| 7 | **Plan / Settings** | BUG-PLAN-01, SET-01 | Purpose keys stable; document client-only features |

---

## 8. Glossary (ship as product copy)

| User-facing term | Prefer | DB column |
|------------------|--------|-----------|
| Who was paid / income source label | **Merchant / payee** (or **Title** if product prefers one word — pick **one** for both clients) | `transactions.merchant` |
| Extra free text | **Note** | `transactions.note` |
| Optional long text | **Description** (web only today — add to mobile or drop from web) | `transactions.description` |
| Outing name | **Outing name** | `outings.title` |
| Outing kind | **Outing category** (Trip, Temple, …) | `outings.type` |
| Trip expense line | **Expense title** | `outing_expenses.description` |
| Money out this period | **Expense** / **Period Outflow** | derived |
| Wealth | **Net Worth** | derived |

---

## 9. Source index (for engineers)

| Area | Web | Flutter |
|------|-----|---------|
| Transaction type | `src/types/index.ts` | `lib/models/transaction.dart` |
| DB write map | `src/lib/supabase-data.ts` | `lib/core/sync/supabase_schema_map.dart` |
| Schema | `supabase/migrations/init.sql` | (same remote DB) |
| Add form | `src/components/shared/AddTransactionSlideOver.tsx` | `lib/features/transactions/presentation/add_transaction_sheet.dart` |
| Period totals | `src/lib/period-totals.ts`, `dashboard.ts` | `transaction_provider.dart` monthly* providers |
| Net worth | `src/lib/wealth.ts` | `transaction_provider.dart` netWorth |
| Outing rollup | `src/lib/outings.ts`, `outing-ledger-sync.ts` | `outing_totals.dart`, `outing_total_refresh.dart` |
| Transactions list | `TransactionsPage.tsx`, `buildTransactionsListRows` | `transactions_screen.dart` |
| Home / Dashboard | `DashboardPage.tsx` | `home_screen.dart` |

---

## 10. Explicit non-bugs (do not “fix” as product bugs)

1. **SMS detection only on Flutter** — by architecture.  
2. **Admin / share / impersonation only on web** — by architecture.  
3. **Hive local cache on mobile** — offline-first; temporary lag vs web realtime is expected until sync.  
4. **category_id as name** — intentional shared design (not UUID FK).  
5. **Merchant and title being the same column** — intentional; only labels differ.

---

*End of audit. Next step: fix in the order in §7; tick each BUG- id when closed with a cross-platform verification note.*
