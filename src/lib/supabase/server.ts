import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

// Fallback cookie lifetime only — see src/lib/supabase/client.ts for what
// actually bounds a session (@supabase/ssr writes 400 days of its own).
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookieOptions: {
      maxAge: SESSION_MAX_AGE_SEC,
      path: "/",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? SESSION_MAX_AGE_SEC,
              path: options?.path ?? "/",
              sameSite: options?.sameSite ?? "lax",
            }),
          );
        } catch (error) {
          // Server Components cannot write cookies. That is only safe because
          // src/proxy.ts (the middleware) runs first on every page request
          // and refreshes + persists the rotated tokens, so a Server
          // Component never has to rotate one itself. If that ever stops
          // being true, the rotated refresh token is issued by Supabase and
          // then dropped here — the browser replays the consumed one, which
          // Supabase treats as reuse, and the user is signed out for no
          // visible reason. Surface it in development so it cannot go quiet.
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[supabase/server] auth cookie write was discarded (Server Component context) — the middleware should have refreshed already",
              error,
            );
          }
        }
      },
    },
  });
}
