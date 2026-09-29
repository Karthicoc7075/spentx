"use client";

import { useState } from "react";
import { Shield, User, ArrowLeftRight, Check, KeyRound } from "lucide-react";
import { useRoleMode } from "@/hooks/useRoleMode";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminPinModal } from "@/components/admin/AdminPinModal";
import { cn } from "@/lib/utils";

export function RoleSwitchControl() {
  const { mode, isAdmin, setMode } = useRoleMode();
  const [pinModalOpen, setPinModalOpen] = useState(false);

  // Only visible for admin-eligible accounts (karthicoc7075@gmail.com)
  if (!isAdmin) return null;

  const isAdminMode = mode === "admin";

  const handleAdminViewClick = () => {
    if (isAdminMode) {
      // Already in Admin View, stay in Admin View
      return;
    }
    // Opening Admin View requires PIN prompt!
    setPinModalOpen(true);
  };

  const handleUserViewClick = () => {
    if (!isAdminMode) return;
    setMode("user");
  };

  return (
    <>
      <AdminPinModal open={pinModalOpen} onOpenChange={setPinModalOpen} />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-2 rounded-xl px-2.5 text-xs font-semibold transition-all border cursor-pointer shadow-xs",
                isAdminMode
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
              )}
              title={isAdminMode ? "Admin View active. Click to manage view mode." : "Click to switch to Admin Panel (PIN Required)."}
            >
              {isAdminMode ? (
                <Shield className="size-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <KeyRound className="size-3.5 text-primary" />
              )}
              <span className="inline">
                {isAdminMode ? "Admin View" : "Admin Panel"}
              </span>
              <ArrowLeftRight className="size-3 text-muted-foreground ml-0.5 opacity-70" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-60 p-1.5 shadow-md">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Interface View Mode</span>
              {isAdminMode && (
                <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
                  ADMIN ACTIVE
                </span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuGroup>
            {/* User View option */}
            <DropdownMenuItem
              onClick={handleUserViewClick}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors",
                !isAdminMode && "bg-accent font-semibold text-accent-foreground",
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <User className="size-3.5" />
                </div>
                <div>
                  <p className="font-semibold leading-none">User View</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Standard website interface
                  </p>
                </div>
              </div>
              {!isAdminMode && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>

            {/* Admin View option */}
            <DropdownMenuItem
              onClick={handleAdminViewClick}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors mt-1",
                isAdminMode && "bg-accent font-semibold text-accent-foreground",
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Shield className="size-3.5" />
                </div>
                <div>
                  <p className="font-semibold leading-none">Admin Panel</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isAdminMode ? "Management portal active" : "PIN required to open"}
                  </p>
                </div>
              </div>
              {isAdminMode ? (
                <Check className="size-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <KeyRound className="size-3 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />
          <div className="px-2 py-1 text-[10px] text-muted-foreground leading-snug">
            Admin access is restricted to <strong>karthicoc7075@gmail.com</strong>.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
