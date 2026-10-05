import { NextResponse } from "next/server";
import { sendResendEmail } from "@/lib/resend";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSiteOrigin } from "@/lib/auth-redirect";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
);

async function handler(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Sign in to send invitations." }, { status: 401 });
    }
    const { token } = await request.json();
    if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
      return NextResponse.json({ error: "A share token is required." }, { status: 400 });
    }
    const { data: share, error } = await supabase.from("purpose_shares")
      .select("id, viewer_email, expires_at")
      .eq("owner_id", user.id).eq("link_token", token).eq("kind", "email")
      .neq("status", "revoked").maybeSingle();
    const { data: link } = await supabase.from("share_links")
      .select("purpose_name, expires_at").eq("owner_id", user.id).eq("token", token).maybeSingle();
    if (error || !share?.viewer_email || !link ||
        [share.expires_at, link.expires_at].some((date) => date && new Date(date) <= new Date())) {
      return NextResponse.json({ error: "Invitation is unavailable." }, { status: 404 });
    }
    const admin = createAdminClient();
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_share_invite", {
      p_share_id: share.id, p_owner_id: user.id,
    });
    if (reserveError) throw reserveError;
    if (!reserved) {
      return NextResponse.json({ error: "Invitation already sent or hourly limit reached." }, { status: 429 });
    }
    const url = new URL(`/share/${token}`, getServerSiteOrigin()).toString();
    const data = await sendResendEmail({
      to: share.viewer_email,
      subject: "A SpentX purpose was shared with you",
      html: `<p>You have been invited to view ${escapeHtml(link.purpose_name)} on SpentX.</p><p><a href="${escapeHtml(url)}">Open shared view</a></p>`,
      text: `You have been invited to view a purpose on SpentX: ${url}`,
    });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error("Send email API error:", error);
    return NextResponse.json({ error: "Invitation email could not be sent. You can copy the share link instead." }, { status: 500 });
  }
}

export const POST = withRouteLogging("send-email", "route_handler", handler);
