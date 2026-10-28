import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { adminCheckResponse, rejectCrossSite, requireAdmin } from "@/lib/server/admin-auth";

async function handleDelete(request: Request) {
  try {
    const csrf = rejectCrossSite(request);
    if (csrf) return csrf;

    const check = await requireAdmin();
    if (!check.ok) return adminCheckResponse(check);
    const user = check.user;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "Type and id are required." }, { status: 400 });
    }

    const admin = createAdminClient();

    if (type === "brand") {
      const { data: before } = await admin
        .from("merchant_brands")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!before) {
        return NextResponse.json({ error: "Brand not found." }, { status: 404 });
      }

      await admin.from("merchant_brand_keys").delete().eq("brand_id", id);
      const { error: delErr } = await admin.from("merchant_brands").delete().eq("id", id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "delete",
        table_name: "merchant_brands",
        record_id: id,
        before,
      });

      return NextResponse.json({ ok: true, message: "Brand deleted successfully." });
    }

    if (type === "keyword") {
      const { data: before } = await admin
        .from("merchant_keyword_rules")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!before) {
        return NextResponse.json({ error: "Keyword rule not found." }, { status: 404 });
      }

      const { error: delErr } = await admin.from("merchant_keyword_rules").delete().eq("id", id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await admin.from("admin_action_logs").insert({
        admin_id: user.id,
        action: "delete",
        table_name: "merchant_keyword_rules",
        record_id: id,
        before,
      });

      return NextResponse.json({ ok: true, message: "Keyword rule deleted successfully." });
    }

    return NextResponse.json({ error: "Invalid type. Must be 'brand' or 'keyword'." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const DELETE = withRouteLogging("admin/merchant-rules/delete", "route_handler", handleDelete);
