import { NextResponse } from "next/server";
import { getServerAuthCallbackUrl } from "@/lib/auth-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

// Admin-triggered resend of the signup verification email for a user stuck
// unverified. Mirrors reset-password: the admin only re-triggers the email,
// never sees a token, and every call is attributed in admin_action_logs.
// Server-only because the audit insert uses the service role.
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
    const supabase = await createClient();

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

    // Same mechanism as the sign-up page's own "resend verification" flow.
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: target.email,
      options: {
        emailRedirectTo: getServerAuthCallbackUrl(),
      },
    });

    if (resendError) {
      const message = resendError.message.toLowerCase();
      if (message.includes("already confirmed")) {
        return NextResponse.json(
          { error: "This user's email is already verified." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: resendError.message }, { status: 500 });
    }

    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "resend_verification",
      table_name: "users",
      record_id: targetUserId,
      target_user_id: targetUserId,
    });

    if (logError) {
      // The email is already sent; surface the logging failure loudly
      // rather than pretending everything was recorded.
      return NextResponse.json(
        { error: `Verification email sent but audit logging failed: ${logError.message}` },
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
  "admin/users/resend-verification",
  "route_handler",
  handlePost,
);
