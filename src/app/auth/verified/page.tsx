"use client";

import { Suspense } from "react";
import { EmailVerifiedScreen } from "@/components/auth/EmailVerifiedScreen";

export default function VerifiedPage() {
  return (
    <Suspense fallback={null}>
      <EmailVerifiedScreen />
    </Suspense>
  );
}
