import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Page/RSC navigations only — deliberately NOT /api/*.
    //
    // The browser's entire Supabase HTTP layer is tunnelled through
    // /api/proxy/* (see src/lib/supabase/client.ts), which includes
    // POST /api/proxy/auth/v1/token?grant_type=refresh_token. When this
    // matcher covered /api, every data query ALSO ran a server-side
    // supabase.auth.getUser() here with the same cookies — so a page that
    // fires a dozen parallel queries fired a dozen concurrent server-side
    // refreshes racing the browser's own refresh. With refresh-token
    // rotation, whichever rotated token loses the cookie write-back is
    // replayed on the next call, Supabase treats that as refresh-token
    // reuse and revokes the whole session — the user is signed out minutes
    // after logging in, with no logout ever performed.
    //
    // Route Handlers under /api don't need this: they build their own
    // server client (src/lib/supabase/server.ts) and CAN persist rotated
    // cookies themselves.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
