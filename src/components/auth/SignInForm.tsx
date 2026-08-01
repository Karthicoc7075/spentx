"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeAuthSession,
  ensureUserWorkspace,
  resendVerificationEmail,
  signInWithEmail,
} from "@/lib/supabase-data";
import {
  getAuthErrorMessage,
  validateSignInForm,
  type SignInFieldErrors,
} from "@/lib/auth";
import { useToast } from "@/providers/toast-provider";

export function SignInForm() {
  const router = useRouter();
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});

  async function handleResendVerification() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      notify({
        title: "Enter your email",
        description: "Add the email you signed up with, then resend verification.",
        variant: "destructive",
      });
      return;
    }

    setIsResending(true);
    try {
      await resendVerificationEmail(trimmedEmail);
      notify({
        title: "Verification email sent",
        description: "Check your inbox for a new confirmation link.",
      });
    } catch (error) {
      notify({
        title: "Could not resend email",
        description: getAuthErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateSignInForm({ email, password });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setShowResendVerification(false);
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      const credential = await signInWithEmail(trimmedEmail, trimmedPassword);
      const profile = {
        name: credential.user.displayName ?? "SpentX User",
        email: credential.user.email ?? trimmedEmail,
        photoURL: credential.user.photoURL ?? undefined,
      };
      await ensureUserWorkspace(credential.user.uid, profile);
      await completeAuthSession(credential.user.uid, profile);
      router.replace("/");
    } catch (error) {
      const message = getAuthErrorMessage(error);
      const needsVerification = message.toLowerCase().includes("confirm your email");
      setShowResendVerification(needsVerification);
      notify({
        title: "Sign in failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      subtitle="Track your money. Know your numbers."
      title="Sign in to SpentX"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-primary hover:underline" href="/auth/sign-up">
            Sign up
          </Link>
        </p>
      }
    >
      <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            aria-invalid={Boolean(fieldErrors.email)}
            autoComplete="email"
            className={fieldErrors.email ? "border-destructive" : undefined}
            placeholder="Email address"
            required
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
          />
          {fieldErrors.email ? (
            <p className="text-xs text-destructive">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <Link
              className="text-xs text-primary hover:underline"
              href="/auth/forgot-password"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            aria-invalid={Boolean(fieldErrors.password)}
            autoComplete="current-password"
            className={fieldErrors.password ? "border-destructive" : undefined}
            placeholder="Password"
            required
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
          />
          {fieldErrors.password ? (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          ) : null}
        </div>

        {showResendVerification ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <p>Your email isn&apos;t verified yet.</p>
            <Button
              className="mt-3 h-8 px-3"
              disabled={isResending}
              type="button"
              variant="outline"
              onClick={handleResendVerification}
            >
              {isResending ? "Sending..." : "Resend verification email"}
            </Button>
          </div>
        ) : null}

        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}