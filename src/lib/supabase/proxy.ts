import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

// Floor for auth cookie lifetime; logout is the only intentional clear.
// @supabase/ssr normally supplies its own 400-day maxAge, so this is the
// fallback for a cookie that arrives without one — never a session timer.
// See src/lib/supabase/client.ts for what really bounds a session.
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookieOptions: {
        maxAge: SESSION_MAX_AGE_SEC,
        path: "/",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? SESSION_MAX_AGE_SEC,
              path: options?.path ?? "/",
              sameSite: options?.sameSite ?? "lax",
            }),
          );
        },
      },
    },
  );

  try {
    await supabase.auth.getUser();
  } catch {
    // Keep requests flowing even if the auth refresh call fails.
  }
  return response;
}
