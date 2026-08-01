import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

// Universal API logging: the browser client's HTTP layer is routed through
// the Next.js transparent proxy (/api/proxy/[...path]) so every REST / RPC /
// auth / storage call is server-observed (real client IP, sizes, duration)
// before being forwarded — with the caller's own auth headers intact, so
// RLS behaves exactly as a direct call. supabase-js itself is unaware; no
// call sites change. Realtime WebSockets don't use fetch and stay direct
// (subscription starts are logged separately via /api/realtime-log).
// Admin impersonation: when set, every proxied call carries the session id
// so the server can validate it and substitute the target user's scope.
// Set/cleared only by the impersonation route group's provider.
let impersonationSessionId: string | null = null;

export function setImpersonationSession(id: string | null) {
  impersonationSessionId = id;
}

function proxiedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // During SSR there is no same-origin base for a relative /api path (and
  // no per-user request context to log against) — call Supabase directly.
  if (typeof window === "undefined") return fetch(input, init);

  const supabaseUrl = getSupabaseUrl();
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (!supabaseUrl || !url.startsWith(supabaseUrl)) return fetch(input, init);

  const proxiedUrl = "/api/proxy/" + url.slice(supabaseUrl.length).replace(/^\/+/, "");

  if (impersonationSessionId) {
    const headers = new Headers(
      init?.headers ??
        (typeof input === "object" && !(input instanceof URL)
          ? input.headers
          : undefined),
    );
    headers.set("x-impersonation-session", impersonationSessionId);
    if (typeof input === "object" && !(input instanceof URL)) {
      return fetch(new Request(proxiedUrl, input), { ...init, headers });
    }
    return fetch(proxiedUrl, { ...init, headers });
  }

  if (typeof input === "object" && !(input instanceof URL)) {
    return fetch(new Request(proxiedUrl, input), init);
  }
  return fetch(proxiedUrl, init);
}

/** Session cookies last 1 year; only explicit logout clears them. */
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: { fetch: proxiedFetch },
    cookieOptions: {
      maxAge: SESSION_MAX_AGE_SEC,
      path: "/",
      sameSite: "lax",
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
