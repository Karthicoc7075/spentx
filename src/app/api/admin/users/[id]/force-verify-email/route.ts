import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

// Admin-forced email verification. Unlike resend-verification (which sends
// the target another confirmation link to click), this marks the auth.users
// row confirmed directly via the Admin API — no email involved, no action
// required from the target. For support cases where the user genuinely owns
// the inbox but the confirmation email never arrived/was lost. Server-only:
// email_confirm can only be set via the service-role Admin API.
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;
    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    // Look up the TARGET auth user via the service-role client — need
    // email_confirmed_at, which only exists on auth.users, not public.users.
    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin.auth.admin.getUserById(
      targetUserId,
    );

    if (targetError || !target?.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.user.email_confirmed_at) {
      return NextResponse.json(
        { error: "This user's email is already verified." },
        { status: 409 },
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
      email_confirm: true,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "force_verify_email",
      table_name: "users",
      record_id: targetUserId,
      target_user_id: targetUserId,
    });

    if (logError) {
      // The email is already marked verified; surface the logging failure
      // loudly rather than pretending everything was recorded.
      return NextResponse.json(
        { error: `Email verified but audit logging failed: ${logError.message}` },
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

export const POST = withRouteLogging(
  "admin/users/force-verify-email",
  "route_handler",
  handlePost,
);
