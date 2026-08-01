import { ImpersonationShell } from "@/components/admin/ImpersonationShell";

// Admin gate inherited from the /admin layout (server-side). The shell
// starts/ends the recorded impersonation session and re-provides identity.
export default async function ImpersonateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ImpersonationShell targetUserId={id}>{children}</ImpersonationShell>;
}
