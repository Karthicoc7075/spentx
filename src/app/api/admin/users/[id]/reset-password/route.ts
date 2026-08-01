import { NextResponse } from "next/server";
import { getServerAuthCallbackUrl } from "@/lib/auth-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";

// Admin-triggered password reset. This sends the TARGET user the standard
// reset-password email — the same flow they'd trigger themselves from
// "forgot password" — with the admin merely initiating it. The admin never
// sees or sets the new password; this is deliberately NOT a direct password
// override. Server-only because the audit insert uses the service role.
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

    // Verify the CALLER is a signed-in admin — same gate as user deletion.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Look up the TARGET user's email via the service-role client.
    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("users")
      .select("email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target?.email) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Same mechanism as the login page's "forgot password" flow.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      target.email,
      { redirectTo: getServerAuthCallbackUrl("/auth/reset-password") },
    );

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "password_reset",
      table_name: "users",
      record_id: targetUserId,
      target_user_id: targetUserId,
    });

    if (logError) {
      // The email is already sent; surface the logging failure loudly
      // rather than pretending everything was recorded.
      return NextResponse.json(
        { error: `Reset email sent but audit logging failed: ${logError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/users/reset-password", "route_handler", handlePost);
