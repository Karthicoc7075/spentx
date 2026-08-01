"use client";

import { Database, WalletCards } from "lucide-react";
import { DarkAmbientRays } from "@/components/shared/DarkAmbientRays";

export function SupabaseSetupScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <DarkAmbientRays />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <WalletCards className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">SpentX Web</h1>
            <p className="text-sm text-muted-foreground">
              Supabase configuration required
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
          <p>
            SpentX Web runs on real Supabase data synced with the mobile app.
            Add your Supabase project credentials to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              .env.local
            </code>{" "}
            to continue.
          </p>
          <div className="rounded-lg border bg-muted/30 px-3 py-3 font-mono text-xs dark:border-white/10">
            <p>NEXT_PUBLIC_SUPABASE_URL=...</p>
            <p>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...</p>
          </div>
          <p className="inline-flex items-center gap-2">
            <Database className="size-4" />
            No mock data is used in production mode.
          </p>
        </div>
      </div>
    </div>
  );
}