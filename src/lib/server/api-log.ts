// Server-only log writer for user_api_logs. The ONE deliberate place the
// service role key is used for writes: request metadata (IP, UA) must come
// from the trusted server context, never from a client-supplied value, and
// the table's RLS blocks all client inserts by design.
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUserAgent } from "@/lib/server/ua-parse";

export type ApiLogEntry = {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  actorRole: "user" | "admin" | "anonymous";
  apiType:
    | "rest_select"
    | "rest_insert"
    | "rest_update"
    | "rest_delete"
    | "rpc"
    | "route_handler"
    | "auth"
    | "storage"
    | "realtime";
  apiName: string;
  method: string | null;
  status: "success" | "error";
  statusCode: number | null;
  errorMessage: string | null;
  requestSizeBytes: number | null;
  responseSizeBytes: number | null;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Client platform: web, android, or ios. */
  platform?: "web" | "android" | "ios" | null;
  /** Client application version string (e.g. 1.0.0+42). */
  appVersion?: string | null;
  /** Set only for calls made inside an admin impersonation session. */
  impersonatedByAdminId?: string | null;
};

// Fire-and-forget insert; a logging failure must never break the actual call.
export async function logApiCall(entry: ApiLogEntry): Promise<void> {
  const apiNameLower = entry.apiName.toLowerCase();
  const isShareOperation =
    apiNameLower.includes("share") ||
    apiNameLower.includes("shared") ||
    apiNameLower.includes("/share/");
  const isExportOperation = apiNameLower.includes("export");

  // Skip routine GET / SELECT read logs to prevent DB bloat, but PRESERVE:
  // 1. All mutations (POST, PUT, DELETE, PATCH, INSERT, UPDATE, RPC)
  // 2. All EXPORT operations
  // 3. ALL SHARED LINK GET READS & views (capturing visitor IP, device, OS, time)
  // 4. All AUTH & Impersonation events
  // 5. All API errors (status === "error")
  const isRoutineGetRead =
    (entry.method === "GET" || entry.apiType === "rest_select") &&
    entry.status !== "error" &&
    !isExportOperation &&
    !isShareOperation &&
    !entry.impersonatedByAdminId &&
    entry.apiType !== "auth";

  if (isRoutineGetRead) return;

  try {
    const { device, browser, os } = parseUserAgent(entry.userAgent);
    const admin = createAdminClient();
    const { error } = await admin.from("user_api_logs").insert({
      user_id: entry.userId,
      user_email: entry.userEmail,
      user_name: entry.userName,
      actor_role: entry.actorRole,
      api_type: entry.apiType,
      api_name: entry.apiName.slice(0, 200),
      method: entry.method,
      status: entry.status,
      status_code: entry.statusCode,
      error_message: entry.errorMessage ? entry.errorMessage.slice(0, 500) : null,
      request_size_bytes: entry.requestSizeBytes,
      response_size_bytes: entry.responseSizeBytes,
      duration_ms: entry.durationMs,
      ip_address: entry.ipAddress,
      device,
      browser,
      os,
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 500) : null,
      platform: entry.platform ?? null,
      app_version: entry.appVersion ? entry.appVersion.slice(0, 50) : null,
      impersonated_by_admin_id: entry.impersonatedByAdminId ?? null,
    });
    if (error) console.error("user_api_logs insert failed:", error.message);
  } catch (error) {
    console.error("user_api_logs insert failed:", error);
  }
}

// Real client IP: standard proxy headers first (x-forwarded-for is set by
// Vercel and most hosts), then x-real-ip. Null when nothing is present —
// never a client-supplied value.
export function extractClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

// --- Caller identity ------------------------------------------------------

type CachedIdentity = {
  role: "user" | "admin";
  name: string | null;
  email: string | null;
  expiresAt: number;
};

const identityCache = new Map<string, CachedIdentity>();
const IDENTITY_TTL_MS = 5 * 60 * 1000;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export type CallerIdentity = {
  userId: string | null;
  email: string | null;
  name: string | null;
  actorRole: "user" | "admin" | "anonymous";
};

// Brief profile lookup (name/email/role) with the same short cache — used
// by the proxy to attribute impersonated calls to the TARGET user.
export async function lookupUserBrief(
  userId: string,
): Promise<{ name: string | null; email: string | null; role: "user" | "admin" }> {
  const cached = identityCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { name: cached.name, email: cached.email, role: cached.role };
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("role, name, email")
      .eq("id", userId)
      .maybeSingle();
    const role = data?.role === "admin" ? "admin" : "user";
    const identity: CachedIdentity = {
      role,
      name: (data?.name as string | undefined) ?? null,
      email: (data?.email as string | undefined) ?? null,
      expiresAt: Date.now() + IDENTITY_TTL_MS,
    };
    identityCache.set(userId, identity);
    return { name: identity.name, email: identity.email, role };
  } catch {
    return { name: null, email: null, role: "user" };
  }
}

// Identity from the @supabase/ssr auth cookie (used by Route Handlers whose
// callers authenticate via cookie session rather than a bearer header).
// Handles the chunked (sb-...-auth-token.0/.1) and base64- prefixed formats.
export async function resolveCallerIdentityFromCookie(
  cookieHeader: string | null,
): Promise<CallerIdentity> {
  const anonymous: CallerIdentity = {
    userId: null,
    email: null,
    name: null,
    actorRole: "anonymous",
  };
  if (!cookieHeader) return anonymous;

  try {
    const cookies = new Map<string, string>();
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }

    const chunks: Array<[string, string]> = [];
    for (const [name, value] of cookies) {
      if (/^sb-.*-auth-token(\.\d+)?$/.test(name)) chunks.push([name, value]);
    }
    if (!chunks.length) return anonymous;

    chunks.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    let raw = decodeURIComponent(chunks.map(([, value]) => value).join(""));
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    }
    const session = JSON.parse(raw) as { access_token?: string };
    if (!session.access_token) return anonymous;
    return resolveCallerIdentity(`Bearer ${session.access_token}`);
  } catch {
    return anonymous;
  }
}

// Identity for logging purposes, derived from the caller's bearer token.
// The JWT is not re-verified here — Supabase itself verifies it on the
// forwarded call, so a forged token yields an error row attributed to the
// claimed (invalid) identity, which is exactly what an audit log wants to
// capture. The role/name lookup hits public.users via the service client,
// cached briefly to avoid a DB round-trip on every single proxied call.
export async function resolveCallerIdentity(
  authorizationHeader: string | null,
): Promise<CallerIdentity> {
  const anonymous: CallerIdentity = {
    userId: null,
    email: null,
    name: null,
    actorRole: "anonymous",
  };

  if (!authorizationHeader?.startsWith("Bearer ")) return anonymous;
  const payload = decodeJwtPayload(authorizationHeader.slice(7));
  const userId = typeof payload?.sub === "string" ? payload.sub : null;
  // The anon key itself is a JWT with role 'anon' and no sub.
  if (!userId) return anonymous;

  const email = typeof payload?.email === "string" ? payload.email : null;

  const cached = identityCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId, email: email ?? cached.email, name: cached.name, actorRole: cached.role };
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("role, name, email")
      .eq("id", userId)
      .maybeSingle();
    const role = data?.role === "admin" ? "admin" : "user";
    const identity: CachedIdentity = {
      role,
      name: (data?.name as string | undefined) ?? null,
      email: (data?.email as string | undefined) ?? email,
      expiresAt: Date.now() + IDENTITY_TTL_MS,
    };
    identityCache.set(userId, identity);
    return { userId, email: identity.email, name: identity.name, actorRole: role };
  } catch {
    return { userId, email, name: null, actorRole: "user" };
  }
}
