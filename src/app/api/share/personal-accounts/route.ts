import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import type { Account } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACCOUNT_TYPES = new Set<Account["type"]>([
  "bank",
  "cash",
  "wallet",
  "credit",
  "investment",
  "mutual_fund",
  "stocks",
]);

async function handler(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "Missing share token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("owner_id, purpose_id, purpose_name, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
    if (!link || (link.expires_at && new Date(link.expires_at) <= new Date())) {
      return NextResponse.json(
        { error: "This share link is invalid or has expired." },
        { status: 404 },
      );
    }

    const { data: purpose, error: purposeError } = await admin
      .from("purposes")
      .select("name, is_default")
      .eq("id", link.purpose_id)
      .eq("user_id", link.owner_id)
      .maybeSingle();

    if (purposeError) {
      return NextResponse.json({ error: purposeError.message }, { status: 500 });
    }

    const purposeName = (purpose?.name ?? link.purpose_name ?? "").trim().toLowerCase();
    const isPersonal = purpose?.is_default === true || purposeName === "personal";
    // Opening balance belongs to Personal only. Other shared purposes must
    // not receive it, or their net worth would include the whole household seed.
    if (!isPersonal) {
      return NextResponse.json({ accounts: [] });
    }

    const { data: rows, error: accountsError } = await admin
      .from("accounts")
      .select("id, name, type, opening_balance, opening_balance_date")
      .eq("user_id", link.owner_id)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 });
    }

    const accounts = (rows ?? []).map((row) => {
      const type = ACCOUNT_TYPES.has(row.type) ? row.type : "bank";
      return {
        id: row.id,
        name: row.name,
        type,
        openingBalance: Number(row.opening_balance ?? 0),
        openingBalanceDate: row.opening_balance_date ?? undefined,
      };
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export const GET = withRouteLogging("share/personal-accounts", "route_handler", handler);
