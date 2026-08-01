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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getServerAuthCallbackUrl("/auth/reset-password"),
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("not found") || message.includes("no user")) {
        // Do not reveal whether the account exists.
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Forgot password API error:", error);
    const message =
      error instanceof Error ? error.message : "Could not send password reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const POST = withRouteLogging("auth/forgot-password", "auth", handler);
