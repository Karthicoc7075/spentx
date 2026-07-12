"use client";

import { useEffect, useRef } from "react";
import { fetchOutingExpenses, saveOutingExpense } from "@/lib/firebase";
import {
  buildOutingExpenseFromTransaction,
  getOutingCandidatesForTransaction,
} from "@/lib/outing-sync";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useOutings } from "@/hooks/useOutings";
import { useTransactions } from "@/hooks/useTransactions";

export function useOutingTransactionSync() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { transactions } = useTransactions();
  const { outings } = useOutings();
  const syncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isConfigured || !isReady || !user?.id) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        const activeOutings = outings.filter(
          (outing) => outing.status === "active" && outing.autoAddMode,
        );
        if (!activeOutings.length || !transactions.length) return;

        const existingExpenses = await fetchOutingExpenses(user.id);

        for (const transaction of transactions) {
          const syncKey = `${transaction.id}`;
          if (syncedRef.current.has(syncKey)) continue;

          const candidates = getOutingCandidatesForTransaction(
            transaction,
            activeOutings,
            existingExpenses,
          );

          for (const outing of candidates) {
            const payload = buildOutingExpenseFromTransaction(outing, transaction);
            if (!payload) continue;

            await saveOutingExpense(user.id, {
              ...payload,
              id: crypto.randomUUID(),
              userId: user.id,
            });
            existingExpenses.push({
              ...payload,
              id: crypto.randomUUID(),
              userId: user.id,
            });
          }

          if (candidates.length > 0) {
            syncedRef.current.add(syncKey);
          }
        }
      })();
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [isConfigured, isReady, outings, transactions, user?.id]);
}