"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useSupabaseAuth } from "@/providers/supabase-provider";

type AuthGateProps = {
  children: ReactNode;
  mode: "guest-only" | "require-auth";
};

const AUTHENTICATED_AUTH_PATHS = ["/auth/reset-password"];

export function AuthGate({ children, mode }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useSupabaseAuth();
  const allowAuthenticatedOnAuthRoute = AUTHENTICATED_AUTH_PATHS.some((path) =>
    pathname.startsWith(path),
  );

  useEffect(() => {
    if (isLoading) return;

    if (mode === "guest-only" && user && !allowAuthenticatedOnAuthRoute) {
      router.replace("/");
    }

    if (mode === "require-auth" && !user) {
      router.replace("/auth/sign-in");
    }
  }, [allowAuthenticatedOnAuthRoute, isLoading, mode, router, user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (mode === "guest-only" && user && !allowAuthenticatedOnAuthRoute) {
    return null;
  }

  if (mode === "require-auth" && !user) {
    return null;
  }

  return <>{children}</>;
}