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
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/firebase";
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
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});

  async function handleGoogleSignIn() {
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
        title: "Sign in failed",
        description: getAuthErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      const credential = await signInWithEmail(trimmedEmail, trimmedPassword);
      await completeAuthSession(credential.user.uid, {
        name: credential.user.displayName ?? "SpentX User",
        email: credential.user.email ?? trimmedEmail,
        photoURL: credential.user.photoURL ?? undefined,
      });
      router.replace("/");
    } catch (error) {
      notify({
        title: "Sign in failed",
        description: getAuthErrorMessage(error),
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

        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : "Sign in"}
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
        label="Sign in with Google"
        onClick={handleGoogleSignIn}
      />
    </AuthLayout>
  );
}