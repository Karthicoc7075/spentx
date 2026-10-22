import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";

async function handleDeleteAccount(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required to delete account." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmation?: string;
    };

    if (body.confirmation !== "DELETE") {
      return NextResponse.json(
        { error: 'Please confirm deletion by typing "DELETE".' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const targetUserId = user.id;

    // Log deletion request before unlinking
    try {
      await admin.from("admin_action_logs").insert({
        admin_id: targetUserId,
        action: "self_account_delete",
        table_name: "users",
        record_id: targetUserId,
        target_user_id: targetUserId,
      });
    } catch (_) {}

    // Unlink dependencies that could violate FK constraints
    await admin.from("users").update({ default_account_id: null }).eq("id", targetUserId);
    await admin.from("transaction_splits").delete().eq("user_id", targetUserId);
    await admin.from("transactions").delete().eq("user_id", targetUserId);
    await admin.from("accounts").delete().eq("user_id", targetUserId);

    // Delete user from auth.users (cascades to all user-owned tables)
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Broadcast revocation on status channel
    try {
      await admin.channel(userStatusChannelName(targetUserId)).send({
        type: "broadcast",
        event: "revoked",
        payload: { reason: "account_deleted" },
      });
    } catch (_) {}

    // Sign out user session
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error during account deletion." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("account/delete", "route_handler", handleDeleteAccount);
