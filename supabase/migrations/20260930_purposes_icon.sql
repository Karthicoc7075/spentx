-- Add icon column to purposes table for custom purpose visual icons
alter table public.purposes add column if not exists icon text;
