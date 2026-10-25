-- Detection v2 Phase 3: admin block rules apply to SMS only, unless this
-- flag is set on the row. Additive, non-destructive. NOT run automatically:
-- Karthi runs this manually after review.
alter table public.sms_block_rules
  add column if not exists applies_to_notifications boolean not null default false;

comment on column public.sms_block_rules.applies_to_notifications is
  'Detection v2 Phase 3: when true, this admin block rule also blocks app notifications (default: SMS only).';
