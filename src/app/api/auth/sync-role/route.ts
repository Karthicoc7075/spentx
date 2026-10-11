import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedAdmin, rejectCrossSite } from "@/lib/server/admin-auth";
import { withRouteLogging } from "@/lib/server/with-route-logging";

// Promote-only role sync: an allow-listed, *verified* auth email gets
// role='admin' in public.users (so admin RPCs accept it). It never demotes —
// DB-assigned admins keep their role, and roles are not derived from the
// editable profile email.
async function handlePost(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const isAdmin = await isVerifiedAdmin(user);

    return NextResponse.json({
      userId: user.id,
      email: (user.email ?? "").trim().toLowerCase(),
      role: isAdmin ? "admin" : "user",
      isAdmin,
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
