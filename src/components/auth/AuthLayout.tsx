"use client";

import { WalletCards } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import { DarkAmbientRays } from "@/components/shared/DarkAmbientRays";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page p-6">
      <DarkAmbientRays />
      <Card className="relative z-10 w-full max-w-md rounded-3xl shadow-none">
        <CardHeader className="text-center">
          <Link
            className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-background"
            href="/auth/sign-in"
          >
            <WalletCards className="size-5" />
          </Link>
          <CardTitle className="mt-4 text-xl font-semibold">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {children}
          {footer}
        </CardContent>
      </Card>
    </div>
  );
}