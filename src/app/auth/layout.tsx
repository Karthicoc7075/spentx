import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/AuthGate";

export const metadata: Metadata = {
  title: "Sign in — SpentX",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate mode="guest-only">{children}</AuthGate>;
}