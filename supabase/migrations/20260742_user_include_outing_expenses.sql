-- Add include_outing_expenses column to public.users table (default true)
alter table public.users
  add column if not exists include_outing_expenses boolean not null default true;

comment on column public.users.include_outing_expenses is
  'Whether dashboard analytics and personal finance reports include outing totals (default true).';
