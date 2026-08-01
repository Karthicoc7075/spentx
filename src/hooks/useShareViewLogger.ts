"use client";

import { useEffect } from "react";
import { logSharedPageView } from "@/lib/supabase-data";
import { useShareSession } from "@/providers/share-provider";

/** Fires once per mount for the given page name within a share session. */
export function useShareViewLogger(page: string) {
  const share = useShareSession();

  useEffect(() => {
    if (!share) return;
    void logSharedPageView(share.token, page);
    // Depend on the stable token, not the share object identity, which is
    // rebuilt on every layout render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.token, page]);
}
