import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handleDeleteRequest(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
    };

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Check if user exists (without leaking existence to potential attackers)
    try {
      const { data: users } = await admin.auth.admin.listUsers();
      const match = users?.users?.find((u) => u.email?.toLowerCase() === email);

      if (match) {
        // Record deletion request in audit log for compliance review
        await admin.from("admin_action_logs").insert({
          admin_id: match.id,
          action: "deletion_request_submitted",
          table_name: "users",
          record_id: match.id,
          target_user_id: match.id,
        });
      }
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      message:
        "If an account with this email exists, your deletion request has been recorded and will be processed within 48 hours.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("account/delete-request", "route_handler", handleDeleteRequest);
