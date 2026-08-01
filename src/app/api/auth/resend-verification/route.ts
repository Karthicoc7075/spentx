import { NextResponse } from "next/server";
import { getServerAuthCallbackUrl } from "@/lib/auth-redirect";
import { isValidEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handler(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getServerAuthCallbackUrl(),
      },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("not found") || message.includes("no user")) {
        return NextResponse.json(
          { error: "No account found for this email. Sign up first." },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Resend verification API error:", error);
    const message =
      error instanceof Error ? error.message : "Could not resend verification email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const POST = withRouteLogging("auth/resend-verification", "auth", handler);
