"use client";

import { AdminSettingsPage } from "@/components/admin/AdminSettingsPage";

// Under the hard admin/user split, admins can no longer reach the
// user-facing /settings route (its old "Global Settings" tab included), so
// this is now a real page rather than a redirect — redirecting would loop:
// /admin/settings -> /settings -> (app) guard -> /admin.
export default function AdminSettings() {
  return <AdminSettingsPage />;
}
