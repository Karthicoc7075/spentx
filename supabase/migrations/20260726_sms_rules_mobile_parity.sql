-- Align admin SMS rule tables with fields the mobile app already uses
-- when users train detection / block / template rules on device.

-- Detection (regex) rules — mobile SmsRule fields
alter table public.sms_detection_rules
  add column if not exists sample_message text not null default '',
  add column if not exists name_pattern text not null default '',
  add column if not exists date_pattern text not null default '',
  add column if not exists ref_pattern text not null default '',
  add column if not exists account_pattern text not null default '',
  add column if not exists upi_pattern text not null default '';

-- Template rules — training sample used on mobile
alter table public.sms_template_rules
  add column if not exists sample_message text not null default '',
  add column if not exists similarity_threshold numeric(4,3) not null default 0.65;

-- Block rules — sample SMS that was blocked/trained
alter table public.sms_block_rules
  add column if not exists sample_message text not null default '';

comment on column public.sms_detection_rules.sample_message is
  'Example SMS used when training the rule (mobile parity).';
comment on column public.sms_block_rules.sample_message is
  'Example SMS that should be blocked (OTP / promo / etc).';
