"use client";

import { useMemo, useState } from "react";
import { BriefcaseBusiness, Edit2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { InvestmentHistoryPanel } from "@/components/wealth/InvestmentHistoryPanel";
import { INVESTMENT_TYPE_ICONS, NewInvestmentModal } from "@/components/wealth/NewInvestmentModal";
import { useCategories } from "@/hooks/useCategories";
import { useInvestments } from "@/hooks/useInvestments";
import { useToast } from "@/providers/toast-provider";
import { computePortfolio, gainPercentOf, INVESTMENT_TYPE_LABELS } from "@/lib/investments";
import type { Investment, Transaction } from "@/types";

type InvestmentsSectionProps = {
  transactions: Transaction[];
  onNewInvestmentClick?: () => void;
};

function formatGain(gain: number, pct: number) {
  const sign = gain >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(gain))} (${gain >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`;
}

export function InvestmentsSection({ transactions, onNewInvestmentClick }: InvestmentsSectionProps) {
  const { notify } = useToast();
  const { categories } = useCategories();
  const { investments, isLoading, error, remove } = useInvestments();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);

  const portfolio = useMemo(
    () => computePortfolio(investments, transactions, categories),
    [investments, transactions, categories],
  );

  async function handleDelete(item: Investment) {
    if (!confirm(`Delete investment "${item.name}"? Linked bank transactions are kept.`)) return;
    try {
      await remove(item.id);
      notify({ title: "Investment deleted", description: `"${item.name}" was removed from your portfolio.` });
    } catch (err) {
      notify({
        title: "Could not delete",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  function openNew() {
    setEditing(null);
    if (onNewInvestmentClick) onNewInvestmentClick();
    else setModalOpen(true);
  }

  const gainPositive = portfolio.gain >= 0;

  return (
    <div className="space-y-6">
      <div className="sx-surface rounded-2xl p-4 sm:p-5 border bg-card/60 backdrop-blur">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <TrendingUp className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Current Value
              </span>
              <span className="rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[10px] font-semibold">
                ● Portfolio
              </span>
            </div>
            <div className="flex items-baseline gap-2 pt-1 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {formatCurrency(portfolio.current)}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                across {portfolio.holdingCount} {portfolio.holdingCount === 1 ? "holding" : "holdings"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Invested {formatCurrency(portfolio.invested)} ·{" "}
              <span className={cn("font-semibold", gainPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {formatGain(portfolio.gain, portfolio.gainPercent)}
              </span>
              {portfolio.unlinkedSpend > 0 ? (
                <> · includes {formatCurrency(portfolio.unlinkedSpend)} of Investment-category spends not linked to a holding</>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <Button onClick={openNew} size="sm" className="gap-1.5 font-medium rounded-xl">
              <Plus className="size-4" />
              Add Investment
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <span>Portfolio Holdings</span>
            <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
              {investments.length}
            </span>
          </h3>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            Could not load investments: {error.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border py-10 text-center text-xs text-muted-foreground">Loading…</div>
        ) : investments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-10 px-4 text-center bg-card/40">
            <BriefcaseBusiness className="mx-auto size-9 text-muted-foreground/40" />
            <h4 className="mt-3 text-sm font-semibold text-foreground">No investments added yet</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Add mutual funds, stocks, fixed deposits or gold to track what you put in and what it is worth.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 text-xs gap-1.5 rounded-xl"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              Add First Holding
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {investments.map((item) => {
              const Icon = INVESTMENT_TYPE_ICONS[item.type] ?? TrendingUp;
              const gain = item.currentValue - item.investedAmount;
              const pct = gainPercentOf(item.investedAmount, item.currentValue);
              const up = gain >= 0;
              return (
                <div
                  key={item.id}
                  className="sx-surface rounded-2xl p-4 border bg-card hover:shadow-fintech-hover transition-all duration-200 flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                        <span className="inline-block mt-0.5 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                          {INVESTMENT_TYPE_LABELS[item.type] ?? item.type}
                          {item.purpose ? ` · ${item.purpose}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(item);
                          setModalOpen(true);
                        }}
                        title="Edit holding"
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        title="Delete holding"
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-2 pt-2 border-t border-border/60">
                    <div>
                      <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                        {formatCurrency(item.currentValue)}
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        invested {formatCurrency(item.investedAmount)}
                      </p>
                    </div>
                    {item.investedAmount > 0 ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                          up
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                        {up ? "+" : "−"}
                        {Math.abs(pct).toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                  {item.notes ? (
                    <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">{item.notes}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2">
        <InvestmentHistoryPanel transactions={transactions} />
      </div>

      <NewInvestmentModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditing(null);
        }}
        initialInvestment={editing}
      />
    </div>
  );
}
