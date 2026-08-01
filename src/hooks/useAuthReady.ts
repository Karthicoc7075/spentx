"use client";

import { useSupabaseAuth } from "@/providers/supabase-provider";

export function useAuthReady() {
  const { user, isConfigured, isLoading: authLoading } = useSupabaseAuth();

  return {
    user,
    isConfigured,
    isReady: !isConfigured || !authLoading,
    authLoading,
  };
}