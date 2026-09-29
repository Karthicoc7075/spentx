"use client";

import { useSupabaseAuth } from "@/providers/supabase-provider";

export function useAuthReady() {
  const { user, authUser, isConfigured, isLoading: authLoading } = useSupabaseAuth();

  return {
    user,
    authUser,
    isConfigured,
    isReady: !isConfigured || !authLoading,
    authLoading,
  };
}