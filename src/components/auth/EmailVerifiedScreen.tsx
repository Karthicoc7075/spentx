"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, buttonVariants } from "@/components/ui/button";

const AUTO_CONTINUE_DELAY_MS = 1800;

export function EmailVerifiedScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") === "error" ? "error" : "success";

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => router.replace("/"), AUTO_CONTINUE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === "error") {
    return (
      <AuthLayout
        subtitle="This verification link is invalid or has already been used."
        title="Link expired"
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Need a new link?{" "}
            <Link className="font-medium text-primary hover:underline" href="/auth/sign-in">
              Go to sign in
            </Link>{" "}
            and try again — you can resend verification from there.
          </p>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 animate-in zoom-in-50 fade-in duration-500 dark:text-amber-400">
            <AlertTriangle className="size-7" />
          </span>
          <p className="text-sm text-muted-foreground">
            Request a fresh verification email and open the latest link.
          </p>
          <Link className={buttonVariants({ className: "w-full" })} href="/auth/sign-in">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Your SpentX account is ready to use." title="Email verified">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 animate-in zoom-in-50 fade-in duration-500 dark:text-emerald-400">
          <CheckCircle2 className="size-7" />
        </span>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in — taking you to your dashboard.
        </p>
        <Button className="w-full" type="button" onClick={() => router.replace("/")}>
          Continue to SpentX
        </Button>
      </div>
    </AuthLayout>
  );
}
