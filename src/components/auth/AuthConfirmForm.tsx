"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ensureUserWorkspace } from "@/lib/supabase-data";

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

export function AuthConfirmForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  const isRecovery = type === "recovery";

  async function handleVerify() {
    if (!tokenHash || !type) {
      setError("This link is invalid. Request a new verification email.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (verifyError) throw verifyError;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await ensureUserWorkspace(user.id, {
          name: (user.user_metadata?.name as string | undefined) ?? "SpentX User",
          email: user.email ?? "",
          photoURL: (user.user_metadata?.avatar_url as string | undefined) ?? undefined,
        });
      }

      if (isRecovery) {
        router.replace("/auth/reset-password");
        return;
      }

      if (type === "signup" || type === "email" || type === "magiclink") {
        router.replace("/?verified=1");
        return;
      }

      router.replace(next);
    } catch (verifyFailure) {
      setError(
        verifyFailure instanceof Error
          ? verifyFailure.message
          : "Verification failed. Request a new email and try again.",
      );
    } finally {
      setIsVerifying(false);
    }
  }

  if (!tokenHash || !type) {
    return (
      <AuthLayout
        subtitle="This confirmation link is incomplete or already used."
        title="Invalid link"
        footer={
          <Link className="text-sm text-primary hover:underline" href="/auth/sign-in">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Request a new verification email from the sign-in page, then open the
          latest message.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      subtitle={
        isRecovery
          ? "Confirm to continue resetting your password."
          : "One click confirms your email and activates your account."
      }
      title={isRecovery ? "Reset your password" : "Confirm your email"}
      footer={
        <Link className="text-sm text-primary hover:underline" href="/auth/sign-in">
          Back to sign in
        </Link>
      }
    >
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          Email scanners can invalidate links before you open them. Tap the button
          below to finish {isRecovery ? "password reset" : "verification"}.
        </p>
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {error}
          </p>
        ) : null}
        <Button disabled={isVerifying} type="button" onClick={handleVerify}>
          {isVerifying
            ? "Please wait..."
            : isRecovery
              ? "Continue to reset password"
              : "Verify my email"}
        </Button>
        <Link className={buttonVariants({ variant: "outline", className: "w-full" })} href="/auth/sign-in">
          Cancel
        </Link>
      </div>
    </AuthLayout>
  );
}