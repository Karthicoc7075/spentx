import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Simple per-user, per-instance limit for the paid AI endpoints. Serverless
// instances each keep their own window, which is enough to stop a single
// caller from draining the Gemini quota.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function allow(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}

/** Returns the signed-in user id, or a 401/429 response to send back. */
export async function requireAiCaller(
  route: string,
): Promise<{ userId: string } | { response: NextResponse }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return {
        response: NextResponse.json({ error: "Sign in to use AI features." }, { status: 401 }),
      };
    }
    if (!allow(`${route}:${user.id}`)) {
      return {
        response: NextResponse.json(
          { error: "Too many AI requests. Try again in a few minutes." },
          { status: 429 },
        ),
      };
    }
    return { userId: user.id };
  } catch {
    return {
      response: NextResponse.json({ error: "Sign in to use AI features." }, { status: 401 }),
    };
  }
}
