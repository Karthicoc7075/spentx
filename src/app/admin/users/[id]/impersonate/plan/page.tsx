"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { PlanPage } from "@/components/plan/PlanPage";

export default function ImpersonatedPlanPage() {
  return <PlanPage />;
}
