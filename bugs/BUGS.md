# SpentX bug tracker — Web ↔ Flutter ↔ DB

**Status:** open | fixed | verify  
**Detail pass 1:** [web-flutter-db-mismatch.md](./web-flutter-db-mismatch.md)  
**Detail pass 2:** [MORE_BUGS.md](./MORE_BUGS.md)

---

## Transaction form / fields

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-TX-01 | P1 | open | UI label: web **Merchant / payee** vs app **TITLE / MERCHANT** — same DB `merchant` |
| BUG-TX-02 | P1 | open | **Description** only on web; Flutter has no field → never shown/synced |
| BUG-TX-03 | P1 | open | Payment: web **UPI** vs app **Online** (mapped; other methods collapse) |
| BUG-TX-04 | P1 | fixed | App always pushes `status: completed` (overwrites web pending/failed) |
| BUG-TX-05 | P2 | fixed | Tags not on mobile model; rollup via note only vs web tag `outing-rollup` |
| BUG-TX-06 | P1 | open | Purpose client id `"personal"` vs DB uuid — resolver required |
| BUG-TX-07 | P2 | fixed | Mobile pull title-cases account names (`HDFC` → `Hdfc`) |
| BUG-TX-08 | P0 | verify | Outing rollup amount can lag live expense sum in DB |

---

## Transfers

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-TR-01 | P0 | fixed | Transfer encoding: web **Settlements category** (no tag) vs app **tags `transfer`** |
| BUG-TR-02 | P1 | fixed | Web transfer never writes `tags: ['transfer']` |
| BUG-TR-03 | P1 | fixed | Transfer merchant strings differ (`Transfer to X` vs app styles) |

---

## Multi-split

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-SP-01 | P0 | fixed | Mobile pull keeps **first split only** (`putIfAbsent`); push `has_splits: false` |
| BUG-SP-02 | P1 | open | No multi-split UI on app — web multi-purpose expenses collapse |

---

## Accounts

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-ACC-01 | P1 | fixed | `opening_balance_date` web/DB only — not on mobile AccountMap |
| BUG-ACC-02 | P1 | open | Field name `last4` (web/DB) vs `last4Digits` (app) |
| BUG-ACC-03 | P2 | open | Account type casing bank/cash vs Bank/Cash |
| BUG-ACC-04 | P1 | open | Account `purpose_ids` web-only |

---

## Friends

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-FR-01 | P0 | fixed | Friend push mobile: **name/phone only** — UPI/email/notes dropped |
| BUG-FR-02 | P1 | open | Friend id: app v5(name) vs web random uuid → duplicate friends |

---

## Outing / trip

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-OUT-01 | P1 | fixed | `auto_add_mode` default: web/DB **false**, app **true** |
| BUG-OUT-02 | P1 | fixed | Mobile upsert forces `is_active: true` → can revive soft-deleted outings |
| BUG-OUT-03 | P2 | open | Member id: web uuid-ish vs app `"You"` / paid_by `"you"` |
| BUG-OUT-04 | P1 | fixed | Outing `cancelled` status → app maps only completed |
| BUG-OUT-05 | P1 | open | Settlements: web outing-level vs app per-expense + `exp:` note / FIFO |
| BUG-OUT-06 | P2 | fixed | Outing `budget` may not round-trip to app |
| BUG-OE-01 | P1 | open | Expense title: app `title` ↔ DB/web `description` (maps, labels differ) |
| BUG-OE-02 | P0 | fixed | Split type lossy: app only solo/equal; web custom/percentage/shares collapse |
| BUG-OE-03 | P1 | open | App `accountId` on expense stores **display name**, not uuid |
| BUG-TRIP-01 | P1 | fixed | Mobile rollup missing tag `outing-rollup` (note only) |
| BUG-TRIP-02 | P1 | open | `outings.total_spent` cache can lag true expense sum |

---

## Dashboard / Home / totals

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-HOME-01 | P1 | open | Period scope: web date filter vs app **this calendar month only** |
| BUG-HOME-02 | P1 | open | Unlinked outing cash: web all in range vs app only **paid by you** |
| BUG-HOME-03 | P0 | verify | Web Transactions strip vs Dashboard expense drift (period-totals fix) |
| BUG-NW-01 | P1 | open | Purpose net-worth opening attribution edge cases (Personal vs Home) |
| BUG-NW-02 | P2 | open | Legacy app account names Personal/Home vs real bank accounts |

---

## Transactions / Activity list

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-ACT-01 | P0 | open | Outing list: web rollup line vs app groups individuals differently |
| BUG-ACT-02 | P1 | open | Mobile list rollup detect = note only (misses tag-only rollups) |

---

## Wealth / Analysis / Plan / Categories / Receipts

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-WL-01 | P1 | open | Web investment category excluded from spend; app has no investment flag on txs |
| BUG-CAT-01 | P1 | open | `is_investment` not synced on mobile category map |
| BUG-CAT-02 | P2 | open | Mobile category create overwrites color/icon defaults |
| BUG-RC-01 | P1 | open | Receipt URL web-only — no app field |
| BUG-AN-01 | P1 | open | Analysis outing buckets (Trip/Temple) vs app expense categories only |
| BUG-PLAN-01 | P2 | open | Plan purpose name vs uuid can duplicate month plans |
| BUG-PL-01 | P1 | open | Plan allocation key plannedAmount vs planned_amount (dual-read OK) |
| BUG-PL-02 | P1 | open | Plan lock / daily_safe / savings_target / rollover web-only |
| BUG-PL-03 | P2 | open | Mobile may set expectedIncome from sum of category limits |
| BUG-SET-01 | P2 | open | Features only on one client (SMS mobile-only; admin web-only) |
| BUG-ADM-01 | P1 | open | Admin spend totals need migration `20260732` applied |

---

## Dates / contributors / SMS local

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-DT-01 | P1 | fixed | `month_key` local vs UTC near midnight → month filter drift |
| BUG-DT-02 | P2 | open | Date-only noon (web) vs full DateTime (app) sort order |
| BUG-CO-01 | P1 | open | Contributor name/uuid rename leaves wrong display |
| BUG-SMS-01 | P1 | open | Pending verification local-only (no server queue) |
| BUG-SMS-02 | P1 | open | rawMessage / SMS body not on transactions table |
| BUG-SMS-03 | P2 | open | Mobile `time` display string not in DB |

---

## Sync / backend

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| SYNC-01 | P0 | fixed | Description not on mobile model / push |
| SYNC-02 | P1 | fixed | Tags lossy on mobile push (no outing-rollup tag) |
| SYNC-03 | P1 | open | Status force-completed on mobile |
| SYNC-04 | P1 | fixed | Outing soft-delete resurrection on mobile upsert |
| SYNC-05 | P1 | fixed | Split type collapse on mobile pull |
| SYNC-06 | P2 | fixed | source/entry_source always mobile on app |
| SYNC-07 | P2 | open | Account type casing Bank/Cash vs bank/cash |
| SYNC-08 | P1 | open | category_id is name — rename doesn’t rewrite history |
| SYNC-09 | P0 | open | Rollup `total_amount` in DB can lag UI live total |
| SYNC-10 | P1 | open | Outing FK fail → push strips outing_id (unlink until heal) |
| SYNC-11 | P2 | open | Mobile edit of web row re-stamps source=mobile |

---

## UI labels

| ID | Sev | Status | Bug |
|----|-----|--------|-----|
| BUG-UI-01 | P2 | open | Transfer shown as Settlements (web) vs Transfer (app) |
| BUG-UI-02 | P2 | open | Period Inflow/Outflow vs Income/Expense chips |
| BUG-UI-03 | P2 | open | Outing name vs Title label |
| BUG-UI-04 | P2 | open | Merchant vs TITLE/MERCHANT |
| BUG-UI-05 | P2 | open | Description+Note (web) vs Note only (app) |

---

## Recommended fix order

1. Totals: HOME-*, HOME-03 verify  
2. Transfers: TR-01 … TR-03  
3. Multi-split: SP-01 (product rule or full support)  
4. Add form fields: TX-01 … TX-04, SYNC-01  
5. Activity outing lines: ACT-01, ACT-02, TRIP-01  
6. Friends UPI: FR-01  
7. Outings: OUT-*, OE-*, SYNC-10  
8. Accounts date: ACC-01  
9. Categories/investments/receipts: CAT-01, RC-01  
10. Dates month_key: DT-01  
11. Admin migration: ADM-01  

---

## Non-bugs (do not track as product defects)

- SMS detection only on Flutter  
- Admin / share / impersonation only on web  
- Hive offline lag until sync  
- `category_id` as name by design  
- Merchant = title = one DB column by design  

---

*Last updated: 2026-07-25 (pass 2 + fix pass — see FIX_PASS_2026-07-25.md)*
