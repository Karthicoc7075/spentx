import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handlePost() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const email = (user.email ?? "").trim().toLowerCase();
    const shouldBeAdmin = isAdminEmail(email);
    const targetRole = shouldBeAdmin ? "admin" : "user";

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("id, role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && profile.role !== targetRole) {
      await admin
        .from("users")
        .update({ role: targetRole })
        .eq("id", user.id);
    }

    return NextResponse.json({
      userId: user.id,
      email,
      role: targetRole,
      isAdmin: shouldBeAdmin,
    });
  } catch (error) {
    console.error("[sync-role] Error syncing role:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("auth/sync-role", "auth", handlePost);
