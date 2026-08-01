-- Mobile app PIN is never stored in the database (device-local hash only).
-- When a user forgets their app PIN they can reset from web Settings → Security.
-- That only writes a timestamp; the next mobile sync clears the local PIN
-- and forces a new PIN setup. No PIN value is ever sent to the server.

alter table public.users
  add column if not exists app_pin_reset_at timestamptz;

comment on column public.users.app_pin_reset_at is
  'When set/updated from web, signed-in mobile app clears local PIN and requires a new one. The PIN itself is never stored server-side.';
