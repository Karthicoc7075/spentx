"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useFirebase } from "@/providers/firebase-provider";

type AuthGateProps = {
  children: ReactNode;
  mode: "guest-only" | "require-auth";
};

export function AuthGate({ children, mode }: AuthGateProps) {
  const router = useRouter();
  const { user, isLoading } = useFirebase();

  useEffect(() => {
    if (isLoading) return;

    if (mode === "guest-only" && user) {
      router.replace("/");
    }

    if (mode === "require-auth" && !user) {
      router.replace("/auth/sign-in");
    }
  }, [isLoading, mode, router, user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (mode === "guest-only" && user) {
    return null;
  }

  if (mode === "require-auth" && !user) {
    return null;
  }

  return <>{children}</>;
}