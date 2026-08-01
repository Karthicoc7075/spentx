import { createClient } from "@/lib/supabase/client";

// Log a realtime subscription START (one entry per subscribe — never per
// pushed change event). Fire-and-forget: logging must never affect the
// subscription itself. The bearer token is attached so the server can
// attribute the entry; the server derives IP/UA from the request itself.
export function logRealtimeSubscribe(table: string): void {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      await fetch("/api/realtime-log", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ table }),
        keepalive: true,
      });
    } catch {
      // never let logging break the app
    }
  })();
}
