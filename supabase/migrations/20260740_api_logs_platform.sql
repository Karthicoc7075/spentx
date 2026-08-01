-- Add platform and app_version columns to user_api_logs for Web/Mobile tracking
alter table public.user_api_logs
  add column if not exists platform text check (platform in ('web', 'android', 'ios')),
  add column if not exists app_version text,
  add column if not exists request_id uuid default gen_random_uuid();

comment on column public.user_api_logs.platform is
  'Client platform: web, android, or ios.';

comment on column public.user_api_logs.app_version is
  'Client application version string (e.g. 1.0.0+42).';

comment on column public.user_api_logs.request_id is
  'Unique request identifier for correlation across logs.';

create index if not exists user_api_logs_platform_idx
  on public.user_api_logs (platform, created_at desc);
