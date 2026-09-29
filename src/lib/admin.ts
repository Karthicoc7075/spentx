import type { User, UserProfile } from "@/types";

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

export function isAdminUser(
  user?: { email?: string | null } | null,
  profile?: { email?: string | null; role?: string | null } | null,
): boolean {
  if (isAdminEmail(user?.email)) return true;
  if (isAdminEmail(profile?.email)) return true;

  // The role must be determined from the authenticated account, not just from a frontend toggle.
  // Only admin@gmail.com (and configured admin emails) can be authorized admins.
  if (profile?.role === "admin") {
    return isAdminEmail(user?.email) || isAdminEmail(profile?.email);
  }

  return false;
}