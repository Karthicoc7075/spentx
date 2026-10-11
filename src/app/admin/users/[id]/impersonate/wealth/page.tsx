"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { WealthPage } from "@/components/wealth/WealthPage";

export default function ImpersonatedWealthPage() {
  return <WealthPage />;
}
