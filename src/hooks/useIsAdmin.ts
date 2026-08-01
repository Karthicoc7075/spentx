"use client";

import { useQuery } from "@tanstack/react-query";
import { isAdminUser } from "@/lib/admin";
import { fetchUserProfile } from "@/lib/supabase-data";
import { useSupabaseAuth } from "@/providers/supabase-provider";

// Client-side admin check, used only for UI affordances (showing the Admin
// nav entry, maintenance-mode bypass). The real enforcement is server-side:
// the /admin layout guard and require_admin() inside every admin RPC.
export function useIsAdmin() {
  const { user } = useSupabaseAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile-role", user?.id],
    queryFn: () => fetchUserProfile(user?.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  return {
    isAdmin: isAdminUser(user, profile ?? null),
    isLoading: Boolean(user?.id) && isLoading,
  };
}
