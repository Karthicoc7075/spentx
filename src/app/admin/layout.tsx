import { redirect } from "next/navigation";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

// Server-side admin gate for every /admin/* page. This runs on the server
// before any admin UI is rendered.
// Role is determined strictly from the authenticated account (admin@gmail.com).
// Normal users receive an explicit authorization error if they attempt to access
// an admin route directly.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();

  const isAuthorized = isAdminUser(user, profile);

  if (!isAuthorized) {
    // Normal users receive an authorization error when accessing admin routes directly
    return <AdminAccessDenied userEmail={user.email} />;
  }

  return <AdminSectionShell>{children}</AdminSectionShell>;
}
