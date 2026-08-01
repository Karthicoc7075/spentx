"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  addTransaction,
  deleteTransaction,
  fetchOutingExpenses,
  saveOuting,
  saveOutingExpense,
  updateTransaction,
} from "@/lib/supabase-data";
import {
  buildOutingExpenseFromTransaction,
  getOutingCandidatesForTransaction,
} from "@/lib/outing-sync";
import {
  buildOutingRollupDraft,
  computeOutingRollupAmount,
  computeOutingUserPaidAmount,
  findAllOutingRollupTransactions,
  latestOutingExpenseDate,
} from "@/lib/outings";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useOutings } from "@/hooks/useOutings";
import { useTransactions } from "@/hooks/useTransactions";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { OutingExpense } from "@/types";

/**
 * Keeps the Transactions-page "Outing total" rollup row in sync with real
 * outing_expenses (and linked ledger rows).
 *
 * Critical case: mobile updates an outing expense amount → NW / Wealth /
 * Outing detail already use expenses (correct), but the Transactions list
 * shows a separate rollup transaction that must be rewritten here.
 */
export function useOutingTransactionSync() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const { user, isConfigured, isReady } = useAuthReady();
  const { transactions } = useTransactions();
  const { outings } = useOutings();
  const { expenses: watchedExpenses } = useAllOutingExpenses();
  const { accounts } = useAccounts();
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const lastFingerprintRef = useRef<string>("");

  const defaultAccountName =
    accounts.find((account) => account.isDefault)?.name ??
    accounts[0]?.name ??
    "Cash";

  useEffect(() => {
    if (isAdminRoute) return;
    if (!isConfigured || !isReady || !user?.id) return;
    if (!outings.length) return;

    // Fingerprint MUST include outing expense amounts — mobile often edits
    // expenses without touching the ledger, so transactions-only fingerprint
    // would skip rollup updates (stale amount on Transactions page).
    const txFp = transactions
      .map(
        (t) =>
          `${t.id}:${Number(t.totalAmount ?? t.amount ?? 0)}:${t.outingId ?? ""}:${t.merchant}`,
      )
      .join("|");
    const expFp = watchedExpenses
      .map(
        (e) =>
          `${e.id}:${e.outingId}:${Number(e.amount)}:${e.description}:${e.linkedTransactionId ?? ""}`,
      )
      .join("|");
    const fingerprint = `${txFp}::${expFp}::${outings.map((o) => o.id).join(",")}`;
    if (fingerprint === lastFingerprintRef.current) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        try {
          const activeAutoOutings = outings.filter(
            (outing) => outing.status === "active",
          );

          // Always re-fetch expenses so we never recompute from a stale cache
          // after a mobile edit lands in Postgres.
          let existingExpenses = await fetchOutingExpenses(user.id);
          let changed = false;
          const workingTransactions = [...transactions];

          // ── 1) Link new bank/SMS rows + keep linked expense amounts fresh ──
          for (const transaction of transactions) {
            if (transaction.type !== "expense") continue;

            const linked = existingExpenses.find(
              (e) => e.linkedTransactionId === transaction.id,
            );

            if (linked) {
              const txAmount = Number(
                transaction.totalAmount ?? transaction.amount ?? 0,
              );
              const nextDescription =
                transaction.merchant || linked.description;
              const nextCategory = transaction.category || linked.category;
              const nextAccount =
                transaction.accountName ||
                transaction.account ||
                linked.accountName;
              const nextMode =
                transaction.paymentMethod ||
                transaction.paymentType ||
                linked.paymentMode;
              const needsUpdate =
                Math.abs(Number(linked.amount) - txAmount) >= 0.01 ||
                linked.description !== nextDescription ||
                linked.category !== nextCategory ||
                (nextAccount && linked.accountName !== nextAccount) ||
                (nextMode && linked.paymentMode !== nextMode);

              if (needsUpdate && txAmount > 0) {
                const updated: OutingExpense = {
                  ...linked,
                  amount: txAmount,
                  description: nextDescription,
                  category: nextCategory,
                  accountName: nextAccount,
                  paymentMode: nextMode,
                  date: (
                    transaction.transactionDate ??
                    transaction.date ??
                    linked.date
                  ).slice(0, 10),
                };
                try {
                  const saved = await saveOutingExpense(user.id, updated);
                  existingExpenses = existingExpenses.map((e) =>
                    e.id === saved.id ? saved : e,
                  );
                  changed = true;
                } catch {
                  // continue — still recompute rollup from fetched data
                }
              }
              continue;
            }

            const pool = transaction.outingId ? outings : activeAutoOutings;
            if (!pool.length) continue;

            const candidates = getOutingCandidatesForTransaction(
              transaction,
              pool,
              existingExpenses,
            );
            if (candidates.length === 0) continue;

            const outing = candidates[0];
            const payload = buildOutingExpenseFromTransaction(
              outing,
              transaction,
            );
            if (!payload) continue;

            try {
              const saved = await saveOutingExpense(user.id, {
                ...payload,
                id: crypto.randomUUID(),
                userId: user.id,
              });
              existingExpenses = [...existingExpenses, saved];
              changed = true;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (message.includes("outing_expenses_user_linked_tx_uidx")) {
                existingExpenses = await fetchOutingExpenses(user.id);
              }
            }

            if (transaction.outingId !== outing.id) {
              // Auto-linking to an outing also adopts its Purpose, so the
              // user is never asked to pick one for outing-linked spends.
              await updateTransaction(user.id, transaction.id, {
                outingId: outing.id,
                ...(outing.purposeId ? { purposeId: outing.purposeId } : {}),
              });
              const idx = workingTransactions.findIndex(
                (item) => item.id === transaction.id,
              );
              if (idx !== -1) {
                workingTransactions[idx] = {
                  ...workingTransactions[idx],
                  outingId: outing.id,
                  ...(outing.purposeId ? { purposeId: outing.purposeId } : {}),
                };
              }
              changed = true;
            }
          }

          // ── 2) Always recompute Transactions "Outing total" rollup ──
          for (const outing of outings) {
            const outingId = outing.id;
            const outingExpenses = existingExpenses.filter(
              (expense) => expense.outingId === outingId,
            );
            // Personal ledger row = what THIS user paid; the outing's own
            // total_spent stays the full trip spend across all members.
            const tripTotal = computeOutingRollupAmount(
              outingExpenses,
              undefined,
              workingTransactions,
              outingId,
            );
            const amount = computeOutingUserPaidAmount(
              outing,
              outingExpenses,
              workingTransactions,
              outingId,
            );

            const allRollups = findAllOutingRollupTransactions(
              workingTransactions,
              outingId,
            ).sort(
              (a, b) =>
                new Date(b.transactionDate ?? b.date ?? 0).getTime() -
                new Date(a.transactionDate ?? a.date ?? 0).getTime(),
            );
            const existingRollup = allRollups[0] ?? null;

            for (const extra of allRollups.slice(1)) {
              await deleteTransaction(user.id, extra.id);
              const idx = workingTransactions.findIndex(
                (t) => t.id === extra.id,
              );
              if (idx !== -1) workingTransactions.splice(idx, 1);
              changed = true;
            }

            // No personal spend → drop the personal ledger row, but the
            // outing keeps its own (possibly non-zero) trip total.
            if (amount <= 0) {
              if (existingRollup) {
                await deleteTransaction(user.id, existingRollup.id);
                const idx = workingTransactions.findIndex(
                  (t) => t.id === existingRollup.id,
                );
                if (idx !== -1) workingTransactions.splice(idx, 1);
                changed = true;
              }
              if (Math.abs(Number(outing.totalSpent ?? 0) - tripTotal) >= 0.01) {
                try {
                  await saveOuting(user.id, { ...outing, totalSpent: tripTotal });
                  changed = true;
                } catch {
                  // Non-fatal — list already uses compute from expenses.
                }
              }
              continue;
            }

            const category =
              outingExpenses.find((expense) => expense.category)?.category ||
              "Travel";
            const payload = buildOutingRollupDraft(
              outing,
              amount,
              defaultAccountName,
              category,
              latestOutingExpenseDate(outingExpenses),
            );

            if (existingRollup) {
              const currentAmount = Number(
                existingRollup.totalAmount ?? existingRollup.amount ?? 0,
              );
              const sameTags = (existingRollup.tags ?? []).includes(
                "outing-rollup",
              );
              const outingTotalMatches =
                Math.abs(Number(outing.totalSpent ?? 0) - tripTotal) < 0.01;
              // Always rewrite when amount differs — this is the bug the user hit
              // (Transactions showed first expense ₹1,000 while outing was ₹8,788).
              if (
                Math.abs(currentAmount - amount) < 0.01 &&
                sameTags &&
                existingRollup.merchant === payload.merchant &&
                outingTotalMatches
              ) {
                continue;
              }
              await updateTransaction(user.id, existingRollup.id, {
                ...payload,
                // Force amount fields so UI/list never keeps a stale total.
                amount,
                totalAmount: amount,
              });
              const idx = workingTransactions.findIndex(
                (t) => t.id === existingRollup.id,
              );
              if (idx !== -1) {
                workingTransactions[idx] = {
                  ...workingTransactions[idx],
                  ...payload,
                  id: existingRollup.id,
                  amount,
                  totalAmount: amount,
                };
              }
              changed = true;
            } else {
              const created = await addTransaction(user.id, payload);
              workingTransactions.push(created);
              changed = true;
            }

            // Keep outings.total_spent aligned with the live expense sum
            // (whole trip, all members — not just this user's share).
            if (Math.abs(Number(outing.totalSpent ?? 0) - tripTotal) >= 0.01) {
              try {
                await saveOuting(user.id, { ...outing, totalSpent: tripTotal });
                changed = true;
              } catch {
                // Non-fatal — list already uses compute from expenses.
              }
            }
          }

          lastFingerprintRef.current = fingerprint;

          if (changed) {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: queryKeys.transactions(user.id),
              }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.outingExpenses(user.id),
              }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.allOutingExpenses(user.id),
              }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.outings(user.id),
              }),
            ]);
          }
        } finally {
          runningRef.current = false;
        }
      })();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [
    isAdminRoute,
    isConfigured,
    isReady,
    defaultAccountName,
    outings,
    queryClient,
    transactions,
    watchedExpenses,
    user?.id,
  ]);
}
