"use client";

import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Database,
  ScrollText,
  Activity,
  Sun,
  Moon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/theme-provider";

const adminTabs = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/database", label: "Database", icon: Database },
  { href: "/admin/logs", label: "System & Logs", icon: ScrollText },
];

export function AdminSectionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <div className="grid gap-6">
      {/* Top Admin Control Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/60 p-5 backdrop-blur-md shadow-sm dark:bg-card/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Admin Command Center
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit logging active • Real-time production management & system state
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${resolvedTheme === "dark" ? "Light" : "Dark"} Mode`}
              className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-xs transition-all hover:bg-muted cursor-pointer"
            >
              {resolvedTheme === "dark" ? (
                <>
                  <Sun className="size-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5 text-sky-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground font-mono">
              <Activity className="size-3.5 text-emerald-500" />
              <span>Systems Nominal</span>
            </div>
          </div>
        </div>

        {/* Header Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 pt-3">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              tab.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
