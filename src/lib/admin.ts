import type { User, UserProfile } from "@/types";

export function isAdminEmail(email?: string): boolean {
  if (!email) return false;

  const admins =
    process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return admins.includes(email.toLowerCase());
}

export function isAdminUser(
  user: User | null | undefined,
  profile?: UserProfile | null,
): boolean {
  if (profile?.role === "admin") return true;
  return isAdminEmail(user?.email);
}