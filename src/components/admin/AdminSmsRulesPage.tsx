"use client";

import { SmsRulesAdminPanel } from "@/components/settings/SmsRulesAdminPanel";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useToast } from "@/providers/toast-provider";
import { AdminPageHeader } from "@/components/admin/admin-ui";

/** Full-page admin editor — Templates + Block SMS only. */
export function AdminSmsRulesPage() {
  const { user } = useSupabaseAuth();
  const { notify } = useToast();

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="SMS rules"
        description="Bank templates (how money SMS are parsed) and block rules (OTP/spam to ignore). Phones pull these as shared defaults; changes are audited."
      />
      <SmsRulesAdminPanel adminId={user?.id} onNotify={notify} />
    </div>
  );
}
