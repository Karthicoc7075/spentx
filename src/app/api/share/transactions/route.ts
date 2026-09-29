import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey } from "@/lib/supabase/admin";
import { getSupabaseUrl } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const purposeId = searchParams.get("purposeId");

    if (!token) {
      return NextResponse.json({ error: "Missing share token" }, { status: 400 });
    }

    const supabaseUrl = getSupabaseUrl();
    const serviceRoleKey = getServiceRoleKey();
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Fetch raw shared transactions via RPC
    const { data: rows, error: rpcError } = await admin.rpc("get_shared_transactions", {
      p_token: token,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ transactions: [] });
    }

    const txIds = (rows as Array<{ id: string }>).map((r) => r.id).filter(Boolean);

    // 2. Fetch live status from transactions table (bypassing RLS with service role)
    const { data: txRecords } = await admin
      .from("transactions")
      .select("id, is_active, deleted_at, outing_id, status")
      .in("id", txIds);

    const txMap = new Map(
      (txRecords ?? []).map((t) => [t.id, t]),
    );

    // 3. Fetch status of any referenced outings
    const outingIds = Array.from(
      new Set(
        (txRecords ?? [])
          .map((t) => t.outing_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let deletedOutingIds = new Set<string>();
    if (outingIds.length > 0) {
      const { data: outingRecords } = await admin
        .from("outings")
        .select("id, is_active, deleted_at, status")
        .in("id", outingIds);

      deletedOutingIds = new Set(
        (outingRecords ?? [])
          .filter(
            (o) =>
              o.is_active === false ||
              Boolean(o.deleted_at) ||
              o.status === "cancelled",
          )
          .map((o) => o.id),
      );
    }

    // 4. Filter and map clean transactions
    const transactions = (rows as Array<any>)
      .filter((row) => {
        const live = txMap.get(row.id);
        if (live) {
          if (live.is_active === false || live.deleted_at || live.status === "deleted") {
            return false;
          }
          if (live.outing_id && deletedOutingIds.has(live.outing_id)) {
            return false;
          }
        }
        if (row.is_active === false || row.deleted_at || row.status === "deleted") {
          return false;
        }
        return true;
      })
      .map((row) => {
        const live = txMap.get(row.id);
        const resolvedPurposeId = purposeId || row.purpose_id || "";
        const totalAmount = Number(row.amount ?? 0);
        const transactionDate = row.transaction_date ?? new Date().toISOString();

        return {
          id: row.id,
          type: row.type,
          merchant: row.merchant ?? "",
          totalAmount,
          amount: totalAmount,
          category: row.category_id ?? "",
          accountName: row.account_name ?? "",
          account: row.account_name ?? "",
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
          outingId: live?.outing_id ?? row.outing_id ?? undefined,
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
