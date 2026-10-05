import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey } from "@/lib/supabase/admin";
import { getSupabaseUrl } from "@/lib/supabase/env";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() ?? "";
    const purposeId = searchParams.get("purposeId")?.trim() ?? "";

    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "Missing or invalid share token" }, { status: 400 });
    }

    const supabaseUrl = getSupabaseUrl();
    const serviceRoleKey = getServiceRoleKey();
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Validate token existence and expiration
    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("owner_id, purpose_id, expires_at")
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

    // 2. Mark active if pending and update last_viewed_at
    void admin
      .from("purpose_shares")
      .update({
        status: "active",
        last_viewed_at: new Date().toISOString(),
      })
      .or(`link_token.eq.${token},id.eq.${token}`)
      .eq("status", "pending");

    // 3. Fetch shared transactions via RPC (handles soft-deletes and cancelled outings in 1 query)
    const { data: rows, error: rpcError } = await admin.rpc("get_shared_transactions", {
      p_token: token,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ transactions: [] });
    }

    // 3. Map clean transactions with unique split identity and privacy-safe account labels
    const resolvedPurposeId = purposeId || link.purpose_id || "";
    const transactions = (rows as Array<any>).map((row) => {
      const totalAmount = Number(row.amount ?? 0);
      const transactionDate = row.transaction_date ?? new Date().toISOString();
      const splitId = row.split_id ? String(row.split_id) : undefined;
      const parentTransactionId = String(row.id);
      const uniqueId = splitId ? `${parentTransactionId}_${splitId}` : parentTransactionId;

      return {
        id: uniqueId,
        parentTransactionId,
        splitId,
        type: row.type,
        merchant: row.merchant ?? "",
        totalAmount,
        amount: totalAmount,
        category: row.category_id ?? "",
        accountName: row.account_name ?? "Account",
        account: row.account_name ?? "Account",
        purposeId: resolvedPurposeId,
        purpose: resolvedPurposeId,
        source: "manual",
        transactionDate,
        date: transactionDate,
        note: row.note ?? undefined,
        description: row.description ?? undefined,
        contributorSource: row.contributor_name ?? undefined,
        tags: row.tags ?? undefined,
        status: row.status ?? "completed",
        isActive: true,
      };
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
