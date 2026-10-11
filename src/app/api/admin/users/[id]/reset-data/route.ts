import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

async function handleResetUserData(
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

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot reset your own admin account." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Check if target is another admin
    const { data: targetProfile, error: profileError } = await admin
      .from("users")
      .select("id, name, email, role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    if (!targetProfile) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (targetProfile.role === "admin") {
      return NextResponse.json(
        { error: "Cannot reset an admin account." },
        { status: 400 },
      );
    }

    // Call the server RPC using the session client
    const supabase = await createClient();
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "admin_reset_user_data",
      { p_target_user_id: targetUserId },
    );

    if (rpcError) {
      // Fallback: execute via admin client if RPC is not yet compiled
      console.warn("RPC admin_reset_user_data error, executing via service role:", rpcError);
      
      // 1. Unlink default account
      await admin.from("users").update({ default_account_id: null }).eq("id", targetUserId);

      // 2. Delete user data across all tables
      await admin.from("daily_snapshots").delete().eq("user_id", targetUserId);
      await admin.from("transaction_splits").delete().eq("user_id", targetUserId);
      await admin.from("transactions").delete().eq("user_id", targetUserId);
      await admin.from("outing_settlements").delete().eq("user_id", targetUserId);
      await admin.from("outing_expenses").delete().eq("user_id", targetUserId);
      await admin.from("outing_participants").delete().eq("user_id", targetUserId);
      await admin.from("outings").delete().eq("user_id", targetUserId);
      await admin.from("settlements").delete().eq("user_id", targetUserId);
      await admin.from("savings_goals").delete().eq("user_id", targetUserId);
      await admin.from("investments").delete().eq("user_id", targetUserId);
      await admin.from("budgets").delete().eq("user_id", targetUserId);
      await admin.from("monthly_plans").delete().eq("user_id", targetUserId);
      await admin.from("purpose_shares").delete().eq("owner_id", targetUserId);
      await admin.from("share_links").delete().eq("owner_id", targetUserId);
      await admin.from("accounts").delete().eq("user_id", targetUserId);
      await admin.from("categories").delete().eq("user_id", targetUserId);
      await admin.from("purposes").delete().eq("user_id", targetUserId);

      // 3. Seed fresh starter data
      const { data: personalPurpose } = await admin
        .from("purposes")
        .insert({
          user_id: targetUserId,
          name: "Personal",
          color: "#8b7ff0",
          is_default: true,
          can_delete: false,
          is_active: true,
        })
        .select("id")
        .single();

      await admin.from("purposes").insert({
        user_id: targetUserId,
        name: "Family",
        color: "#14B8A6",
        is_default: false,
        can_delete: false,
        is_active: true,
      });

      const { data: cashAccount } = await admin
        .from("accounts")
        .insert({
          user_id: targetUserId,
          name: "Cash",
          type: "cash",
          is_default: true,
          can_delete: false,
        })
        .select("id")
        .single();

      await admin.from("contributors").insert({
        user_id: targetUserId,
        name: "Me",
        is_default: true,
        can_delete: false,
      });

      // 4. Reset user onboarding flags
      await admin
        .from("users")
        .update({
          default_account_id: cashAccount?.id ?? null,
          setup_completed: false,
          show_bank_onboarding: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId);

      // 5. Audit log
      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "reset_user_data",
        table_name: "users",
        record_id: targetUserId,
        target_user_id: targetUserId,
        before: { reset_to_onboarding: true },
      });
    }

    // Force-reload client session live via realtime broadcast
    try {
      await admin.channel(userStatusChannelName(targetUserId)).send({
        type: "broadcast",
        event: "reload",
        payload: { reason: "reset_to_onboarding" },
      });
    } catch (broadcastError) {
      console.error("Failed to broadcast user-reload event:", broadcastError);
    }

    return NextResponse.json({
      ok: true,
      message: `User ${targetProfile.email} data wiped and reset to onboarding.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging(
  "admin/users/[id]/reset-data",
  "route_handler",
  handleResetUserData,
);
