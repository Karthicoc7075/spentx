import { Suspense } from "react";
import { AdminBackupsPage } from "@/components/admin/AdminBackupsPage";
import { AdminLoading } from "@/components/admin/admin-ui";

export default function AdminBackups() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminBackupsPage />
    </Suspense>
  );
}
