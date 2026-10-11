import { NextResponse } from "next/server";
import { getServerAuthCallbackUrl } from "@/lib/auth-redirect";
import { isValidEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bootstrapUserWorkspace } from "@/lib/user-bootstrap";
import { withRouteLogging } from "@/lib/server/with-route-logging";

function checkYourEmailResponse(name: string, email: string) {
  return NextResponse.json({ session: null, user: null, profileName: name, email });
}

async function handler(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: getServerAuthCallbackUrl(),
      },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("already registered") || message.includes("already exists")) {
        // Same answer as a fresh sign-up, so the form never reveals which
        // emails have accounts. The owner can sign in or reset the password.
        return checkYourEmailResponse(name, email);
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Supabase returns a user with no identities (no error) when the email is
    // already registered and confirmed, to avoid leaking account existence.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return checkYourEmailResponse(name, email);
    }

    if (data.user?.id) {
      await bootstrapUserWorkspace(
        createAdminClient(),
        data.user.id,
        { name, email },
        { recordLogin: false },
      ).catch((bootstrapError) => {
        console.error("Sign-up bootstrap error:", bootstrapError);
      });
    }

    return NextResponse.json({
      session: data.session,
      user: data.user
        ? {
            id: data.user.id,
            uid: data.user.id,
            email: data.user.email,
          }
        : null,
      profileName: name,
      email,
    });
  } catch (error) {
    console.error("Sign-up email API error:", error);
    const message =
      error instanceof Error ? error.message : "Could not create your account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const POST = withRouteLogging("auth/sign-up", "auth", handler);
