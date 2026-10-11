import { Suspense } from "react";
import { AdminLogsPage } from "@/components/admin/AdminLogsPage";
import { AdminLoading } from "@/components/admin/admin-ui";

export default function AdminLogs() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminLogsPage />
    </Suspense>
  );
}
