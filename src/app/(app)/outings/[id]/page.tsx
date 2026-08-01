"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { TripDetailPage } from "@/components/outings/TripDetailPage";
import { useOutings } from "@/hooks/useOutings";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchOutings } from "@/lib/supabase-data";
import { useToast } from "@/providers/toast-provider";
import type { Outing } from "@/types";

export default function TripDetailRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuthReady();
  const { outings, isLoading, updateOuting } = useOutings();
  const { notify } = useToast();
  const fromList = outings.find((item) => item.id === id);
  const [fetched, setFetched] = useState<Outing | null | undefined>(undefined);

  // Fallback: after create, list may lag; load this id once if missing.
  useEffect(() => {
    if (fromList || !user?.id || !id) {
      setFetched(undefined);
      return;
    }
    let cancelled = false;
    setFetched(undefined);
    void fetchOutings(user.id)
      .then((list) => {
        if (cancelled) return;
        setFetched(list.find((o) => o.id === id) ?? null);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fromList, user?.id, id]);

  const outing = fromList ?? (fetched && fetched.id === id ? fetched : null);
  const resolving = isLoading || (!fromList && fetched === undefined);

  if (resolving) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
        Loading outing…
      </div>
    );
  }

  if (!outing) {
    return (
      <div className="grid gap-4 rounded-xl border border-dashed px-4 py-14 text-center">
        <p className="text-sm text-muted-foreground">
          Outing not found. It may have been deleted.
        </p>
        <div>
          <Link
            href="/outings"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Back to outings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TripDetailPage
      isLoading={false}
      outing={outing}
      onNotify={notify}
      onUpdate={updateOuting}
    />
  );
}