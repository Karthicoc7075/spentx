"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { AnalysisPage } from "@/components/analytics/AnalysisPage";

export default function ImpersonatedAnalysisPage() {
  return <AnalysisPage />;
}
