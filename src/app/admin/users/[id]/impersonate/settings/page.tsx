"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { SettingsPage } from "@/components/settings/SettingsPage";

export default function ImpersonatedSettingsPage() {
  return <SettingsPage />;
}
