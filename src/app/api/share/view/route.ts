import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractClientIp, logApiCall } from "@/lib/server/api-log";
import { parseUserAgent } from "@/lib/server/ua-parse";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    let token = "";
    let page = "/share/dashboard";

    try {
      const body = await request.json();
      token = typeof body.token === "string" ? body.token.trim() : "";
      if (typeof body.page === "string") page = body.page.trim();
    } catch {
      const { searchParams } = new URL(request.url);
      token = searchParams.get("token")?.trim() ?? "";
    }

    if (!token) {
      return NextResponse.json({ error: "Missing share token" }, { status: 400 });
    }

    const admin = createAdminClient();

    let shareRecord: any = null;
    let shareLink: any = null;

    if (UUID_RE.test(token)) {
      const { data: psById } = await admin
        .from("purpose_shares")
        .select("*")
        .or(`id.eq.${token},link_token.eq.${token}`)
        .neq("status", "revoked")
        .maybeSingle();

      shareRecord = psById;

      const { data: sl } = await admin
        .from("share_links")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      shareLink = sl;
    }

    if (!shareRecord && shareLink) {
      const { data: ps } = await admin
        .from("purpose_shares")
        .select("*")
        .eq("link_token", shareLink.token)
        .neq("status", "revoked")
        .maybeSingle();

      shareRecord = ps;
    }

    if (!shareRecord && !shareLink) {
      return NextResponse.json(
        { error: "This share link is invalid or has expired." },
        { status: 404 },
      );
    }

    const expiresAt = shareRecord?.expires_at ?? shareLink?.expires_at;
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      return NextResponse.json(
        { error: "This share link has expired." },
        { status: 410 },
      );
    }

    if (!shareLink && shareRecord?.link_token && UUID_RE.test(shareRecord.link_token)) {
      const { data: sl } = await admin
        .from("share_links")
        .select("*")
        .eq("token", shareRecord.link_token)
        .maybeSingle();
      if (sl) shareLink = sl;
    }

    const now = new Date().toISOString();
    const ownerId = shareRecord?.owner_id ?? shareLink?.owner_id;
    const purposeId = shareRecord?.purpose_id ?? shareLink?.purpose_id;

    let updatedTotalViews = 1;
    if (shareRecord) {
      updatedTotalViews = (shareRecord.total_views ?? 0) + 1;
      await admin
        .from("purpose_shares")
        .update({
          status: "active",
          last_viewed_at: now,
          total_views: updatedTotalViews,
        })
        .eq("id", shareRecord.id);
    }

    if (shareLink?.token) {
      await admin
        .from("share_links")
        .update({
          last_viewed_at: now,
          total_views: (shareLink.total_views ?? 0) + 1,
        })
        .eq("token", shareLink.token);
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const ipAddress = extractClientIp(request.headers);
    const ua = parseUserAgent(userAgent);
    const country =
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-vercel-ip-country") ||
      null;

    try {
      const logToken = shareLink?.token ?? (UUID_RE.test(token) ? token : null);
      if (logToken && ownerId && purposeId) {
        await admin.from("share_access_logs").insert({
          share_id: shareRecord?.id ?? null,
          owner_id: ownerId,
          purpose_id: purposeId,
          token: logToken,
          viewed_at: now,
          page,
          device: ua.device,
          browser: ua.browser,
          os: ua.os,
          country,
        });
      }
    } catch (e) {
      console.warn("Could not insert share_access_logs:", e);
    }

    let ownerEmail: string | null = null;
    let ownerName: string | null = null;
    try {
      const { data: ownerUser } = await admin
        .from("users")
        .select("name, email")
        .eq("id", ownerId)
        .maybeSingle();
      ownerEmail = (ownerUser?.email as string | undefined) ?? null;
      ownerName = (ownerUser?.name as string | undefined) ?? null;
    } catch (_) {}

    await logApiCall({
      userId: ownerId,
      userEmail: ownerEmail,
      userName: ownerName,
      actorRole: "anonymous",
      apiType: "route_handler",
      apiName: `share/view`,
      method: "POST",
      status: "success",
      statusCode: 200,
      errorMessage: null,
      requestSizeBytes: 0,
      responseSizeBytes: 0,
      durationMs: Date.now() - startTime,
      ipAddress,
      userAgent,
      platform: "web",
      appVersion: "web",
    });

    try {
      await admin.channel(`user-sync:${ownerId}`).send({
        type: "broadcast",
        event: "share-updated",
        payload: {
          shareId: shareRecord?.id,
          token,
          status: "active",
          lastViewedAt: now,
          totalViews: updatedTotalViews,
          source: "web-viewer",
        },
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      status: "active",
      lastViewedAt: now,
      totalViews: updatedTotalViews,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
