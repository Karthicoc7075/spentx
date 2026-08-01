"use client";

import { SmsRulesAdminPanel } from "@/components/settings/SmsRulesAdminPanel";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useToast } from "@/providers/toast-provider";

/** Full-page admin editor — Templates + Block SMS only. */
export function AdminSmsRulesPage() {
  const { user } = useSupabaseAuth();
  const { notify } = useToast();

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">SMS rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two lists: bank <strong>templates</strong> (how money SMS parse) and{" "}
          <strong>block</strong> rules (OTP/spam to ignore). Phones pull these
          as shared defaults.
        </p>
      </div>
      <SmsRulesAdminPanel adminId={user?.id} onNotify={notify} />
    </div>
  );
}
