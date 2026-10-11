"use client";

import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

// Navigation lives in the AppShell sidebar (desktop) / drawer (mobile) — this
// shell only adds a slim, honest context strip. No fake "LIVE" / "Systems
// Nominal" badges, no second nav, no duplicate theme/view toggles (both are
// already in the AppShell header).
export function AdminSectionShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span>
          Admin view — every change you make here is written to the audit log.
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
