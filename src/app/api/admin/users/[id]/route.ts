import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";

// Deleting a user is the one admin operation that cannot go through the RPC
// layer: removing the auth.users row requires the Supabase Admin API and the
// service role key, which must only ever live server-side. The public.users
// row (and everything hanging off it) cascades from auth.users.
//
// The caller must be a signed-in admin — verified here against the session,
// exactly like the /admin layout guard, before the service role key is used.
async function handleDelete(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

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

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own admin account from here." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Capture a before-image for the audit log while the row still exists.
    const { data: before, error: beforeError } = await admin
      .from("users")
      .select("*")
      .eq("id", targetUserId)
      .maybeSingle();

    if (beforeError) {
      return NextResponse.json({ error: beforeError.message }, { status: 500 });
    }
    if (!before) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Log BEFORE deleting: if the delete then fails, an extra log row is a
    // far smaller problem than a deletion with no audit trail.
    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "delete",
      table_name: "users",
      record_id: targetUserId,
      before,
      target_user_id: targetUserId,
    });

    if (logError) {
      return NextResponse.json(
        { error: `Refusing to delete without an audit log entry: ${logError.message}` },
        { status: 500 },
      );
    }

    // Deleting auth.users cascades to public.users and every user-owned
    // table via the existing on delete cascade FKs.
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Force-logout, live: broadcast on the deleted user's own status channel
    // so any already-open browser tab (subscribed in SupabaseProvider) signs
    // itself out immediately instead of waiting for its JWT to expire or for
    // the periodic getUser() fallback check to catch it. Best-effort — if
    // this fails (e.g. Realtime hiccup), the periodic getUser() revalidation
    // in SupabaseProvider is the safety net, not a second required path.
    try {
      await admin.channel(userStatusChannelName(targetUserId)).send({
        type: "broadcast",
        event: "revoked",
        payload: { reason: "account_deleted" },
      });
    } catch (broadcastError) {
      console.error("Failed to broadcast user-revoked event:", broadcastError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const DELETE = withRouteLogging("admin/users/delete", "route_handler", handleDelete);
