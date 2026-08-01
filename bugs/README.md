# SpentX bugs folder

Verified **Web ↔ Flutter ↔ DB** issues only (from real code, not guesses).

## Files

| File | What |
|------|------|
| **[BUGS.md](./BUGS.md)** | Master tracker — all bug IDs + status (open / fixed / verify) |
| **[web-flutter-db-mismatch.md](./web-flutter-db-mismatch.md)** | Pass 1 full audit — field maps, pages, sync, glossary |
| **[MORE_BUGS.md](./MORE_BUGS.md)** | Pass 2 deep audit — transfers, splits, friends, accounts, plans, SMS |
| **[FIX_PASS_2026-07-25.md](./FIX_PASS_2026-07-25.md)** | What was fixed this pass + remaining work |

## Severity

| Level | Meaning |
|-------|---------|
| **P0** | Wrong money, data loss, or wrong amount/name across platforms |
| **P1** | Field / label / round-trip break |
| **P2** | Defaults, casing, secondary features |

## How to use

1. Scan **BUGS.md** for open **P0** first.  
2. Open the matching detail section in pass 1 or pass 2 docs.  
3. Fix web + app + DB mapping together when shared.  
4. Set status → `fixed` or `verify` in **BUGS.md**.

## Counts (approx.)

- Pass 1: transaction, outing, home/dashboard, activity, sync core  
- Pass 2: +transfers, multi-split, accounts, friends, plans, categories, receipts, dates, admin  

See **BUGS.md** for the live checklist.
