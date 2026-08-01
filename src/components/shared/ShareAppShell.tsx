"use client";

import { BarChart3, Eye, LineChart, Menu, ReceiptText, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
};

const pageTitles: Array<[string, string]> = [
  ["/transactions", "Transactions"],
  ["/analysis", "Analysis"],
];

function getPageTitle(pathname: string, token: string) {
  const match = pageTitles.find(([suffix]) => pathname === `/share/${token}${suffix}`);
  return match ? match[1] : "Overview";
}

/**
 * Mirrors the real AppShell's sidebar/header markup for the /share/[token]
 * route group — a separate component rather than a branch inside AppShell,
 * since AppShell's auth-redirect logic is sensitive, shared code serving the
 * whole authenticated app and already fully bypasses itself for any
 * /share/* pathname. Anonymous viewers never carry an app session, so nav
 * links here always thread the token through instead of using the app's
 * real routes.
 */
export function ShareAppShell({
  token,
  purposeName,
  children,
}: {
  token: string;
  purposeName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: NavItem[] = [
    { href: `/share/${token}/dashboard`, label: "Dashboard", icon: BarChart3 },
    { href: `/share/${token}/transactions`, label: "Transactions", icon: ReceiptText },
    { href: `/share/${token}/analysis`, label: "Analysis", icon: LineChart },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden bg-page text-foreground lg:p-3">
      {sidebarOpen ? (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 transition-transform lg:inset-y-3 lg:left-3 lg:translate-x-0 lg:rounded-l-3xl lg:border lg:border-r-sidebar-border",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-2">
          <Link
            className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight"
            href={`/share/${token}/dashboard`}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-background">
              <WalletCards className="size-4" />
            </span>
            SpentX
          </Link>
          <Button
            className="lg:hidden"
            size="icon-sm"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <nav className="mt-7 grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                prefetch
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg border border-transparent px-3 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive &&
                    "border-border bg-background font-semibold text-foreground shadow-sm hover:bg-background",
                )}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="size-4" strokeWidth={isActive ? 2.25 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 min-h-0 lg:ml-[232px]">
        <div className="flex h-full flex-col min-h-0 rounded-none bg-background lg:rounded-r-3xl lg:border lg:border-l-0 lg:border-border overflow-hidden">
          <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="flex items-center gap-2 border-b border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-900 dark:text-sky-100 lg:px-6">
              <Eye className="size-3.5 shrink-0" />
              <span>Shared view · read-only · {purposeName}</span>
            </div>
            <div className="flex min-h-16 items-center gap-3 px-4 lg:px-6">
              <Button
                className="lg:hidden"
                size="icon"
                variant="ghost"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="size-4" />
              </Button>
              <h1 className="truncate text-lg font-semibold tracking-tight lg:text-xl">
                {getPageTitle(pathname, token)}
              </h1>
            </div>
          </header>

          <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 lg:p-6">
            <div className="mx-auto w-full max-w-[1440px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
