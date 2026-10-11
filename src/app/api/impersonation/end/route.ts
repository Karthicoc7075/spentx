import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateSessionCache } from "@/lib/server/impersonation";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

// Tab-close cleanup path for impersonation sessions (navigator.sendBeacon
// can't call an RPC with auth headers, but it does send cookies). The
// Exit button uses it too, because ending here also clears this server's
// session cache immediately (the RPC path cannot).
export async function POST(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;

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

    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

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
