-- Outings pick a Purpose (Personal/Family/custom) once, at create time —
-- every transaction generated for that outing (the "Outing total" rollup,
-- and any bank-detected spend auto-linked to it) inherits it automatically,
-- so the user is never asked to pick a purpose per-transaction while the
-- outing is active.

alter table public.outings
  add column if not exists purpose_id uuid references public.purposes(id) on delete set null;

comment on column public.outings.purpose_id is
  'Purpose applied to this outing''s rollup + auto-linked transactions. Null = default to Personal.';
