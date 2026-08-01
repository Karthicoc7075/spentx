"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SnapshotHistorySheet } from "@/components/wealth/SnapshotHistorySheet";
import type { useDailySnapshot } from "@/hooks/useDailySnapshot";
import type { Account } from "@/types";

type DailySnapshotCardProps = {
  snapshot: ReturnType<typeof useDailySnapshot>;
  accounts: Account[];
};

export function DailySnapshotCard({ snapshot, accounts }: DailySnapshotCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="sx-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarClock className="size-4 text-muted-foreground" />
            Daily Snapshot
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Historical log of daily cash & bank balances.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
          View History
        </Button>
      </div>

      <SnapshotHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        snapshot={snapshot}
        accounts={accounts}
      />
    </div>
  );
}
