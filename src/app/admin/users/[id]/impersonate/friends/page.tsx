"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { FriendsPage } from "@/components/friends/FriendsPage";

export default function ImpersonatedFriendsPage() {
  return <FriendsPage />;
}
