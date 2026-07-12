"use client";

import { ArrowDownLeft, ArrowUpRight, Eye, Loader2, ShieldX } from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import {
  claimShareLink,
  subscribeToSharedTransactions,
  type ClaimedShareLink,
} from "@/lib/firebase";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Transaction } from "@/types";

type ShareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; link: ClaimedShareLink };

export default function SharedPurposePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<ShareState>({ status: "loading" });
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    claimShareLink(token)
      .then((link) => {
        if (!cancelled) setState({ status: "ready", link });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not open this share link.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.status !== "ready") return;

    return subscribeToSharedTransactions(
      state.link.ownerId,
      state.link.purposeId,
      (next) => setTransactions(next),
      () =>
        setState({
          status: "error",
          message: "This share link is invalid or has been revoked.",
        }),
    );
  }, [state]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const transaction of transactions ?? []) {
      if (transaction.type === "income") income += transaction.amount;
      else expense += transaction.amount;
    }
    return { income, expense, net: income - expense };
  }, [transactions]);

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <ShieldX className="size-10 text-rose-500" />
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "loading" || transactions === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-xs">Opening shared view…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page pb-12 text-foreground">
      <header className="border-b border-border bg-white px-4 py-4 dark:bg-card sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SpentX · Shared with you
            </p>
            <h1 className="text-xl font-bold">{state.link.purposeName}</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            <Eye className="size-3.5" />
            View only
          </span>
        </div>
      </header>

      <main className="mx-auto mt-6 flex max-w-3xl flex-col gap-6 px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-card">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totals.income, false)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-card">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(totals.expense, false)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-card">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="mt-1 text-lg font-bold">
              {formatCurrency(totals.net, false)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">
              Transactions
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {transactions.length} total · updates live
              </span>
            </h2>
          </div>

          {transactions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No transactions yet. New ones will appear here automatically.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {transactions.map((transaction) => {
                const isIncome = transaction.type === "income";
                return (
                  <li
                    key={transaction.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span
                      className={
                        isIncome
                          ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {transaction.merchant ||
                          transaction.description ||
                          transaction.note ||
                          (isIncome ? "Income" : "Expense")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(transaction.date)}
                        {transaction.category ? ` · ${transaction.category}` : ""}
                      </p>
                    </div>
                    <p
                      className={
                        isIncome
                          ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-sm font-semibold text-rose-600 dark:text-rose-400"
                      }
                    >
                      {isIncome ? "+" : "-"}
                      {formatCurrency(transaction.amount, false)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Read-only shared view · Powered by SpentX
        </p>
      </main>
    </div>
  );
}
