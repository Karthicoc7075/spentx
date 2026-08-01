"use client";

import { Loader2, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminEndImpersonation,
  adminListTable,
  adminStartImpersonation,
} from "@/lib/admin-api";
import { setImpersonationSession } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ImpersonatedAuthProvider } from "@/providers/supabase-provider";
import { ViewerProvider } from "@/providers/viewer-provider";
import type { User } from "@/types";

// ============================================================================
// Impersonation shell: starts a server-recorded session on entry, re-provides
// the auth/viewer contexts with the TARGET user's identity for everything
// inside, attaches the session id to every proxied call, and guarantees the
// banner + exit paths. The admin's real session drives all network calls;
// the server proxy substitutes scope and attributes every action to both
// parties. See supabase/migrations/20260723_impersonation.sql.
// ============================================================================

const sections = [
  { slug: "dashboard", label: "Dashboard" },
  { slug: "transactions", label: "Transactions" },
  { slug: "analysis", label: "Analysis" },
  { slug: "plan", label: "Plan" },
  { slug: "outings", label: "Outings" },
  { slug: "friends", label: "Friends" },
  { slug: "alerts", label: "Alerts" },
  { slug: "settings", label: "Settings" },
];

export function ImpersonationShell({
  targetUserId,
  children,
}: {
  targetUserId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [target, setTarget] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const startedRef = useRef(false);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const [rows, newSessionId] = await Promise.all([
          adminListTable({ table: "users", filterUser: targetUserId, limit: 1 }),
          adminStartImpersonation(targetUserId),
        ]);
        const row = rows[0];
        if (!row) throw new Error("Target user not found.");
        sessionRef.current = newSessionId;
        setImpersonationSession(newSessionId);
        setTarget({
          id: targetUserId,
          name: String(row.name ?? "User"),
          email: String(row.email ?? ""),
          photoUrl: (row.photo_url as string | null) ?? undefined,
        });
        setSessionId(newSessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start impersonation.");
      }
    })();

    const handleBeforeUnload = () => {
      // Tab-close backstop — cookies ride along with the beacon.
      if (sessionRef.current) {
        navigator.sendBeacon(
          "/api/impersonation/end",
          new Blob([JSON.stringify({ sessionId: sessionRef.current })], {
            type: "application/json",
          }),
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Navigating away from the route group ends the session too — the
      // explicit Exit button is not the only cleanup path.
      setImpersonationSession(null);
      if (sessionRef.current) {
        const id = sessionRef.current;
        sessionRef.current = null;
        void adminEndImpersonation(id).catch(() => {
          handleBeforeUnload();
        });
      }
    };
  }, [targetUserId]);

  const handleExit = async () => {
    setIsExiting(true);
    setImpersonationSession(null);
    const id = sessionRef.current;
    sessionRef.current = null;
    if (id) {
      try {
        await adminEndImpersonation(id);
      } catch {
        // the inactivity timeout is the final backstop
      }
    }
    router.replace(`/admin/users/${targetUserId}`);
  };

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        <p>{error}</p>
        <Button variant="outline" onClick={() => router.replace(`/admin/users/${targetUserId}`)}>
          Back to user detail
        </Button>
      </div>
    );
  }

  if (!sessionId || !target) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Starting impersonation session…
      </div>
    );
  }

  return (
    <>
      {/* Persistent, impossible-to-miss banner — fixed above everything,
          on every page of this route group, not dismissible. */}
      <div className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-rose-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-lg">
        <ShieldAlert className="size-4 shrink-0" />
        <span>
          Acting as {target.name} ({target.email}) — Admin impersonation session.
          Every action is logged and attributed to you.
        </span>
        <Button
          className="h-6 rounded-full bg-white px-3 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
          disabled={isExiting}
          size="sm"
          onClick={handleExit}
        >
          {isExiting ? <Loader2 className="size-3 animate-spin" /> : (
            <>
              <X className="mr-1 size-3" /> Exit impersonation
            </>
          )}
        </Button>
      </div>
      {/* Spacer so the fixed banner never covers content */}
      <div className="h-10" />

      <nav className="mb-4 flex flex-wrap gap-1 rounded-xl border border-rose-500/40 bg-rose-500/5 p-1">
        {sections.map((section) => {
          const href = `/admin/users/${targetUserId}/impersonate/${section.slug}`;
          const isActive = pathname === href;
          return (
            <Link
              key={section.slug}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive && "bg-background font-semibold text-foreground shadow-sm",
              )}
              href={href}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      {/* Everything below sees the TARGET user via the normal auth/viewer
          contexts — the exact same components the user themselves sees. */}
      <ImpersonatedAuthProvider user={target}>
        <ViewerProvider>{children}</ViewerProvider>
      </ImpersonatedAuthProvider>
    </>
  );
}
