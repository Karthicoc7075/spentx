import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { userStatusChannelName } from "@/lib/supabase-data";

// "Reset All Database Data" — the admin portal's nuclear option. It does three
// things, in this order:
//
//   1. Deletes every non-admin auth user. Removing the auth.users row cascades
//      to public.users and every user-owned table, and invalidates that user's
//      refresh token, which is what actually logs them out.
//   2. Broadcasts "revoked" on each deleted user's status channel so any tab
//      that is open right now signs itself out immediately instead of waiting
//      for its access token to expire (SupabaseProvider owns the listener).
//   3. Purges what is left — the admin's own transactions/outings/accounts and
//      the global log tables — via admin_reset_all_data().
//
// What survives: admin accounts (their logins keep working, the admin running
// this stays signed in) and the admin_action_logs audit trail, which records
// the reset itself.
//
// Two independent gates guard it: the caller must be a signed-in admin, and
// must re-type the reset password. The admin check is verified here against
// the session — exactly like the /admin layout guard — before the service role
// key is used, and again inside the RPC via require_admin().

const DEFAULT_RESET_PASSWORD = "karthi";

function resetPasswordMatches(supplied: string) {
  const expected = process.env.ADMIN_RESET_PASSWORD?.trim() || DEFAULT_RESET_PASSWORD;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function listAllAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: { id: string; email?: string }[] = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list users: ${error.message}`);

    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? undefined })));
    if (data.users.length < perPage) break;
  }

  return users;
}

async function handleReset(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (!password) {
      return NextResponse.json({ error: "Admin password is required." }, { status: 400 });
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

    if (!resetPasswordMatches(password)) {
      return NextResponse.json(
        { error: "Incorrect password. Access denied." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    // Work out who is protected. Every user carrying role = 'admin' survives,
    // not just the one clicking the button — locking out the other admins
    // would be a side effect nobody asked for.
    const { data: adminRows, error: adminRowsError } = await admin
      .from("users")
      .select("id")
      .eq("role", "admin");

    if (adminRowsError) {
      return NextResponse.json({ error: adminRowsError.message }, { status: 500 });
    }

    const protectedIds = new Set<string>(adminRows?.map((row) => row.id as string) ?? []);
    protectedIds.add(user.id); // belt and braces: never delete the caller

    const allUsers = await listAllAuthUsers(admin);
    const targets = allUsers.filter((candidate) => !protectedIds.has(candidate.id));

    // Log BEFORE destroying anything: if the purge then fails halfway, an
    // audit entry for an incomplete reset is far better than a reset with no
    // trail at all. admin_action_logs is one of the tables the purge preserves.
    const { error: logError } = await admin.from("admin_action_logs").insert({
      admin_id: user.id,
      action: "reset_all",
      table_name: null,
      record_id: null,
      before: {
        deleted_user_count: targets.length,
        deleted_users: targets.map((target) => ({ id: target.id, email: target.email })),
        preserved_admin_ids: [...protectedIds],
      },
      target_user_id: null,
    });

    if (logError) {
      return NextResponse.json(
        { error: `Refusing to reset without an audit log entry: ${logError.message}` },
        { status: 500 },
      );
    }

    const failedUsers: { id: string; email?: string; reason: string }[] = [];
    let deletedUsers = 0;

    for (const target of targets) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
      if (deleteError) {
        failedUsers.push({ id: target.id, email: target.email, reason: deleteError.message });
        continue;
      }
      deletedUsers += 1;

      // Force-logout, live. Best-effort: if Realtime hiccups, the deleted
      // token is already dead server-side and SupabaseProvider's periodic
      // getUser() revalidation is the safety net.
      try {
        await admin.channel(userStatusChannelName(target.id)).send({
          type: "broadcast",
          event: "revoked",
          payload: { reason: "database_reset" },
        });
      } catch (broadcastError) {
        console.error("Failed to broadcast user-revoked event:", broadcastError);
      }
    }

    // Purge what the cascades did not reach: the admin's own rows plus the
    // global log tables. Called on the session client, not the service-role
    // one, because require_admin() inside the RPC reads auth.uid().
    const { data: purge, error: purgeError } = await supabase.rpc("admin_reset_all_data");

    if (purgeError) {
      return NextResponse.json(
        {
          error: `Users were deleted but the table purge failed: ${purgeError.message}`,
          deletedUsers,
          failedUsers,
        },
        { status: 500 },
      );
    }

    const tableCount =
      typeof purge === "object" && purge !== null && "table_count" in purge
        ? Number((purge as { table_count: unknown }).table_count)
        : 0;

    return NextResponse.json({
      success: true,
      deletedUsers,
      preservedAdmins: protectedIds.size,
      tablesPurged: tableCount,
      failedUsers,
      message:
        `Reset complete. ${deletedUsers} user account${deletedUsers === 1 ? "" : "s"} deleted and signed out, ` +
        `${tableCount} table${tableCount === 1 ? "" : "s"} purged. ` +
        `${protectedIds.size} admin account${protectedIds.size === 1 ? "" : "s"} and the admin audit log were preserved.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/reset-all", "route_handler", handleReset);
