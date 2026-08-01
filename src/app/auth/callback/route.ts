import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next === "/auth/reset-password") {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }
      if (type === "signup" || type === "email") {
        return NextResponse.redirect(`${origin}/?verified=1`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const authError = requestUrl.searchParams.get("error_description")
    ?? requestUrl.searchParams.get("error");
  const signInUrl = new URL("/auth/sign-in", origin);
  signInUrl.searchParams.set("error", "auth_callback_error");
  if (authError) {
    signInUrl.searchParams.set("message", authError);
  }
  return NextResponse.redirect(signInUrl.toString());
}