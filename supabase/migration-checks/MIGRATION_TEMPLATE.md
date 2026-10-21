# Migration template (Phase S5b) — every Supabase migration follows this

Companion files live **outside** `supabase/migrations/` (the CLI would treat
any `<timestamp>_*.sql` there as a migration):

```
supabase/migrations/<stamp>_<name>.sql                 the migration (unchanged)
supabase/migration-checks/<stamp>_<name>/precheck.sql  read-only, run first
supabase/migration-checks/<stamp>_<name>/verify.sql    read-only, run after
supabase/migration-checks/<stamp>_<name>/rollback.sql  undo, generated BEFORE
```

## Order (never skip a step)

1. `supabase/backup/backup.sh` (or dashboard download + `verify.sql`) → copy off-machine.
2. `precheck.sql` → every row `ok = true`, else stop.
3. Generate `rollback.sql` **now** from live with
   `capture_rollback.sql` (fill the five arrays with the functions, triggers,
   policy tables, constraints and granted tables the migration touches; save
   the `stmt` column in `ord` order inside `begin; … commit;`). Add explicit
   undo for data changes (backfills) and `drop` for new objects.
4. Run the migration (SQL editor, one transaction where possible).
5. `verify.sql` → every row `ok = true`.
6. `supabase/backup/verify.sql` → every `data_md5` equal to step 1 unless the
   migration is meant to change data (then explain which and why); counts,
   nulls, balances per account and user rule counts checked.
7. Anything wrong → `rollback.sql`, then steps 5–6 again against step 1.

## precheck.sql must check

- the migration is not already applied (or is safe to re-run);
- objects it depends on exist; data it assumes holds (no nulls/duplicates);
- the fingerprint `rollback.sql` was generated from still matches live;
- how many rows a backfill will touch.

## verify.sql must check

- every new/changed object exists with the right definition, grants, RLS;
- no new nulls / orphans; balances per account and user rule counts unchanged
  (via `supabase/backup/verify.sql`).

## rollback.sql must

- restore captured definitions exactly (not hand-written guesses);
- undo backfills precisely (or say why it cannot and point to the backup);
- never drop tables/columns holding data unless explicitly decided — keep
  such lines commented with `-- DATA LOSS`.
