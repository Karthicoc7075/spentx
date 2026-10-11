import { redirect } from "next/navigation";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { requireAdmin } from "@/lib/server/admin-auth";
import { createClient } from "@/lib/supabase/server";

// Server-side admin gate for every /admin/* page, evaluated before any admin
// UI renders. Admin = public.users.role 'admin' (not self-assignable) or a
// verified auth email on the allow-list — never the editable profile email.
// require_admin() inside every admin RPC enforces the same rule again.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const check = await requireAdmin();

  if (!check.ok) {
    if ((check as Extract<typeof check, { ok: false }>).status === 401) {
      redirect("/auth/sign-in");
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return <AdminAccessDenied userEmail={user?.email} />;
  }

  return <AdminSectionShell>{children}</AdminSectionShell>;
}
