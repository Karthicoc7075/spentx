export const PRIMARY_ADMIN_EMAIL = "karthicoc7075@gmail.com";

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (normalized === PRIMARY_ADMIN_EMAIL) {
    return true;
  }

  const envAdmins = (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    process.env.ADMIN_EMAILS ||
    ""
  )
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return envAdmins.includes(normalized);
}

/**
 * Client-side / UI hint only. `user` must be the Supabase *auth* user (email
 * from the verified session). The editable public.users.email is ignored —
 * trusting it let any user rename their profile email to an admin address.
 * The profile role is ignored here too, so a stale/locally-mutated profile
 * object can never unlock admin UI. Real enforcement is server-side:
 * lib/server/admin-auth.ts (verified email OR DB role) and require_admin()
 * inside every admin RPC.
 */
export function isAdminUser(
  user?: { email?: string | null } | null,
  _profile?: { email?: string | null; role?: string | null } | null,
): boolean {
  void _profile;
  return isAdminEmail(user?.email);
}
