"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvestmentReturns } from "@/lib/wealth";
import { cn, formatCurrency } from "@/lib/utils";
import type { Investment, InvestmentType } from "@/types";

type InvestmentsTableProps = {
  investments: Investment[];
  isLoading?: boolean;
  onAdd: (
    investment: Omit<Investment, "id" | "userId" | "createdAt" | "updatedAt">,
  ) => Promise<unknown>;
  onUpdate: (investment: Investment) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
};

const investmentTypes: Array<{ value: InvestmentType; label: string }> = [
  { value: "mutual-fund", label: "Mutual Fund" },
  { value: "stocks", label: "Stocks" },
  { value: "gold-etf", label: "Gold ETF" },
  { value: "physical-gold", label: "Physical Gold" },
  { value: "fd", label: "Fixed Deposit" },
  { value: "ppf-epf", label: "PPF / EPF" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];

export function InvestmentsTable({
  investments,
  isLoading,
  onAdd,
  onUpdate,
  onDelete,
}: InvestmentsTableProps) {
  const [newName, setNewName] = useState("");
  const [newInvested, setNewInvested] = useState(0);
  const [newValue, setNewValue] = useState(0);
  const [newType, setNewType] = useState<InvestmentType>("mutual-fund");

  const totalInvested = investments.reduce(
    (sum, investment) => sum + investment.investedAmount,
    0,
  );
  const totalValue = investments.reduce(
    (sum, investment) => sum + investment.currentValue,
    0,
  );
  const totalReturns =
    totalInvested > 0
      ? Math.round(((totalValue - totalInvested) / totalInvested) * 100)
      : 0;

  async function handleAdd() {
    if (!newName.trim()) return;
    await onAdd({
      name: newName.trim(),
      type: newType,
      investedAmount: newInvested,
      currentValue: newValue || newInvested,
    });
    setNewName("");
    setNewInvested(0);
    setNewValue(0);
  }

  if (isLoading) {
    return <Skeleton className="h-80" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Investments</CardTitle>
        <Button onClick={() => void handleAdd()}>
          <Plus className="size-4" />
          Add investment
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              placeholder="Nifty 50 Fund, FD..."
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Invested</Label>
            <Input
              inputMode="decimal"
              value={newInvested || ""}
              onChange={(event) =>
                setNewInvested(Number(event.target.value) || 0)
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Current value</Label>
            <Input
              inputMode="decimal"
              value={newValue || ""}
              onChange={(event) =>
                setNewValue(Number(event.target.value) || 0)
              }
            />
          </div>
          <select
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={newType}
            onChange={(event) =>
              setNewType(event.target.value as InvestmentType)
            }
          >
            {investmentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {investments.length > 0 ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Total invested:{" "}
              <strong>{formatCurrency(totalInvested)}</strong>
            </span>
            <span>
              Current value: <strong>{formatCurrency(totalValue)}</strong>
            </span>
            <span
              className={cn(
                totalReturns >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              Returns: <strong>{totalReturns}%</strong>
            </span>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Invested</TableHead>
                <TableHead>Current value</TableHead>
                <TableHead>Returns</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No investments tracked yet. Add your first entry manually.
                  </TableCell>
                </TableRow>
              ) : (
                investments.map((investment) => {
                  const returns = getInvestmentReturns(investment);
                  return (
                    <TableRow key={investment.id}>
                      <TableCell>
                        <Input
                          value={investment.name}
                          onChange={(event) =>
                            void onUpdate({
                              ...investment,
                              name: event.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                          value={investment.type}
                          onChange={(event) =>
                            void onUpdate({
                              ...investment,
                              type: event.target.value as InvestmentType,
                            })
                          }
                        >
                          {investmentTypes.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          value={investment.investedAmount}
                          onChange={(event) =>
                            void onUpdate({
                              ...investment,
                              investedAmount: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          value={investment.currentValue}
                          onChange={(event) =>
                            void onUpdate({
                              ...investment,
                              currentValue: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm font-medium",
                          returns >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {returns}%
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void onDelete(investment.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}