import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClient, getServiceRoleKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Server-side admin authorization.
 *
 * An account is an admin when its public.users.role is 'admin' (users cannot
 * set that themselves — protect_user_role trigger) OR its *verified* auth
 * email (from auth.getUser(), never from public.users.email, which a user can
 * edit) is on the admin allow-list. An allow-listed account whose DB role is
 * not yet 'admin' is promoted with the service role, so the require_admin()
 * guard inside every admin RPC agrees with this check.
 */

export type AdminCheck =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

const NOT_SIGNED_IN: AdminCheck = { ok: false, status: 401, error: "Not signed in." };
const NOT_ADMIN: AdminCheck = {
  ok: false,
  status: 403,
  error: "Admin access required.",
};

async function readRole(userId: string): Promise<string | null> {
  if (getServiceRoleKey()) {
    const admin = createAdminClient();
    const { data } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
    return (data?.role as string | undefined) ?? null;
  }
  // Without a service key, the caller's own row is still readable under RLS
  // and the role column cannot be self-assigned.
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export async function isVerifiedAdmin(user: User): Promise<boolean> {
  const role = await readRole(user.id);
  if (role === "admin") return true;
  if (!isAdminEmail(user.email) || !user.email_confirmed_at) return false;

  // Allow-listed, verified email: align the DB role so admin RPCs work.
  if (getServiceRoleKey()) {
    try {
      const admin = createAdminClient();
      await admin.from("users").update({ role: "admin" }).eq("id", user.id);
    } catch (error) {
      console.error("[admin-auth] failed to sync admin role", error);
    }
  }
  return true;
}

/** Admin check for Route Handlers / Server Components using the cookie session. */
export async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NOT_SIGNED_IN;
  return (await isVerifiedAdmin(user)) ? { ok: true, user } : NOT_ADMIN;
}

export function adminCheckResponse(check: AdminCheck) {
  const failure = check as Extract<AdminCheck, { ok: false }>;
  return NextResponse.json(
    { error: failure.error ?? "Admin access required." },
    { status: failure.status ?? 403 },
  );
}

// --- Bearer token verification ---------------------------------------------

type VerifiedEntry = { user: User | null; expiresAt: number };
const verifiedTokens = new Map<string, VerifiedEntry>();
const VERIFY_TTL_MS = 30 * 1000;

function tokenKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verifies an access token with Supabase Auth (signature, expiry, revocation)
 * and returns the user, or null. Cached for 30s per token hash.
 */
export async function verifyAccessToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const key = tokenKey(token);
  const cached = verifiedTokens.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  let user: User | null = null;
  try {
    const client = createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    user = error ? null : (data.user ?? null);
  } catch {
    user = null;
  }

  if (verifiedTokens.size > 2000) verifiedTokens.clear();
  verifiedTokens.set(key, { user, expiresAt: Date.now() + VERIFY_TTL_MS });
  return user;
}

export function bearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice(7).trim() || null;
}

// --- CSRF ---------------------------------------------------------------------

/**
 * Rejects cross-site state-changing requests to cookie-authenticated admin
 * routes. Returns a 403 response to send, or null when the request is fine.
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!host || originHost !== host) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }
  return null;
}
