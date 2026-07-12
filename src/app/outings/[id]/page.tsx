"use client";

import { use } from "react";
import { TripDetailPage } from "@/components/outings/TripDetailPage";
import { useOutings } from "@/hooks/useOutings";
import { useToast } from "@/providers/toast-provider";

export default function TripDetailRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { outings, isLoading, updateOuting } = useOutings();
  const { notify } = useToast();
  const outing = outings.find((item) => item.id === id);

  if (!isLoading && !outing) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
        Outing not found. It may have been deleted.
      </div>
    );
  }

  if (!outing) {
    return null;
  }

  return (
    <TripDetailPage
      isLoading={isLoading}
      outing={outing}
      onNotify={notify}
      onUpdate={updateOuting}
    />
  );
}