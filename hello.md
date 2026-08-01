# SpentX — Transactions & Outings: Full Explanation

This document fully explains, for both the **Web app** (Next.js + Supabase) and the
**Mobile app** (Flutter, same Supabase backend): every field on the Add
Income / Add Expense form, every field on the Outing forms, how transactions
and outing expenses are displayed, the complete database schema behind all of
it, and the exact save/read workflow for every scenario (plain transaction,
category split, friend split, outing expense, SMS auto-detect, settlement,
unlink, delete). It ends with a list of flows that are still missing or
incomplete. Written 2026-07-25.

---

## 1. Database schema — every table, fully explained

### 1.1 `transactions` — the ledger

The parent row for every income/expense entry. It stores **identity and the
total amount only** — it does not store per-category or per-purpose amounts
directly; those live in `transaction_splits` (§1.2).

| Field | Meaning |
|---|---|
| `id` | Primary key (uuid). |
| `user_id` | Owner of the transaction. |
| `account_id` | Which account (bank/cash/wallet/credit) the money moved through. |
| `merchant` | Display title — e.g. "Amazon", "Salary". |
| `total_amount` | The full transaction amount. Always the sum of all its `transaction_splits` rows. |
| `type` | `income` or `expense`. |
| `payment_method` | `UPI`, `Cash`, etc. — derived from the chosen account's type. |
| `source` | Where the row came from: `manual` (typed in), `mobile` (mobile app), `bank-sync`, `import`. |
| `entry_source` | Finer-grained: `manual`, `mobile-manual`, `sms-auto-detected`. |
| `transaction_date` | When the transaction happened (not when it was saved). |
| `month_key` | `YYYY-MM`, denormalized for fast month filtering. |
| `description` / `note` | Free-text notes. |
| `reference` / `reference_id` | UTR / free-text reference numbers. |
| `upi` | The UPI VPA or merchant identifier — used for merchant learning/matching, not for display. |
| `raw_identifier` | A stable lookup key, usually the same as `upi`. |
| `status` | `completed`, `pending`, `failed`, `refunded`. |
| `has_splits` | `true` when this transaction has more than one `transaction_splits` row (a category or friend split). |
| `tags` | Free-form tags, e.g. `outing-unlinked`, `outing-rollup`, `bank:...`. |
| `outing_id` | Set when this transaction is linked to an outing (either a real trip or a hidden "quick split" — see §1.3). `null` = a normal, un-linked transaction. |
| `is_active` / `deleted_at` | Soft-delete — a deleted transaction is hidden, not removed, so it can be restored. |

### 1.2 `transaction_splits` — the real source of truth for amounts

Every transaction has **at least one** row here. A transaction with exactly
one row is a normal, unsplit entry. A transaction with two or more rows is a
**split transaction** (category split or friend split).

| Field | Meaning |
|---|---|
| `id` | Primary key. |
| `transaction_id` | Which transaction this row belongs to. |
| `user_id` | Owner. |
| `purpose_id` | Which budget bucket this slice of money belongs to (Personal, Home, etc — see `purposes`, §1.6). |
| `category_id` | Category name for this slice (e.g. "Shopping"). Stored as **text**, not a foreign key. |
| `contributor_id` | Who contributed this slice of *income* (household income only — see `contributors`, not detailed further here). |
| `outing_id` | Set only when this split row is tied to an outing expense (rare — most outing linkage happens via the parent transaction's `outing_id` and a separate `outing_expenses` row, §1.4). |
| `amount` | This slice's amount. All rows for one transaction must sum to `transactions.total_amount`. |
| `note` | Optional per-row note. |

Rows are written **atomically** together with the parent transaction via the
Postgres RPC `create_transaction_with_splits(p_transaction jsonb, p_splits jsonb)`,
so a transaction can never exist with zero splits or with splits that don't
belong to it.

### 1.3 `outings` — trips, dinners, and hidden "quick splits"

| Field | Meaning |
|---|---|
| `id` | Primary key. |
| `user_id` / `created_by` | Owner / creator. |
| `title` (read as `name` in the app) | Display name — e.g. "Kerala Trip 2026". |
| `type` (read as `category` in the app) | Free-text category — "Trip", "Temple", "Restaurant", etc. |
| `location` | Optional free text. |
| `budget` | Optional spending cap. |
| `start_date` / `end_date` | The outing's date range — used to decide which bank/SMS transactions can auto-link to it. |
| `members` (jsonb array) | `{ id, name, upiId?, friendId?, isCurrentUser? }` per member. `id` is a locally-generated id (not necessarily a real user/friend uuid), used everywhere else (expenses, settlements) to say "who". |
| `participants` | App-user ids, for outings shared with other signed-in users. |
| `status` | `active`, `completed`, or `cancelled`. Only `active` outings can receive auto-linked bank transactions. |
| `auto_add_mode` | Legacy toggle, effectively always `true` now — SMS-detection settings on mobile are what actually decide auto-add, not this field. |
| `total_spent` | A rollup total, kept in sync with the sum of this outing's `outing_expenses`. |
| `purpose_id` | The budget bucket this whole outing's spends are attributed to — set once, applied automatically to every expense in it. |
| `is_active` / `deleted_at` / `deleted_by` | Soft-delete. |
| `is_quick_split` *(new)* | `true` only for hidden outings auto-created when someone uses **Friend split** on a normal (non-trip) transaction. These never appear in the `/outings` list or any outing picker — they exist purely so the settlement math has somewhere to live. |

### 1.4 `outing_expenses` — one row per spend inside an outing

| Field | Meaning |
|---|---|
| `id` | Primary key. |
| `user_id` / `outing_id` | Owner / which outing. |
| `description` | What was bought. |
| `amount` | Total spent on this item. |
| `category_id` | Category name. |
| `expense_date` | When it happened. |
| `paid_by_member_id` | Which outing member (by their local `members[].id`) fronted the money. |
| `split_type` | `equally` (default — divide evenly), `solo` (payer keeps 100%, no one else owes), `custom` (manually entered per-member amounts), plus `percentage`/`shares` which the **mobile app can write but the web UI does not currently offer** (see §5). |
| `splits` (jsonb array) | `[{ memberId, amount }]` — how much each member owes for this one expense. |
| `source` | `manual` (typed in) or `bank-detected` (matched from an SMS/bank transaction). |
| `linked_transaction_id` | If this expense corresponds to a real ledger transaction, this points to it (so it isn't double-counted and can be unlinked later). A unique index on `(user_id, linked_transaction_id)` stops the same bank row from ever being linked twice, even if web-sync and mobile SMS both race to link it. |
| `is_active` / `deleted_at` | Soft-delete. |

### 1.5 `settlements` — "who paid whom back"

| Field | Meaning |
|---|---|
| `id` | Primary key. |
| `user_id` / `outing_id` | Owner / which outing this settlement belongs to. |
| `from_member_id` | Who paid. |
| `to_member_id` | Who received the money. |
| `amount` | How much. |
| `is_partial` | Whether this only covers part of what's owed. |
| `settled_date` | When it happened. |
| `note` | Optional. |
| `is_active` / `deleted_at` | Soft-delete. |

### 1.6 Supporting tables

- **`friends`** (`id, user_id, name, phone, email, upi, upi_ids[], is_active`) — your saved contacts, used to populate the outing member picker and the Friend-split picker.
- **`purposes`** (`id, user_id, name, is_default, is_active`) — budget buckets such as "Personal" or "Home". Every `transaction_splits` row and every outing has one.

### 1.7 RPCs (server-side functions) involved

- **`create_transaction_with_splits(p_transaction jsonb, p_splits jsonb)`** — inserts the parent `transactions` row and every `transaction_splits` row in one atomic call; also computes `has_splits` automatically (`true` when more than one split is passed).
- **`cascade_delete_outing(p_outing_id, p_user_id)`** — soft-deletes an outing and every `transactions` / `outing_expenses` / `settlements` row linked to it, in one atomic call.
- **`restore_deleted_outing(p_outing_id, p_user_id)`** — the reverse, used by Settings → Data & Backups → Deleted Outings.

> ⚠️ **Live database gap:** `cascade_delete_outing` and `restore_deleted_outing`
> exist in the migration file `supabase/migrations/20260736_outing_cascade_soft_delete.sql`
> but were only **partially** applied to the actual live Supabase project — the
> column changes ran, but the two functions themselves were never created
> (confirmed directly against the live REST API: both currently return
> `PGRST202 function not found`). Until that migration's function-creation SQL
> (lines 34–96) is run in the Supabase SQL editor, **deleting a whole outing
> silently does nothing**. The new `supabase/migrations/20260738_outing_quick_split.sql`
> (adds the `is_quick_split` column used by Friend split) also still needs to
> be applied the same way.

---

## 2. Add Income / Add Expense form — Web (`AddTransactionSlideOver.tsx`)

This one component handles both "Add Income" and "Add Expense" everywhere in
the web app (Dashboard, Transactions page, and inside an outing), and also
doubles as the editor for outing expenses.

### 2.1 Fields, top to bottom, with full explanation

1. **Expense / Income toggle** — a two-way pill switch at the top. Changes which category list and which color accent (red for expense, green for income) apply below.
2. **Amount** — the total value of the transaction. Required, must be a positive number. This is the number every split (category or friend) must add up to.
3. **Merchant / Title** — free text, required. E.g. "Amazon", "Salary".
4. **UPI / Identifier** *(optional)* — a lookup key (UPI VPA, phone number, etc.) used for merchant learning/matching across future transactions. Not shown as the display title.
5. **Category** — a dropdown of categories filtered by the current type (expense categories vs income categories). Required.
6. **Account** — which account (bank/cash/wallet) the money moved through. Required; defaults to your default account.
7. **"Who is this for?"** — a Me / Trip toggle, **defaults to Me**.
   - **Me**: this is a normal personal transaction (the rest of the form below applies).
   - **Trip**: this transaction belongs to an active outing instead. Switching to Trip reveals:
     - **Outing** picker (only active outings, and hidden "quick split" outings are excluded).
     - **Paid by** — which outing member fronted the money (defaults to you).
     - **Split** — `Split` (equally), `Solo` (payer keeps it all), or `Custom` (type an amount per member; a running "Allocated ₹X / ₹Y" total must match the transaction amount before you can save).
     - In Trip mode, the ordinary Purpose field is hidden — the outing's own Purpose is applied automatically.
8. **"Split this transaction"** *(new feature)* — only shown in **Me** mode, and only when adding a brand-new transaction (not while editing one). A switch, **defaults to off** — off means the transaction behaves exactly as before: one owner, no split. Turning it on reveals a **Category vs Friend** toggle:
   - **Category split** — for dividing one purchase across your own budget buckets. E.g. a ₹1000 store trip that's ₹600 Personal and ₹400 Family. Shows a list of rows, each with a **Purpose** dropdown and an **Amount** field; starts with two blank rows, and you can add more with "Add split". A running total at the bottom must exactly equal the transaction Amount before you can save (at least 2 rows required).
   - **Friend split** — for dividing one purchase between you and one or more friends, without creating a full trip. Shows a row of friend chips to tap-select, then a **Split equally / Custom** choice. Equally divides the amount across you + selected friends; Custom shows one amount field per person with the same running-total validation as above.
9. **Purpose** — which budget bucket this transaction belongs to (Personal, Home, etc). Only shown in Me mode — Trip mode inherits the outing's Purpose automatically.
10. **Contributor** — who in the household contributed this income. Only shown for **income** transactions, and only if more than one contributor is configured (otherwise it's silently "Me").
11. **Past transaction** — a switch, **defaults to off**. Off = the transaction is timestamped "now". Turning it on reveals **Date** and **Time** pickers so you can backdate an entry.
12. **Notes** — free multi-line text, optional.
13. **Save / Update** button (label changes to "Save expense"/"Save income"/"Update"), plus a **Delete** button when editing an existing transaction.

### 2.2 Save flow — step by step

**Plain "Me" transaction (no split):**
1. You tap Save → `submit()` runs a duplicate-transaction check (same amount/account/date within a short window) and shows a warning if one is found.
2. `commitSubmit()` builds the full payload (all the fields above) and calls the page's `onSubmit` prop (each screen — Dashboard, Transactions page — wires its own `onSubmit`, e.g. `TransactionsPage.handleSubmit`).
3. That handler calls `addTransaction()` (new) or `updateTransaction()` (editing) in `src/lib/supabase-data.ts`.
4. `addTransaction()` resolves the account/purpose/contributor to real ids, then calls the `create_transaction_with_splits` RPC with **exactly one** split row.
5. The parent `transactions` row and its single `transaction_splits` row are created atomically; the UI's cached transaction list is refreshed.

**Category split:**
Same steps 1–3, except `commitSubmit()` builds a `splits` array — one entry per Purpose/Amount row you filled in — and includes it in the payload. In step 4, `addTransaction()`/`updateTransaction()` detect more than one split was provided and insert **all of them** via the same RPC in a single call, and `has_splits` is set to `true` automatically. Nothing about how the transaction is *displayed* needed to change — `TransactionDetailPanel.tsx` already shows a "Splits" breakdown list (purpose · category · amount) whenever a transaction has more than one split; that code just hadn't been exercised until this feature existed.

**Friend split:**
This path **does not** go through the page's `onSubmit` prop at all — it's handled entirely inside `AddTransactionSlideOver.tsx` by `handleFriendSplitSubmit()`, the same architectural pattern already used for Trip mode:
1. Create the plain transaction first (`addTransaction`, called directly) — this gives a real transaction `id`.
2. Create a **hidden outing** (`addOuting`) with `members = [You, ...the friends you picked]`, `isQuickSplit: true`, and a one-day date range around today. This outing never shows up anywhere in the Outings UI.
3. Compute each member's share (`buildExpenseSplits`, the same function outing expenses use — equally or custom).
4. Create one `outing_expenses` row for this hidden outing, with `linkedTransactionId` pointing back to the transaction from step 1.
5. Update the transaction (`updateTransaction`) so its `outing_id` now points at the hidden outing — this is what makes "Unlink from outing" and the linked-outing pill in the transaction detail view work correctly, exactly as if it were a real trip.
6. Refresh cached queries, close the form.

---

## 3. Add Income / Add Expense form — Mobile / App (`add_transaction_sheet.dart`)

Same concept as the web form, built in Flutter, and kept as close to field-parity as possible.

### 3.1 Fields, top to bottom

1. **Expense/Income toggle** — default Expense.
2. **Amount** — large numeric field, required.
3. **Merchant / Title** — required.
4. **UPI / Identifier** — optional.
5. **Category** — chip row (tap to select), plus an "Other/Add" chip for custom categories.
6. **Account** — horizontal selector.
7. **"Who is this for"** — Me / Trip chip pair, field name `_isTripMode`, **default `false`** (Me). The Trip chip is **disabled** unless there is currently one open outing — mobile is stricter than web here and only supports **one** open trip at a time, with no picker.
8. **Split UI — Trip mode only**: Split (equally, default) / Solo / Custom chips; Custom reveals a per-member amount field for every outing member with a live "Allocated ₹X / ₹Y" label, same validation idea as web.
9. **Purpose** — horizontal selector; hidden entirely in Trip mode (inherits the outing's purpose).
10. **Contributor** — horizontal selector, income only, only if more than one contributor exists.
11. **Past-transaction toggle** — `_isPastTransaction`, **default `false`**; reveals Date + Time pickers when on.
12. **Notes** — optional multi-line field.
13. **Save button** — "Save expense" / "Save income".

### 3.2 Save flow

Mirrors the web app's non-split path exactly: Me mode writes a plain
`transactions` row; Trip mode writes an `outing_expenses` row directly (no
plain transaction row at all — same "one rollup ledger line per outing"
design as web).

### 3.3 What's missing on mobile

There is currently **no Category-split or Friend-split UI** on mobile — that
part of the feature only exists on web so far. Porting it is a planned
follow-up once the web version has been confirmed working (see §6).

---

## 4. Outings — every form field and every workflow, fully explained

### 4.1 Create an outing

**Web (`CreateOutingModal.tsx`):**
- **Outing name** — required free text, e.g. "Kerala Trip 2026".
- **Category** — chips (Trip, Temple, Restaurant, Movies, Family, Work, Other) plus a way to type and save your own; defaults to "Trip".
- **Purpose** — chips, one of your configured budget buckets; defaults to Personal. This purpose is then applied automatically to every expense added inside the outing, so you're never asked to pick a purpose per-item while the trip is active.
- **Start date** / **End date** — the outing's active window; this is what bank/SMS transactions are matched against for auto-linking.
- **Location** — optional free text.
- **Budget** — optional spending cap, shown as a progress bar on the outing detail page.
- **Members** — "You" is always added automatically and can't be removed. You then toggle friends on/off from your saved Friends list, or type a custom name for someone who isn't a saved friend yet.
- **Editing an existing outing hides the Members section entirely** — by design, not a bug. Changing membership after expenses/settlements already reference specific member ids risks orphaning that data, so membership is locked in at creation time.

**Mobile (`create_outing_sheet.dart`)**, same idea with slightly different defaults:
- **Trip Title** (required), **Category** (dropdown + "Add new category" dialog, default "Trip"), **Location** (optional), **Purpose** (dropdown, default "Personal"), **Budget** (optional), **Start/End date** (default: today → today + 2 days), **Members** (quick-add-by-name field, "pick from contacts" screen, plus a chip list of saved friends to toggle).

### 4.2 Adding an expense inside an outing

- **Manual entry**: the same Add Transaction form in Trip mode (web) or the Trip-mode Add Transaction sheet (mobile). This writes an `outing_expenses` row directly — it deliberately does **not** create a second plain `transactions` row for every item, because that would flood your personal ledger with every ₹200 snack on a trip. Instead, the outing keeps a single rolled-up "Outing total" ledger line that's kept in sync with the sum of all its expenses (`syncOutingRollup` on web, the equivalent on mobile) — that's the one line you'll see on your normal Transactions list, alongside a click-through to the full itemized outing.
- **Automatic, from a bank/SMS transaction (mobile only)**: when an SMS is parsed, `ActiveOutingHelper.resolve()` checks whether there's a currently `active` outing whose date range includes the SMS's date. If so:
  - A **known merchant** (one you've confirmed before) is silently auto-added to that outing.
  - A **new/unrecognized merchant** is held as a pending transaction and you get a notification asking you to confirm it — the outing link is carried along either way, so confirming it also confirms the outing attachment.
- **Web-side safety net**: even without depending on mobile's own linking, `useOutingTransactionSync.ts` on the web continuously re-checks every bank/SMS/import-sourced transaction against active outings by date range and re-attaches it if needed — so linkage is self-healing across platforms. It deliberately skips manual web entries (those only join an outing if you explicitly pick one) and skips hidden `is_quick_split` outings (so an unrelated bank transaction can never accidentally land inside someone's one-off Friend split).

### 4.3 How the split math works ("you spent ₹1000, you get back ₹500")

For a ₹1000 expense split equally between 2 members:
- Each member's **share** is ₹500 (`buildEqualSplits` — divides evenly, any rounding remainder goes to the first member so the total always matches exactly).
- If you paid the full ₹1000, your **net balance** is +₹500 (you're owed ₹500 back) — this is what "Your return amount — pending" shows.
- Across an entire outing with many expenses, `computeMemberBalances` nets every expense and every settlement together per member, `computeTripSummary` produces the headline totals (`totalSpent`, `yourShare`, `pendingSettlements`), and `simplifyDebts` collapses a tangle of individual IOUs into the minimum number of actual payments needed (e.g. instead of "A owes B ₹200 and B owes A ₹150", it nets to just "A owes B ₹50").
- This is displayed as metric cards at the top of the outing page ("Total trip spent", "Total your spent", "Your return amount", "Returned amount") and as a colored pill next to each member ("Settled" / "+₹X you're owed" / "Owes ₹X").

### 4.4 Recording a settlement (someone paying back what they owe)

**Web (`RecordSettlementDialog.tsx`)** — the who/whom/outing context is already known from where you opened the dialog (an outing's Activity tab, or a Friend's page); the only field you fill in is:
- **Amount (₹)** — pre-filled with the suggested full amount owed, editable for a partial payment.

Confirming it:
1. Writes a `settlements` row.
2. Writes a matching personal ledger `transactions` row (category "Settlements") so it shows up in your normal spending history too.
3. If your own remaining share of the outing hasn't been logged as a rollup transaction yet, prompts you to do that as well.

**Mobile (`friends_screen.dart`)** has two sheets:
- **Record payment** (`_ReturnConfirmSheet`) — shows Friend / Outing / Expense / their share / already received / still pending as read-only context, then: **Amount this time** (with a "Max" shortcut button that fills the full remaining amount — this doubles as the partial-payment control, there's no separate toggle), **Payment type** (Cash / Online / UPI, defaults to Online), and **Credit to account**. There is no date field (it always uses right now) and no note field.
- **Mark All Paid** (`_ReturnAllSheet`) — shows the total pending amount and a single confirm button that settles everything owed by that friend in one action.

### 4.5 Unlinking a transaction from an outing

"Unlink" means: keep the ledger transaction, but disconnect it from the
outing and stop treating it as a shared/split expense. What actually happens:
1. The transaction's `outing_id` is cleared.
2. It's tagged `outing-unlinked` so the auto-link sync (§4.2) will never silently reattach it later.
3. The corresponding `outing_expenses` row is deleted.
4. The outing's rollup total is recalculated without it.

On web this is available both from the Transactions page (`handleUnlinkOuting`)
and from inside the outing itself (`handleUnlinkExpense` in `TripDetailPage`).
On mobile, the same action is behind a confirmation dialog
(`outing_unlink_dialog.dart`). After unlinking, the transaction shows up as a
completely normal, single-owner, unsplit transaction — exactly like one that
was never part of an outing at all. (Note: if it was a shared/friend split,
the *history* of who owed what for it is not carried over into a
`transaction_splits` breakdown after unlinking — it simply becomes a plain
transaction. See the gap list in §6.)

### 4.6 Deleting things

- **A single expense inside an outing**: clicking Delete now opens a
  confirmation dialog first (this used to delete immediately with no
  confirmation — fixed). If the expense was shared across more than one
  member, the dialog specifically warns that deleting it will change
  everyone's settlement balances. Confirming it removes the `outing_expenses`
  row, unlinks/tags the ledger transaction if there was one, and resyncs the
  outing's rollup total.
- **An entire outing**: clicking Delete opens a confirmation dialog explaining
  that the outing and everything linked to it will be removed. Confirming it
  calls the `cascade_delete_outing` RPC, which — in one atomic database
  transaction — soft-deletes the outing itself plus every `transactions`,
  `outing_expenses`, and `settlements` row that belonged to it. Nothing is
  permanently destroyed; it can be brought back later from **Settings → Data
  & Backups → Deleted Outings**, which calls the matching `restore_deleted_outing`
  RPC. **This whole-outing delete currently does nothing in production** until
  the RPC functions are applied to the live database — see the warning in §1.7.

---

## 5. How transactions and outing expenses are displayed

- **Transaction list** (Transactions page / Dashboard recent list): each row shows merchant, category, amount, account, date. A transaction linked to an outing shows a small trip indicator; nothing extra shows for a category/friend split at the list level.
- **Transaction detail panel** (`TransactionDetailPanel.tsx`, opened by tapping a row): shows category, purpose, account, payment method, source, status, contributor, reference, note. If the transaction is linked to an outing, a card at the top links straight to that outing's page and offers "Unlink from outing" (with the shared-split warning dialog described in §4.5 if relevant). If the transaction has more than one split, a **"Splits"** section lists every purpose/category/amount row underneath, so a category-split or friend-split transaction is fully transparent from this one screen.
- **Outing expense detail** (`OutingExpenseDetailSheet.tsx`, opened from inside an outing): shows the amount, category, expense date, account, who paid, "your share" of it, and the split mode (Split/Solo/Custom). If the expense is linked to a ledger transaction, an "Unlink from outing" button is shown; Edit and Delete (now with confirmation) are always available.
- **Outing detail page** (`TripDetailPage.tsx`): the metric cards and per-member balance pills described in §4.3, plus separate "Automatically detected" vs "Manually added" spend totals, and Export to PDF/CSV.

---

## 6. What's still missing or incomplete

| Gap | Where it lives | What needs to happen |
|---|---|---|
| `cascade_delete_outing` / `restore_deleted_outing` not actually live | Supabase project | Run `20260736_outing_cascade_soft_delete.sql` (lines 34–96, the function-creation part) in the Supabase SQL editor |
| `is_quick_split` column not live | Supabase project | Run the new `20260738_outing_quick_split.sql` |
| No Category-split / Friend-split UI on mobile | `add_transaction_sheet.dart` | Planned follow-up — port the web toggle once confirmed working |
| `percentage` / `shares` split types exist at the database level (mobile can write them) but the web app's `SplitType` only understands `equally` / `solo` / `custom` | `src/types/index.ts`, `TripDetailPage.tsx`, `AddTransactionSlideOver.tsx` | Either add the two extra split types to the web UI/math, or document them as mobile-only intentionally |
| `fetchOutingSettlements()` doesn't filter out soft-deleted rows (`is_active`) the way every other fetch does | `src/lib/supabase-data.ts` | Add the missing filter — not currently visible as a bug because every caller already scopes to one active outing, but it's a landmine for any future "all settlements" view |
| Outing `total_spent` rollup can lag behind the live sum of its expenses under some timing conditions | tracked as `BUG-TRIP-02` / `SYNC-09` in `bugs/BUGS.md` | Re-verify once §1.7's migration is applied |
| Can't edit an outing's member list after it's created | `CreateOutingModal.tsx` | Intentional limitation (protects existing expense/settlement references) — would need a deliberate migration path if ever requested |
| Friend split only works when **creating** a new transaction, not while editing an existing one | `AddTransactionSlideOver.tsx` (`canOfferSplit`) | Scoped out to keep the first version simple — can be extended later |
| Unlinking a friend-split transaction from its hidden outing doesn't preserve a record of who owed what as a `transaction_splits` breakdown — it just becomes a plain transaction | Unlink flow (§4.5) | By design for now; would need a dedicated "friend split summary" field if that history needs to survive unlinking |
