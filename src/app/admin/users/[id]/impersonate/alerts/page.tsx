"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import AlertsRoutePage from "@/app/(app)/alerts/page";

export default function ImpersonatedAlertsPage() {
  return <AlertsRoutePage />;
}
