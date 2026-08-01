"use client";

import { TransactionsPage } from "@/components/transactions/TransactionsPage";
import { useShareViewLogger } from "@/hooks/useShareViewLogger";

export default function Page() {
  useShareViewLogger("transactions");
  return <TransactionsPage />;
}
