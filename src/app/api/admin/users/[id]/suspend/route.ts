import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";

// Suspend / unsuspend a user via the Auth Admin API (ban_duration). A banned
// user cannot sign in or refresh tokens; existing tabs are told to sign out.
// Data is untouched, so unsuspending fully restores the account.
const SUSPEND_DURATION = "876000h"; // ~100 years

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;
    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { suspend?: unknown; reason?: unknown };
    const suspend = body.suspend !== false;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (suspend && reason.length < 5) {
      return NextResponse.json(
        { error: "A reason (at least 5 characters) is required to suspend a user." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: targetRow } = await admin
      .from("users")
      .select("role")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!targetRow) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (suspend && targetRow.role === "admin") {
      return NextResponse.json({ error: "Admin accounts cannot be suspended here." }, { status: 400 });
    }

    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: suspend ? "suspend" : "unsuspend",
      table_name: "users",
      record_id: targetUserId,
      target_user_id: targetUserId,
      reason: reason || null,
    });
    if (logError) {
      return NextResponse.json(
        { error: `Refusing to change suspension without an audit log entry: ${logError.message}` },
        { status: 500 },
      );
    }

    const { error } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: suspend ? SUSPEND_DURATION : "none",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (suspend) {
      try {
        await admin.channel(userStatusChannelName(targetUserId)).send({
          type: "broadcast",
          event: "revoked",
          payload: { reason: "account_suspended" },
        });
      } catch (broadcastError) {
        console.error("Failed to broadcast user-revoked event:", broadcastError);
      }
    }

    return NextResponse.json({ ok: true, suspended: suspend });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/users/suspend", "route_handler", handlePost);
