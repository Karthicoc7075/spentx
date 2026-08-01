import { NextResponse } from "next/server";
import { sendResendEmail } from "@/lib/resend";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handler(request: Request) {
  try {
    const { to, subject, html, text } = await request.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "to, subject, and html are required." },
        { status: 400 },
      );
    }

    const data = await sendResendEmail({ to, subject, html, text });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error("Send email API error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRouteLogging("send-email", "route_handler", handler);
