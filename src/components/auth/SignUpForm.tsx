"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  completeAuthSession,
  signInWithGoogle,
  signUpWithEmail,
} from "@/lib/firebase";
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
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});

  async function handleGoogleSignUp() {
    setIsSubmitting(true);
    try {
      const credential = await signInWithGoogle();
      await completeAuthSession(credential.user.uid, {
        name: credential.user.displayName ?? "SpentX User",
        email: credential.user.email ?? "",
        photoURL: credential.user.photoURL ?? undefined,
      });
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
      await signUpWithEmail(trimmedEmail, trimmedPassword, trimmedName);
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

      <div className="relative">
        <Separator />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          or
        </span>
      </div>

      <GoogleAuthButton
        disabled={isSubmitting}
        label="Sign up with Google"
        onClick={handleGoogleSignUp}
      />
    </AuthLayout>
  );
}