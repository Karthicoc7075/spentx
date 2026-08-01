"use client";

import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { useShareViewLogger } from "@/hooks/useShareViewLogger";

export default function Page() {
  useShareViewLogger("dashboard");
  return <DashboardPage />;
}
