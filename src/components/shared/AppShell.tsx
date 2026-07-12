"use client";

import {
  BarChart3,
  Bell,
  CalendarRange,
  Eye,
  HelpCircle,
  LineChart,
  Loader2,
  MapPin,
  Menu,
  PiggyBank,
  ReceiptText,
  Settings,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/shared/ExportButton";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { FirebaseSetupScreen } from "@/components/shared/FirebaseSetupScreen";
import { useOutingTransactionSync } from "@/hooks/useOutingTransactionSync";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
import { cn } from "@/lib/utils";
import { useFirebase } from "@/providers/firebase-provider";
import { useViewerAccess } from "@/providers/viewer-provider";

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

const viewerNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/analytics", label: "Analysis", icon: LineChart },
];

const viewerAllowedPaths = ["/", "/transactions", "/analytics"];

const pageTitles: Array<[string, string]> = [
  ["/transactions", "Transactions"],
  ["/analytics", "Analysis"],
  ["/plan", "Plan"],
  ["/wealth", "Wealth"],
  ["/outings", "Outings"],
  ["/friends", "Friends"],
  ["/alerts", "Alerts"],
  ["/settings", "Settings"],
];

function getPageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  const match = pageTitles.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : "Overview";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isConfigured, isLoading, user, firebaseUser } = useFirebase();
  const { isReadOnlyViewer, sharedPurposeIds } = useViewerAccess();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useOutingTransactionSync();

  useEffect(() => {
    if (!isReadOnlyViewer) return;

    const isAllowed = viewerAllowedPaths.some((path) =>
      path === "/" ? pathname === "/" : pathname.startsWith(path),
    );

    if (!isAllowed) {
      router.replace("/");
    }
  }, [isReadOnlyViewer, pathname, router]);

  const isAuthRoute = pathname.startsWith("/auth");
  // Public no-login share links render standalone, outside the app shell.
  const isShareRoute = pathname.startsWith("/share");

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
    if (!user && !firebaseUser) {
      router.replace("/auth/sign-in");
    }
  }, [authTimedOut, firebaseUser, isAuthRoute, isShareRoute, isLoading, router, user]);

  if (!isConfigured) {
    return <FirebaseSetupScreen />;
  }

  if (isAuthRoute || isShareRoute) {
    return <>{children}</>;
  }

  const shouldShowAuth = !user && (!isLoading || authTimedOut) && !firebaseUser;

  if (isLoading && !user && !authTimedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-xs">Checking your session...</p>
        </div>
      </div>
    );
  }

  if (shouldShowAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-xs">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  function renderNavItems(items: NavItem[]) {
    return items.map((item) => {
      const Icon = item.icon;
      const isActive =
        item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

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
    <div className="min-h-screen bg-page text-foreground lg:p-3">
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
          <Link className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight" href="/">
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
          {renderNavItems(isReadOnlyViewer ? viewerNavItems : mainNavItems)}
        </nav>

        {!isReadOnlyViewer ? (
          <>
            <div className="mx-2 my-4 h-px bg-sidebar-border" />
            <nav className="grid gap-1">{renderNavItems(secondaryNavItems)}</nav>
            <nav className="mt-auto grid gap-1 pt-4">
              {renderNavItems(bottomNavItems)}
            </nav>
          </>
        ) : null}
      </aside>

      <div className="lg:ml-[232px]">
        <div className="flex min-h-screen flex-col overflow-clip bg-background lg:min-h-[calc(100vh-1.5rem)] lg:rounded-r-3xl lg:border lg:border-l-0 lg:border-border">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            {isReadOnlyViewer ? (
              <div className="flex items-center gap-2 border-b border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-900 dark:text-sky-100 lg:px-6">
                <Eye className="size-3.5 shrink-0" />
                <span>
                  Read-only view · {sharedPurposeIds.length} shared purpose
                  {sharedPurposeIds.length === 1 ? "" : "s"} visible
                </span>
              </div>
            ) : null}
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
                {getPageTitle(pathname)}
              </h1>
              <div className="ml-auto flex items-center gap-1.5">
                {!isReadOnlyViewer ? (
                  <div className="mr-1 hidden sm:block">
                    <ExportButton />
                  </div>
                ) : null}
                <Link
                  aria-label="Help"
                  className="hidden size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
                  href="/settings"
                >
                  <HelpCircle className="size-4" />
                </Link>
                <NotificationBell />
                <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
                <ProfileAvatar />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
