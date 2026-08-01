"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useToast } from "@/providers/toast-provider";

/** Shows one-time toasts for auth redirect query params (?verified=1, etc.). */
export function AuthQueryEffects() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { notify } = useToast();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const verified = searchParams.get("verified");
    const key = verified ? `verified:${verified}` : null;
    if (!key || handledRef.current === key) return;
    handledRef.current = key;

    if (verified === "1") {
      notify({
        title: "Email verified",
        description: "Welcome to SpentX. Your account is ready.",
      });
      router.replace("/");
    }
  }, [notify, router, searchParams]);

  return null;
}