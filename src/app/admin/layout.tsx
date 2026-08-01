import { redirect } from "next/navigation";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { createClient } from "@/lib/supabase/server";

// Server-side admin gate for every /admin/* page. This runs on the server
// before any admin UI is rendered — a client-only check (useEffect redirect)
// can be bypassed by disabling JS or racing the redirect, so the role check
// lives here, in the layout itself. All /admin/* pages inherit it.
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    // Not an admin: straight back to the normal dashboard, no admin UI —
    // not even a flash of it.
    redirect("/");
  }

  return <AdminSectionShell>{children}</AdminSectionShell>;
}
