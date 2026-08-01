"use client";

import { Suspense } from "react";
import { AuthConfirmForm } from "@/components/auth/AuthConfirmForm";

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmForm />
    </Suspense>
  );
}