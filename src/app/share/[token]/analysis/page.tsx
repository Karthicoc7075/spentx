"use client";

import { AnalysisPage } from "@/components/analytics/AnalysisPage";
import { useShareViewLogger } from "@/hooks/useShareViewLogger";

export default function Page() {
  useShareViewLogger("analysis");
  return <AnalysisPage />;
}
