"use client";

import { useState } from "react";
import { Shield, User, KeyRound } from "lucide-react";
import { useRoleMode } from "@/hooks/useRoleMode";
import { AdminPinModal } from "@/components/admin/AdminPinModal";
import { cn } from "@/lib/utils";

export function SidebarRoleSwitcher() {
  const { mode, setMode } = useRoleMode();
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const isAdminMode = mode === "admin";

  const handleAdminClick = () => {
    if (isAdminMode) return;
    setPinModalOpen(true);
  };

  const handleUserClick = () => {
    if (!isAdminMode) return;
    setMode("user");
  };

  return (
    <>
      <AdminPinModal open={pinModalOpen} onOpenChange={setPinModalOpen} />
      <div className="mb-4 rounded-2xl border border-border/80 bg-card/60 p-2.5 backdrop-blur-xs shadow-xs">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
            INTERFACE MODE
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              isAdminMode
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                : "bg-primary/15 text-primary border border-primary/20",
            )}
          >
            {isAdminMode ? "Admin Panel" : "User View"}
          </span>
        </div>

        {/* Segmented Switcher Controls */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
          <button
            type="button"
            onClick={handleUserClick}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer",
              !isAdminMode
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <User className="size-3.5" />
            <span>User View</span>
          </button>

          <button
            type="button"
            onClick={handleAdminClick}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer",
              isAdminMode
                ? "bg-background text-amber-600 dark:text-amber-400 shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isAdminMode ? (
              <Shield className="size-3.5" />
            ) : (
              <KeyRound className="size-3.5" />
            )}
            <span>Admin Panel</span>
          </button>
        </div>

        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground leading-tight">
          {isAdminMode
            ? "Admin management active. Click User View to preview standard website interface."
            : "Click Admin Panel to unlock management tools (PIN required)."}
        </p>
      </div>
    </>
  );
}
