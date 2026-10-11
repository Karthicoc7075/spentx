import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";
import { withRouteLogging } from "@/lib/server/with-route-logging";

// Thin wrapper over the admin_insert_row RPC (20261011_admin_fixes.sql).
// The RPC runs require_admin(), enforces the insert allow-list (no ledger
// rows, no logs, no global settings), validates columns, and writes the audit
// row in the same transaction — no service role key is involved any more.
// The admin UI calls the RPC directly; this route stays for compatibility.
async function handlePost(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;
    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { table, record } = body as { table?: unknown; record?: unknown };
    if (typeof table !== "string" || !table) {
      return NextResponse.json({ error: "table is required." }, { status: 400 });
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return NextResponse.json({ error: "Record data cannot be empty." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_insert_row", {
      p_table: table,
      p_record: record,
    });
    if (error) {
      return NextResponse.json({ error: `Database insert failed: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[admin-insert-row] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to insert record." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/database/insert", "route_handler", handlePost);
