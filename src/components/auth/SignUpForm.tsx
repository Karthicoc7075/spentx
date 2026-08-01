"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeAuthSession,
  ensureUserWorkspace,
  resendVerificationEmail,
  signUpWithEmail,
} from "@/lib/supabase-data";
import {
  getAuthErrorMessage,
  validateSignUpForm,
  type SignUpFieldErrors,
} from "@/lib/auth";
import { useToast } from "@/providers/toast-provider";

export function SignUpForm() {
  const router = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});

  async function handleResendVerification() {
    if (!verificationSentTo) return;
    setIsResending(true);
    try {
      await resendVerificationEmail(verificationSentTo);
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

    const errors = validateSignUpForm({ name, email, password, confirmPassword });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      const result = await signUpWithEmail(trimmedEmail, trimmedPassword, trimmedName);
      if (!result.session || !result.user?.uid) {
        setVerificationSentTo(trimmedEmail);
        return;
      }

      const profile = {
        name: trimmedName,
        email: trimmedEmail,
      };
      await ensureUserWorkspace(result.user.uid, profile);
      await completeAuthSession(result.user.uid, profile);
      router.replace("/");
    } catch (error) {
      notify({
        title: "Sign up failed",
        description: getAuthErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (verificationSentTo) {
    return (
      <AuthLayout
        subtitle="One last step before you can sign in."
        title="Verify your email"
        footer={
          <Link
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            href="/auth/sign-in"
          >
            ← Back to sign in
          </Link>
        }
      >
        <div className="grid gap-4 text-sm">
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-800 dark:text-emerald-200">
            We sent a verification link to{" "}
            <span className="font-medium">{verificationSentTo}</span>. Open it to
            activate your account, then sign in.
          </p>
          <p className="text-muted-foreground">
            Open the email, then tap <span className="font-medium">Verify my email</span>{" "}
            on the confirmation page. If you don&apos;t see the email, check spam or
            resend below.
          </p>
          <Button
            disabled={isResending}
            type="button"
            variant="outline"
            onClick={handleResendVerification}
          >
            {isResending ? "Sending..." : "Resend verification email"}
          </Button>
          <Link className={buttonVariants({ className: "w-full" })} href="/auth/sign-in">
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      subtitle="Start tracking in under a minute."
      title="Create your account"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-primary hover:underline" href="/auth/sign-in">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            aria-invalid={Boolean(fieldErrors.name)}
            autoComplete="name"
            className={fieldErrors.name ? "border-destructive" : undefined}
            placeholder="Your name"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          {fieldErrors.name ? (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          ) : null}
        </div>

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
          <Label htmlFor="password">Create a password</Label>
          <Input
            id="password"
            aria-invalid={Boolean(fieldErrors.password)}
            autoComplete="new-password"
            className={fieldErrors.password ? "border-destructive" : undefined}
            minLength={8}
            placeholder="Create a password"
            required
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          {fieldErrors.password ? (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            autoComplete="new-password"
            className={fieldErrors.confirmPassword ? "border-destructive" : undefined}
            minLength={8}
            placeholder="Confirm password"
            required
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setFieldErrors((current) => ({
                ...current,
                confirmPassword: undefined,
              }));
            }}
          />
          {fieldErrors.confirmPassword ? (
            <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
          ) : null}
        </div>

        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}