"use client";

import { Loader2, ShieldX } from "lucide-react";
import { use, useEffect, useState } from "react";
import { ShareAppShell } from "@/components/shared/ShareAppShell";
import { claimShareLink, type ClaimedShareLink } from "@/lib/supabase-data";
import { ShareSessionProvider } from "@/providers/share-provider";

type ShareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; link: ClaimedShareLink };

export default function ShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<ShareState>({ status: "loading" });

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

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-xs">Opening shared view…</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <ShieldX className="size-10 text-rose-500" />
          <h1 className="text-lg font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <ShareSessionProvider
      value={{
        token,
        ownerId: state.link.ownerId,
        purposeId: state.link.purposeId,
        purposeName: state.link.purposeName,
      }}
    >
      <ShareAppShell token={token} purposeName={state.link.purposeName}>
        {children}
      </ShareAppShell>
    </ShareSessionProvider>
  );
}
