"use client";

import { useFirebase } from "@/providers/firebase-provider";

export function useAuthReady() {
  const { user, isConfigured, isLoading: authLoading } = useFirebase();

  return {
    user,
    isConfigured,
    isReady: !isConfigured || !authLoading || !!user,
    authLoading,
  };
}