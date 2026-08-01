"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

export default function ShareRootPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/share/${token}/dashboard`);
  }, [router, token]);

  return null;
}
