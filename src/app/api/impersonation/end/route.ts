import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { invalidateSessionCache } from "@/lib/server/impersonation";

// Tab-close cleanup path for impersonation sessions (navigator.sendBeacon
// can't call an RPC with auth headers, but it does send cookies). The
// explicit Exit button uses the admin_end_impersonation RPC; this route is
// the backstop so closing the tab still ends the session.
export async function POST(request: Request) {
  try {
    let sessionId: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.sessionId === "string") sessionId = body.sessionId;
    } catch {
      // ignore malformed beacon bodies
    }
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: ended } = await admin
      .from("admin_impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("admin_id", user.id)
      .is("ended_at", null)
      .select("target_user_id")
      .maybeSingle();

    if (ended) {
      invalidateSessionCache(sessionId);
      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "impersonate_end",
        table_name: "admin_impersonation_sessions",
        record_id: sessionId,
        target_user_id: ended.target_user_id,
        impersonation_session_id: sessionId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
