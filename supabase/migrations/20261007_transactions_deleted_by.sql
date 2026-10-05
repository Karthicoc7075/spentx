-- Migration: 20261007_transactions_deleted_by.sql
-- Adds deleted_by column to public.transactions for parity with soft-delete metadata on other tables.

alter table if exists public.transactions
  add column if not exists deleted_by uuid references auth.users(id);
