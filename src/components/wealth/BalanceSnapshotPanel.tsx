"use client";

import { Camera } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBalanceSnapshots } from "@/hooks/useBalanceSnapshots";
import {
  getBalanceBreakdownAsOfDate,
  type BalanceAsOfBreakdown,
} from "@/lib/balance-carryover";
import { getTodayCalendarDate } from "@/lib/date-filters";
import { getAccountBalance } from "@/lib/wealth";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { Account, Transaction } from "@/types";

type BalanceSnapshotPanelProps = {
  accounts: Account[];
  transactions: Transaction[];
};

type DialogContext = {
  account: Account;
  computedNow: number;
};

export function BalanceSnapshotPanel({
  accounts,
  transactions,
}: BalanceSnapshotPanelProps) {
  const { notify } = useToast();
  const { snapshots, addSnapshot } = useBalanceSnapshots();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContext, setDialogContext] = useState<DialogContext | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayCalendarDate);
  const [actualBalance, setActualBalance] = useState("");
  const [note, setNote] = useState("");

  const activeAccounts = accounts.filter((account) => account.is_active !== false);

  const accountRows = useMemo(
    () =>
      activeAccounts.map((account) => {
        const computed = getAccountBalance(account, transactions);
        const accountSnapshots = snapshots
          .filter((snapshot) => snapshot.accountId === account.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const latest = accountSnapshots[0];
        const actual = latest?.balance;
        const difference =
          actual !== undefined ? actual - computed : undefined;

        return {
          account,
          computed,
          actual,
          difference,
          latest,
          history: accountSnapshots,
        };
      }),
    [activeAccounts, snapshots, transactions],
  );

  const accountTransactions = useMemo(() => {
    if (!dialogContext) return [];
    return transactions.filter(
      (transaction) => transaction.account === dialogContext.account.name,
    );
  }, [dialogContext, transactions]);

  const accountSnapshots = useMemo(() => {
    if (!dialogContext) return [];
    return snapshots
      .filter((snapshot) => snapshot.accountId === dialogContext.account.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [dialogContext, snapshots]);

  const balanceBreakdown = useMemo<BalanceAsOfBreakdown | null>(() => {
    if (!dialogContext) return null;
    return getBalanceBreakdownAsOfDate(
      dialogContext.account,
      accountTransactions,
      selectedDate,
    );
  }, [accountTransactions, dialogContext, selectedDate]);

  async function handleSaveSnapshot() {
    if (!dialogContext || !actualBalance) return;

    await addSnapshot({
      accountId: dialogContext.account.id,
      date: selectedDate,
      balance: Number(actualBalance),
      note: note || undefined,
    });

    notify({
      title: "Snapshot logged",
      description: `${dialogContext.account.name} balance recorded for ${selectedDate}.`,
    });
    setDialogOpen(false);
    resetDialog();
  }

  function resetDialog() {
    setDialogContext(null);
    setSelectedDate(getTodayCalendarDate());
    setActualBalance("");
    setNote("");
  }

  function openSnapshotDialog(account: Account, computed: number) {
    const today = getTodayCalendarDate();
    const history = snapshots
      .filter((snapshot) => snapshot.accountId === account.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const existingToday = history.find((snapshot) => snapshot.date === today);

    setDialogContext({ account, computedNow: computed });
    setSelectedDate(today);
    setActualBalance(existingToday ? String(existingToday.balance) : "");
    setNote(existingToday?.note ?? "");
    setDialogOpen(true);
  }

  function handleDateChange(nextDate: string) {
    setSelectedDate(nextDate);
    const existing = accountSnapshots.find((snapshot) => snapshot.date === nextDate);
    setActualBalance(existing ? String(existing.balance) : "");
    setNote(existing?.note ?? "");
  }

  function formatSnapDate(date?: string) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Camera className="size-4 text-primary" />
          Account Balances
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare computed balances against your actual bank statements.
        </p>
      </div>

      {accountRows.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          Add accounts in Settings to track balance snapshots.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Account</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Computed</th>
                <th className="px-4 py-3 text-right">Snapshot</th>
                <th className="px-4 py-3">Snap Date</th>
                <th className="px-4 py-3">Diff</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accountRows.map((row) => {
                const diffLabel =
                  row.actual === undefined
                    ? "—"
                    : row.difference === 0
                      ? "Match ✓"
                      : `${formatCurrency(Math.abs(row.difference ?? 0))} gap ⚠`;

                return (
                  <tr key={row.account.id}>
                    <td className="px-6 py-4 font-medium">{row.account.name}</td>
                    <td className="px-4 py-4 text-right font-mono">
                      {formatCurrency(row.account.openingBalance)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono">
                      {formatCurrency(row.computed)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono">
                      {row.actual !== undefined ? formatCurrency(row.actual) : "—"}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {formatSnapDate(row.latest?.date)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          row.actual === undefined
                            ? "text-muted-foreground"
                            : row.difference === 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {diffLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        onClick={() =>
                          openSnapshotDialog(row.account, row.computed)
                        }
                      >
                        Log Snapshot
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Log snapshot
              {dialogContext ? ` · ${dialogContext.account.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="snapshot-date">Snapshot date</Label>
              <Input
                id="snapshot-date"
                type="date"
                value={selectedDate}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </div>

            <SnapshotDateView
              account={dialogContext?.account ?? null}
              breakdown={balanceBreakdown}
              selectedDate={selectedDate}
            />

            <div className="grid gap-2">
              <Label htmlFor="snapshot-balance">Actual balance from statement</Label>
              <Input
                id="snapshot-balance"
                inputMode="decimal"
                placeholder="Enter balance from your bank statement"
                value={actualBalance}
                onChange={(event) => setActualBalance(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="snapshot-note">Note (optional)</Label>
              <Textarea
                id="snapshot-note"
                placeholder="Checked after salary credit..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!actualBalance}
              type="button"
              onClick={() => void handleSaveSnapshot()}
            >
              Save snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapshotDateView({
  selectedDate,
  breakdown,
  account,
}: {
  selectedDate: string;
  breakdown: BalanceAsOfBreakdown | null;
  account: Account | null;
}) {
  const formattedDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  if (!breakdown || !account) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Computed balance as of {formattedDate}
        </p>
        <span className="font-mono text-sm font-semibold">
          {breakdown.accountActiveOnDate
            ? formatCurrency(breakdown.computedBalance)
            : "₹0 (not yet open)"}
        </span>
      </div>
    </div>
  );
}