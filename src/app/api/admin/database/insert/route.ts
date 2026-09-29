import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";

const ALLOWED_INSERT_TABLES = new Set([
  "accounts",
  "purposes",
  "categories",
  "contributors",
  "transactions",
  "friends",
  "outings",
  "mail_templates",
  "sms_template_rules",
  "sms_detection_rules",
  "sms_block_rules",
  "budget_templates",
  "user_devices",
  "audit_logs",
  "global_settings",
]);

async function handlePost(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (!isAdminUser(user, profile)) {
      return NextResponse.json(
        { error: "Authorization Error: Admin access required. Only admin@gmail.com can perform this action." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { table, record } = body as { table: string; record: Record<string, unknown> };

    if (!table || !ALLOWED_INSERT_TABLES.has(table)) {
      return NextResponse.json(
        { error: `Table '${table}' is not permitted for insertion.` },
        { status: 400 },
      );
    }

    if (!record || typeof record !== "object" || Object.keys(record).length === 0) {
      return NextResponse.json({ error: "Record data cannot be empty." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: inserted, error: insertError } = await admin
      .from(table)
      .insert(record)
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Database insert failed: ${insertError.message}` },
        { status: 400 },
      );
    }

    const recordId = (inserted as Record<string, unknown>)?.id ? String((inserted as Record<string, unknown>).id) : null;

    // Log the insert action in admin_action_logs
    try {
      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "create",
        table_name: table,
        record_id: recordId,
        before: null,
      });
    } catch (err) {
      console.warn("Failed to write admin action log for insert:", err);
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (error) {
    console.error("[admin-insert-row] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to insert record." },
      { status: 500 },
    );
  }
}

export const POST = withRouteLogging("admin/database/insert", "route_handler", handlePost);
