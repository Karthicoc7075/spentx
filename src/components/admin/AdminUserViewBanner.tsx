"use client";

import { Shield, ArrowRight, Eye } from "lucide-react";
import { useRoleMode } from "@/hooks/useRoleMode";
import { Button } from "@/components/ui/button";

export function AdminUserViewBanner() {
  const { isAdmin, mode, setMode } = useRoleMode();

  // Only displayed for admins currently in User View mode
  if (!isAdmin || mode !== "user") return null;

  return (
    <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-xs text-primary backdrop-blur-xs lg:px-6">
      <div className="flex items-center gap-2">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Eye className="size-3" />
        </div>
        <span>
          <strong className="font-semibold">User View Active:</strong> You are
          viewing SpentX exactly as a normal user sees it. Admin management
          controls are hidden.
        </span>
      </div>

      <button
        type="button"
        onClick={() => setMode("admin")}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90 cursor-pointer shrink-0"
      >
        <Shield className="size-3" />
        <span>Switch to Admin View</span>
        <ArrowRight className="size-3" />
      </button>
    </div>
  );
}
