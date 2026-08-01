"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthErrorMessage } from "@/lib/auth";
import { updatePassword } from "@/lib/supabase-data";
import { useToast } from "@/providers/toast-provider";

export function ResetPasswordForm() {
  const router = useRouter();
  const { notify } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();
    let hasError = false;

    if (trimmedPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (trimmedConfirm !== trimmedPassword) {
      setConfirmError("Passwords do not match.");
      hasError = true;
    } else {
      setConfirmError(null);
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      await updatePassword(trimmedPassword);
      notify({
        title: "Password updated",
        description: "You can now use your new password to sign in.",
      });
      router.replace("/");
    } catch (error) {
      notify({
        title: "Could not update password",
        description: getAuthErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      subtitle="Choose a new password for your account."
      title="Set a new password"
      footer={
        <Link
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          href="/auth/sign-in"
        >
          ← Back to sign in
        </Link>
      }
    >
      <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            aria-invalid={Boolean(passwordError)}
            autoComplete="new-password"
            className={passwordError ? "border-destructive" : undefined}
            minLength={8}
            placeholder="New password"
            required
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          {passwordError ? (
            <p className="text-xs text-destructive">{passwordError}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            aria-invalid={Boolean(confirmError)}
            autoComplete="new-password"
            className={confirmError ? "border-destructive" : undefined}
            minLength={8}
            placeholder="Confirm new password"
            required
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmError(null);
            }}
          />
          {confirmError ? (
            <p className="text-xs text-destructive">{confirmError}</p>
          ) : null}
        </div>

        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : "Update password"}
        </Button>
      </form>
    </AuthLayout>
  );
}