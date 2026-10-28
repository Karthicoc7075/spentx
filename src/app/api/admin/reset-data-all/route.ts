import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

function configuredResetPassword() {
  return process.env.ADMIN_RESET_PASSWORD?.trim() ?? "";
}

function resetPasswordMatches(supplied: string) {
  const expected = configuredResetPassword();
  if (expected.length < 8) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleResetDataAll(request: Request) {
  try {
    if (configuredResetPassword().length < 8) {
      return NextResponse.json(
        {
          error:
            "Reset is disabled: set ADMIN_RESET_PASSWORD (8+ characters) in the server environment first.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      password?: unknown;
      confirm?: unknown;
    };
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (body.confirm !== "RESET ALL USERS DATA") {
      return NextResponse.json(
        { error: 'Type "RESET ALL USERS DATA" to confirm.' },
        { status: 400 },
      );
    }

    if (!password) {
      return NextResponse.json({ error: "Admin password is required." }, { status: 400 });
    }

    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;
    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    if (!resetPasswordMatches(password)) {
      return NextResponse.json(
        { error: "Incorrect password. Access denied." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    const supabase = await createClient();

    // Call RPC or loop over non-admin users
    const { data: nonAdminUsers, error: usersError } = await admin
      .from("users")
      .select("id, email")
      .neq("role", "admin");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const targets = nonAdminUsers ?? [];

    // Audit log before wipe
    await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "reset_all_users_data",
      table_name: "users",
      record_id: null,
      before: {
        target_count: targets.length,
        targets: targets.map((t) => ({ id: t.id, email: t.email })),
      },
      target_user_id: null,
    });

    let resetCount = 0;
    for (const target of targets) {
      try {
        const { error: rpcErr } = await supabase.rpc("admin_reset_user_data", {
          p_target_user_id: target.id,
        });

        if (rpcErr) {
          // Fallback direct cleanup across all child tables in safe dependency order
          await admin.from("users").update({ default_account_id: null }).eq("id", target.id);

          await admin.from("daily_snapshots").delete().eq("user_id", target.id);
          await admin.from("transaction_items").delete().eq("user_id", target.id);
          await admin.from("transaction_splits").delete().eq("user_id", target.id);
          await admin.from("transactions").delete().eq("user_id", target.id);

          await admin.from("outing_settlements").delete().eq("user_id", target.id);
          await admin.from("outing_expenses").delete().eq("user_id", target.id);
          await admin.from("outing_participants").delete().eq("user_id", target.id);
          await admin.from("outings").delete().eq("user_id", target.id);

          await admin.from("friend_settlements").delete().eq("user_id", target.id);
          await admin.from("friend_splits").delete().eq("user_id", target.id);
          await admin.from("friends").delete().eq("user_id", target.id);
          await admin.from("settlements").delete().eq("user_id", target.id);

          await admin.from("savings_goals").delete().eq("user_id", target.id);
          await admin.from("investments").delete().eq("user_id", target.id);
          await admin.from("budgets").delete().eq("user_id", target.id);
          await admin.from("monthly_plans").delete().eq("user_id", target.id);

          await admin.from("purpose_shares").delete().eq("owner_id", target.id);
          await admin.from("share_links").delete().eq("owner_id", target.id);
          await admin.from("user_merchants").delete().eq("user_id", target.id);
          await admin.from("recurring_bills").delete().eq("user_id", target.id);

          await admin.from("accounts").delete().eq("user_id", target.id);
          await admin.from("categories").delete().eq("user_id", target.id);
          await admin.from("purposes").delete().eq("user_id", target.id);
          await admin.from("contributors").delete().eq("user_id", target.id);

          // Seed fresh starter data (same as handle_new_user and admin_reset_user_data)
          await admin.from("purposes").insert([
            {
              user_id: target.id,
              name: "Personal",
              color: "#8b7ff0",
              is_default: true,
              can_delete: false,
              is_active: true,
            },
            {
              user_id: target.id,
              name: "Family",
              color: "#14B8A6",
              is_default: false,
              can_delete: false,
              is_active: true,
            },
          ]);

          const { data: cashAccount } = await admin
            .from("accounts")
            .insert({
              user_id: target.id,
              name: "Cash",
              type: "cash",
              is_default: true,
              can_delete: false,
            })
            .select("id")
            .single();

          await admin.from("contributors").insert({
            user_id: target.id,
            name: "Me",
            is_default: true,
            can_delete: false,
          });

          await admin.from("users").update({
            default_account_id: cashAccount?.id ?? null,
            setup_completed: false,
            show_bank_onboarding: true,
            updated_at: new Date().toISOString(),
          }).eq("id", target.id);
        }

        resetCount++;

        // Broadcast reload to user sessions
        try {
          await admin.channel(userStatusChannelName(target.id)).send({
            type: "broadcast",
            event: "reload",
            payload: { reason: "reset_to_onboarding" },
          });
        } catch {
          // Non-blocking
        }
      } catch (err) {
        console.error(`Error resetting user ${target.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      resetCount,
      message: `Reset complete. ${resetCount} user account(s) had their data cleared and were reset to the onboarding screen. Credentials were preserved.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/reset-data-all", "route_handler", handleResetDataAll);
