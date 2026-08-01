"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export default function ImpersonatedDashboardPage() {
  return <DashboardPage />;
}
