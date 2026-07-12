"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { IncomeStream } from "@/types";

type IncomeStreamTableProps = {
  streams: IncomeStream[];
  onAdd: (
    stream: Omit<IncomeStream, "id" | "userId" | "createdAt" | "updatedAt">,
  ) => Promise<unknown>;
  onUpdate: (stream: IncomeStream) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
};

export function IncomeStreamTable({
  streams,
  onAdd,
  onUpdate,
  onDelete,
}: IncomeStreamTableProps) {
  const [newSource, setNewSource] = useState("");
  const [newAmount, setNewAmount] = useState(0);

  async function handleAdd() {
    if (!newSource.trim()) return;
    await onAdd({
      source: newSource.trim(),
      amount: newAmount,
      frequency: "monthly",
      lastReceived: new Date().toISOString(),
    });
    setNewSource("");
    setNewAmount(0);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Income streams</CardTitle>
        <Button onClick={() => void handleAdd()}>
          <Plus className="size-4" />
          Add stream
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto] sm:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Source name</label>
            <Input
              placeholder="Salary, Freelance, Investments..."
              value={newSource}
              onChange={(event) => setNewSource(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Monthly amount</label>
            <Input
              inputMode="decimal"
              value={newAmount || ""}
              onChange={(event) => setNewAmount(Number(event.target.value) || 0)}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Monthly amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Last received</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {streams.length === 0 ? (
                <TableRow>
                  <TableCell className="py-8 text-center text-muted-foreground" colSpan={5}>
                    No income streams yet. Add one or they&apos;ll be detected from
                    income transactions.
                  </TableCell>
                </TableRow>
              ) : (
                streams.map((stream) => (
                  <TableRow key={stream.id}>
                    <TableCell>
                      <Input
                        value={stream.source}
                        onChange={(event) =>
                          void onUpdate({ ...stream, source: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={stream.amount}
                        onChange={(event) =>
                          void onUpdate({
                            ...stream,
                            amount: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                        value={stream.frequency}
                        onChange={(event) =>
                          void onUpdate({
                            ...stream,
                            frequency: event.target.value as IncomeStream["frequency"],
                          })
                        }
                      >
                        <option value="monthly">monthly</option>
                        <option value="one-time">one-time</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stream.lastReceived
                        ? formatDate(stream.lastReceived)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void onDelete(stream.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {streams.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Total monthly:{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(
                streams
                  .filter((stream) => stream.frequency === "monthly")
                  .reduce((sum, stream) => sum + stream.amount, 0),
              )}
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}