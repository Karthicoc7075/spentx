"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPasswordReset } from "@/lib/firebase";
import { getAuthErrorMessage, validateForgotPasswordForm } from "@/lib/auth";
import { useToast } from "@/providers/toast-provider";

export function ForgotPasswordForm() {
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const error = validateForgotPasswordForm(email);
    if (error) {
      setFieldError(error);
      return;
    }

    setFieldError(null);
    setIsSubmitting(true);

    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (submitError) {
      notify({
        title: "Could not send reset link",
        description: getAuthErrorMessage(submitError),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      subtitle="Enter your email. We'll send a reset link."
      title="Reset your password"
      footer={
        <Link
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          href="/auth/sign-in"
        >
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Reset link sent. Check your inbox.
        </p>
      ) : (
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              aria-invalid={Boolean(fieldError)}
              autoComplete="email"
              className={fieldError ? "border-destructive" : undefined}
              placeholder="Email address"
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldError(null);
              }}
            />
            {fieldError ? (
              <p className="text-xs text-destructive">{fieldError}</p>
            ) : null}
          </div>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}