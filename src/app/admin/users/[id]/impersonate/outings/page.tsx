"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { OutingsPage } from "@/components/outings/OutingsPage";

export default function ImpersonatedOutingsPage() {
  return <OutingsPage />;
}
