import { Suspense } from "react";
import { AdminApiLogsPage } from "@/components/admin/AdminApiLogsPage";
import { AdminLoading } from "@/components/admin/admin-ui";

export default function AdminApiLogs() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminApiLogsPage />
    </Suspense>
  );
}
