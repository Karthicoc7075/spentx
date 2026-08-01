"use client";

// Impersonation: renders the EXACT same page component the target user
// sees — identity/scoping comes from ImpersonationShell's providers.
import { TransactionsPage } from "@/components/transactions/TransactionsPage";

export default function ImpersonatedTransactionsPage() {
  return <TransactionsPage />;
}
