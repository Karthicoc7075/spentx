import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Inverse of the /admin layout guard: this route group holds every
// user-facing page (Dashboard at "/", Transactions, Analysis, Plan, Wealth,
// Outings, Friends, Alerts, Settings, Journal, Growth). An admin account
// gets none of them — admins land on /admin and stay there.
//
// Stated assumption (deliberate, per the admin-portal design): admin
// accounts are for administration only, not personal finance use. Anyone who
// also wants to track their own money should use a separate, non-admin
// account. Because of this, no "admin has zero transactions" edge cases need
// special handling anywhere in the user-facing app — an admin simply never
// renders it.
//
// Signed-out visitors are NOT redirected here — the client-side AppShell
// already owns the "redirect to sign-in" flow (including its auth-timeout
// grace period), and duplicating it server-side would fight that logic.
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") {
      redirect("/admin");
    }
  }

  return children;
}
