"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft, LogIn, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

import { PRIMARY_ADMIN_EMAIL } from "@/lib/admin";

export function AdminAccessDenied({
  userEmail,
}: {
  userEmail?: string | null;
}) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card/90 p-6 text-center shadow-lg backdrop-blur-md dark:border-destructive/40 dark:bg-card/70 sm:p-8">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-8 ring-destructive/5">
          <ShieldAlert className="size-8" />
        </div>

        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-destructive">
          <Lock className="size-3" />
          <span>403 Authorization Error</span>
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
          Access Denied
        </h1>

        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
          You do not have administrative privileges to access this area. The
          Admin Management portal is strictly restricted to authorized
          administrators (<span className="font-semibold text-foreground">{PRIMARY_ADMIN_EMAIL}</span>).
        </p>

        {userEmail ? (
          <div className="mb-6 rounded-xl border border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
            Current Authenticated Account:{" "}
            <span className="font-semibold text-foreground">{userEmail}</span>{" "}
            (Role: <span className="font-semibold text-amber-600 dark:text-amber-400">Normal User</span>)
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className={buttonVariants({ variant: "default", className: "w-full sm:w-auto flex items-center gap-2" })}
          >
            <ArrowLeft className="size-4" />
            <span>Return to Dashboard</span>
          </Link>

          <Link
            href="/auth/sign-in"
            className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto flex items-center gap-2" })}
          >
            <LogIn className="size-4" />
            <span>Switch Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
