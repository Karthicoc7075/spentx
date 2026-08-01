"use client";

import {
  Activity,
  BarChart3,
  Bell,
  CalendarRange,
  Database,
  DatabaseBackup,
  Eye,
  Layers,
  LayoutDashboard,
  LineChart,
  Loader2,
  MapPin,
  Menu,
  PiggyBank,
  ReceiptText,
  ScrollText,
  Settings,
  Smartphone,
  Users,
  WalletCards,
  Wrench,
  X,
  Sun,
  Moon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/shared/ExportButton";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { SupabaseSetupScreen } from "@/components/shared/SupabaseSetupScreen";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useOutingTransactionSync } from "@/hooks/useOutingTransactionSync";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
import { cn } from "@/lib/utils";
import { fetchAppConfig } from "@/lib/supabase-data";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useViewerAccess } from "@/providers/viewer-provider";
import { useTheme } from "@/providers/theme-provider";

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  badge?: string;
};

const mainNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/analytics", label: "Analysis", icon: LineChart },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/wealth", label: "Wealth", icon: PiggyBank },
];

const secondaryNavItems: NavItem[] = [
  { href: "/outings", label: "Outings", icon: MapPin, badge: "NEW" },
  { href: "/friends", label: "Friends", icon: Users },
];

const bottomNavItems: NavItem[] = [
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Rendered only for role = 'admin' users — the real gate is the server-side
// /admin layout guard; hiding these here is just UI hygiene. One rail, one
// list: admin mode shows these seven items and nothing else.
const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/database", label: "Database", icon: Database },
  { href: "/admin/logs", label: "System & Logs", icon: ScrollText },
];

const viewerNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/analytics", label: "Analysis", icon: LineChart },
];

const viewerAllowedPaths = ["/", "/transactions", "/analytics"];

/** Only mount ledger↔outing auto-sync on user routes (hooks stay unconditional). */
function OutingTransactionSyncGate() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/share")) return null;
  return <OutingTransactionSyncRunner />;
}

function OutingTransactionSyncRunner() {
  useOutingTransactionSync();
  return null;
}

const pageTitles: Array<[string, string]> = [
  ["/transactions", "Transactions"],
  ["/analytics", "Analysis"],
  ["/plan", "Plan"],
  ["/wealth", "Wealth"],
  ["/outings", "Outings"],
  ["/friends", "Friends"],
  ["/alerts", "Alerts"],
  ["/settings", "Settings"],
  ["/admin", "Admin"],
];

function getPageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  const match = pageTitles.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : "Overview";
}

function GlobalAppLoadingScreen() {
  const [progress, setProgress] = useState(30);

  useEffect(() => {
    const timer1 = setTimeout(() => setProgress(70), 120);
    const timer2 = setTimeout(() => setProgress(95), 300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
      <div className="flex max-w-xs w-full flex-col items-center gap-5 text-center animate-in fade-in duration-300">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <WalletCards className="size-7 animate-pulse" />
        </div>
        <div className="space-y-1.5 w-full">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Application Loading...</h2>
          <p className="text-xs text-muted-foreground">Preparing your dashboard, accounts, and transactions</p>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isConfigured, isLoading, user, authUser } = useSupabaseAuth();
  const { isReadOnlyViewer, sharedPurposeIds } = useViewerAccess();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { resolvedTheme, setTheme } = useTheme();

  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  // Prefetch main navigation routes once on shell mount for instant transitions
  useEffect(() => {
    if (!user) return;
    mainNavItems.forEach((item) => router.prefetch(item.href));
    secondaryNavItems.forEach((item) => router.prefetch(item.href));
    bottomNavItems.forEach((item) => router.prefetch(item.href));
  }, [user, router]);

  // Maintenance mode: when enabled in global settings, non-admin users get a
  // maintenance notice instead of the app. Admins keep full access so they
  // can turn it back off.
  const { data: appConfig } = useQuery({
    queryKey: ["app-config-shell"],
    queryFn: fetchAppConfig,
    enabled: isConfigured && Boolean(user?.id),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const maintenanceActive = Boolean(appConfig?.maintenanceMode) && !isAdmin;

  const isAuthRoute = pathname.startsWith("/auth");
  // Public no-login share links render standalone, outside the app shell.
  const isShareRoute = pathname.startsWith("/share");

  useEffect(() => {
    // viewerAllowedPaths are the real app's own routes, for the separate
    // signed-in "claimed viewer" flow. Anonymous /share/[token] sessions
    // also set isReadOnlyViewer, but live under their own path/layout
    // entirely — without this guard, every share link redirects to "/"
    // here and then gets bounced again by the sign-in effect below, since
    // an anonymous visitor never has a real Supabase session.
    if (!isReadOnlyViewer || isShareRoute) return;

    const isAllowed = viewerAllowedPaths.some((path) =>
      path === "/" ? pathname === "/" : pathname.startsWith(path),
    );

    if (!isAllowed) {
      router.replace("/");
    }
  }, [isReadOnlyViewer, isShareRoute, pathname, router]);

  useEffect(() => {
    if (!isLoading) {
      setAuthTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => setAuthTimedOut(true), 2000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  useEffect(() => {
    if (isAuthRoute || isShareRoute) return;
    if (isLoading && !authTimedOut) return;
    if (!user && !authUser) {
      router.replace("/auth/sign-in");
    }
  }, [authTimedOut, authUser, isAuthRoute, isShareRoute, isLoading, router, user]);

  // Hard admin/user split, client side: admins never see the user-facing
  // app, not even their own dashboard. The (app) route-group layout enforces
  // this server-side; this effect covers soft client navigations.
  useEffect(() => {
    if (!isAdmin || isAuthRoute || isShareRoute) return;
    if (!pathname.startsWith("/admin")) {
      router.replace("/admin");
    }
  }, [isAdmin, isAuthRoute, isShareRoute, pathname, router]);

  if (!isConfigured) {
    return <SupabaseSetupScreen />;
  }

  if (isAuthRoute || isShareRoute) {
    return <>{children}</>;
  }

  const shouldShowAuth = !user && (!isLoading || authTimedOut) && !authUser;

  if (isLoading && !user && !authTimedOut) {
    return <GlobalAppLoadingScreen />;
  }

  if (shouldShowAuth) {
    return <GlobalAppLoadingScreen />;
  }

  if (maintenanceActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Wrench className="size-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            SpentX is under maintenance
          </h1>
          <p className="text-sm text-muted-foreground">
            We&apos;re making some improvements right now. Your data is safe —
            please check back in a little while.
          </p>
        </div>
      </div>
    );
  }

  function renderNavItems(items: NavItem[]) {
    const currentPath = pendingPath ?? pathname;
    return items.map((item) => {
      const Icon = item.icon;
      // "/" and "/admin" are index routes — exact match only, so "Overview"
      // isn't highlighted while browsing deeper admin sections.
      const isActive =
        item.href === "/" || item.href === "/admin"
          ? currentPath === item.href
          : currentPath.startsWith(item.href);

      return (
        <Link
          key={item.href}
          prefetch
          className={cn(
            "flex h-10 items-center gap-3 rounded-xl border border-transparent px-3 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
            isActive &&
              "border-border/80 bg-background/90 font-semibold text-foreground shadow-sm hover:bg-background",
          )}
          href={item.href}
          onClick={() => {
            setSidebarOpen(false);
            setPendingPath(item.href);
          }}
          onMouseEnter={() => router.prefetch(item.href)}
        >
          <Icon className="size-4" strokeWidth={isActive ? 2.25 : 2} />
          {item.label}
          {item.badge ? (
            <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              {item.badge}
            </span>
          ) : null}
        </Link>
      );
    });
  }

  return (
    // Single viewport shell: no body+main double-scroll. Sidebar + content
    // share one row so content height matches the padded viewport (no extra
    // bottom scroll or content jumping under the header).
    <div className="flex h-dvh overflow-hidden bg-page text-foreground lg:gap-0 lg:p-3">
      {sidebarOpen ? (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          // Mobile: fixed drawer. Desktop: in-flow column (same height as content).
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar/80 px-3.5 py-5 text-sidebar-foreground shadow-sm backdrop-blur transition-transform",
          "lg:static lg:z-0 lg:translate-x-0 lg:rounded-l-3xl lg:border lg:border-r-0 lg:border-sidebar-border lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-2">
          <Link
            className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight"
            href={isAdmin ? "/admin" : "/"}
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
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

        {isAdmin ? (
          <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            <div className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              ADMINISTRATION
            </div>
            <div className="grid gap-1">
              {renderNavItems(adminNavItems)}
            </div>
          </nav>
        ) : (
          <>
            <nav className="mt-7 grid gap-1">
              {renderNavItems(isReadOnlyViewer ? viewerNavItems : mainNavItems)}
            </nav>

            {!isReadOnlyViewer ? (
              <>
                <div className="mx-2 my-4 h-px shrink-0 bg-sidebar-border" />
                <nav className="grid gap-1">{renderNavItems(secondaryNavItems)}</nav>
                <nav className="mt-auto grid shrink-0 gap-1 pt-4">
                  {renderNavItems(bottomNavItems)}
                </nav>
              </>
            ) : null}
          </>
        )}
      </aside>

      {/* Content column: fills remaining width/height; only <main> scrolls */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-r-3xl lg:border lg:border-border">
        <header className="z-20 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          {isReadOnlyViewer ? (
            <div className="flex items-center gap-2 border-b border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-900 dark:text-sky-100 lg:px-6">
              <Eye className="size-3.5 shrink-0" />
              <span>
                Read-only view · {sharedPurposeIds.length} shared purpose
                {sharedPurposeIds.length === 1 ? "" : "s"} visible
              </span>
            </div>
          ) : null}
          <div className="flex h-14 shrink-0 items-center gap-3 px-4 lg:h-16 lg:px-6">
            <Button
              className="lg:hidden"
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-xl">
              {getPageTitle(pendingPath ?? pathname)}
            </h1>
            <div className="ml-auto flex items-center gap-1.5">
              {!isReadOnlyViewer && !isAdmin ? (
                <div className="mr-1 hidden sm:block">
                  <ExportButton />
                </div>
              ) : null}
              {!isAdmin ? <NotificationBell /> : null}
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                title={`Switch to ${resolvedTheme === "dark" ? "Light" : "Dark"} Mode`}
                aria-label="Toggle theme"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="size-4 text-amber-400" />
                ) : (
                  <Moon className="size-4 text-sky-500" />
                )}
              </button>
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <ProfileAvatar />
            </div>
          </div>
        </header>

        <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <OutingTransactionSyncGate />
          {/* Bottom padding so last section clears the rounded shell edge */}
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 lg:px-6 lg:pb-10 lg:pt-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
