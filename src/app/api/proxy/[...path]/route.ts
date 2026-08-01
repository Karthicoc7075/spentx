import { after } from "next/server";
import {
  extractClientIp,
  logApiCall,
  lookupUserBrief,
  resolveCallerIdentity,
  type ApiLogEntry,
} from "@/lib/server/api-log";
import {
  classifyImpersonatedTable,
  logImpersonatedMutation,
  validateImpersonationSession,
  type ImpersonationSession,
} from "@/lib/server/impersonation";
import { getServiceRoleKey } from "@/lib/supabase/admin";
import { getSupabaseUrl } from "@/lib/supabase/env";

// ============================================================================
// Transparent Supabase proxy — the universal API-logging layer.
//
// The browser's supabase-js client routes its HTTP layer here (see
// src/lib/supabase/client.ts); this handler forwards the raw PostgREST /
// auth / storage request to the real Supabase URL, preserving the caller's
// own apikey/Authorization headers so RLS applies exactly as if the browser
// had called Supabase directly. It is a pass-through plus logging — NOT a
// privilege boundary; the service role is used only for the log insert,
// never for the forwarded call.
//
// Accepted trade-off (explicitly confirmed): every data call now makes two
// hops (browser → Next.js → Supabase) in exchange for complete per-call
// logging with a real client IP.
//
// Realtime WebSockets cannot pass through a Route Handler; they stay direct
// to Supabase and subscription STARTS are logged via /api/realtime-log.
// ============================================================================

// Only what Supabase needs — never cookies (the app's session cookie is a
// Next.js concern) and never hop-by-hop headers.
const FORWARD_REQUEST_HEADERS = [
  "accept",
  "accept-profile",
  "apikey",
  "authorization",
  "content-profile",
  "content-type",
  "prefer",
  "range",
  "range-unit",
  "x-client-info",
  "x-upsert",
];

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "preference-applied",
  "location",
  "x-total-count",
];

type ApiKind = { apiType: ApiLogEntry["apiType"]; apiName: string };

function classify(pathSegments: string[], method: string): ApiKind {
  const [root, , ...rest] = pathSegments; // e.g. ["rest", "v1", "transactions"]
  if (root === "rest") {
    if (rest[0] === "rpc" && rest[1]) return { apiType: "rpc", apiName: rest[1] };
    const table = rest[0] ?? "unknown";
    switch (method) {
      case "POST":
        return { apiType: "rest_insert", apiName: table };
      case "PATCH":
      case "PUT":
        return { apiType: "rest_update", apiName: table };
      case "DELETE":
        return { apiType: "rest_delete", apiName: table };
      default:
        return { apiType: "rest_select", apiName: table };
    }
  }
  if (root === "auth") return { apiType: "auth", apiName: `auth/${rest.join("/")}` };
  if (root === "storage") return { apiType: "storage", apiName: `storage/${rest.join("/")}` };
  return { apiType: "route_handler", apiName: pathSegments.join("/") };
}

// ---------------------------------------------------------------------------
// Impersonation: rewrite an impersonated REST request so the effective scope
// is ALWAYS the session's target user, decided server-side. Returns the
// rewritten pieces, or an error Response when the request isn't allowed.
// ---------------------------------------------------------------------------
type ImpersonationRewrite = {
  path: string[];
  search: URLSearchParams;
  body: ArrayBuffer | null;
  mutation: { action: "create" | "update" | "delete"; table: string } | null;
};

function rewriteForImpersonation(
  path: string[],
  search: URLSearchParams,
  method: string,
  requestBody: ArrayBuffer | null,
  session: ImpersonationSession,
): ImpersonationRewrite | Response {
  const [root, version, ...rest] = path;
  if (root !== "rest") {
    return Response.json(
      { error: `${root} calls are not available during impersonation` },
      { status: 403 },
    );
  }

  // RPCs: only the transaction-create path is supported, via a dedicated
  // service-role-only function with the target id injected server-side.
  if (rest[0] === "rpc") {
    const fn = rest[1] ?? "";
    if (fn !== "create_transaction_with_splits" || method !== "POST") {
      return Response.json(
        { error: `RPC ${fn} is not available during impersonation` },
        { status: 403 },
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(new TextDecoder().decode(requestBody ?? new ArrayBuffer(0)));
    } catch {
      return Response.json({ error: "invalid RPC body" }, { status: 400 });
    }
    parsed.p_user_id = session.targetUserId;
    return {
      path: [root, version, "rpc", "impersonation_create_transaction_with_splits"],
      search,
      body: new TextEncoder().encode(JSON.stringify(parsed)).buffer as ArrayBuffer,
      mutation: { action: "create", table: "transactions" },
    };
  }

  const table = rest[0] ?? "";
  const decision = classifyImpersonatedTable(table);
  if (decision.kind === "blocked") {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const isRead = method === "GET" || method === "HEAD";
  if (decision.kind === "global_read_only") {
    if (!isRead) {
      return Response.json(
        { error: `${table} is read-only during impersonation` },
        { status: 403 },
      );
    }
    return { path, search, body: requestBody, mutation: null };
  }

  if (decision.readOnly && !isRead) {
    return Response.json(
      { error: `${table} is read-only during impersonation` },
      { status: 403 },
    );
  }

  const owner = decision.ownerColumn;
  const newSearch = new URLSearchParams(search);

  if (isRead || method === "PATCH" || method === "DELETE") {
    // Force the owner filter. Any caller-supplied owner filter is removed
    // first — the injected one is the only one that counts.
    newSearch.delete(owner);
    newSearch.append(owner, `eq.${session.targetUserId}`);
  }

  let body = requestBody;
  if ((method === "POST" || method === "PATCH" || method === "PUT") && requestBody) {
    try {
      const text = new TextDecoder().decode(requestBody);
      if (text.trim()) {
        const parsed = JSON.parse(text) as unknown;
        const force = (row: Record<string, unknown>) => {
          row[owner] = session.targetUserId;
        };
        if (Array.isArray(parsed)) parsed.forEach((row) => force(row as Record<string, unknown>));
        else if (parsed && typeof parsed === "object") force(parsed as Record<string, unknown>);
        body = new TextEncoder().encode(JSON.stringify(parsed)).buffer as ArrayBuffer;
      }
    } catch {
      return Response.json(
        { error: "non-JSON write bodies are not supported during impersonation" },
        { status: 400 },
      );
    }
  }

  const mutation = isRead
    ? null
    : ({
        action: method === "POST" ? "create" : method === "DELETE" ? "delete" : "update",
        table,
      } as const);

  return { path, search: newSearch, body, mutation };
}

// Small before-image for the audit log: what the mutation is about to touch.
async function fetchBeforeSnapshot(
  path: string[],
  search: URLSearchParams,
  serviceKey: string,
): Promise<unknown | null> {
  try {
    const snapshotSearch = new URLSearchParams(search);
    snapshotSearch.delete("select");
    snapshotSearch.set("select", "*");
    snapshotSearch.set("limit", "5");
    const url = `${getSupabaseUrl()}/${path.join("/")}?${snapshotSearch.toString()}`;
    const response = await fetch(url, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const startTime = Date.now();
  const { path: originalPath } = await params;
  const requestUrl = new URL(request.url);

  const forwardHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) forwardHeaders.set(name, value);
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let requestBody = hasBody ? await request.arrayBuffer() : null;
  let path = originalPath;
  let search = requestUrl.searchParams;

  // ---- Impersonation branch ----------------------------------------------
  // auth/* calls (the admin's own session refresh) never carry impersonated
  // scope — the header is ignored for them by design.
  const impersonationHeader = request.headers.get("x-impersonation-session");
  let impersonation: ImpersonationSession | null = null;
  let impersonatedMutation: { action: "create" | "update" | "delete"; table: string } | null =
    null;

  if (impersonationHeader && originalPath[0] !== "auth") {
    const caller = await resolveCallerIdentity(request.headers.get("authorization"));
    if (caller.actorRole !== "admin" || !caller.userId) {
      return Response.json({ error: "admin access required" }, { status: 403 });
    }
    const session = await validateImpersonationSession(impersonationHeader, caller.userId);
    if (!session) {
      // Stale/ended/foreign session ids are rejected, never silently allowed.
      return Response.json(
        { error: "impersonation session is not active" },
        { status: 403 },
      );
    }
    const rewritten = rewriteForImpersonation(
      originalPath,
      requestUrl.searchParams,
      request.method,
      requestBody,
      session,
    );
    if (rewritten instanceof Response) return rewritten;

    impersonation = session;
    impersonatedMutation = rewritten.mutation;
    path = rewritten.path;
    search = rewritten.search;
    requestBody = rewritten.body;

    // Execute with the service role — scope is enforced by the rewrite
    // above, not by RLS. This is the deliberate, narrow escalation point.
    const serviceKey = getServiceRoleKey();
    if (!serviceKey) {
      return Response.json(
        { error: "impersonation requires the service role key on the server" },
        { status: 500 },
      );
    }
    forwardHeaders.set("apikey", serviceKey);
    forwardHeaders.set("authorization", `Bearer ${serviceKey}`);

    // Audit before-image for updates/deletes, captured before executing.
    if (impersonatedMutation && impersonatedMutation.action !== "create") {
      const before = await fetchBeforeSnapshot(path, search, serviceKey);
      await logImpersonatedMutation({
        session,
        action: impersonatedMutation.action,
        table: impersonatedMutation.table,
        before,
      });
    } else if (impersonatedMutation) {
      await logImpersonatedMutation({
        session,
        action: "create",
        table: impersonatedMutation.table,
        before: null,
      });
    }
  }

  const searchString = search.toString();
  const targetUrl = `${getSupabaseUrl()}/${path.join("/")}${searchString ? `?${searchString}` : ""}`;

  let upstream: Response | null = null;
  let responseBody: ArrayBuffer | null = null;
  let errorMessage: string | null = null;

  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: requestBody && requestBody.byteLength > 0 ? requestBody : undefined,
      cache: "no-store",
      redirect: "manual",
    });
    responseBody = await upstream.arrayBuffer();
    if (!upstream.ok) {
      errorMessage = new TextDecoder().decode(responseBody.slice(0, 1000)) || upstream.statusText;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "proxy fetch failed";
  }

  const durationMs = Date.now() - startTime;
  const statusCode = upstream?.status ?? 502;
  // Classified against the ORIGINAL path so an impersonated call logs the
  // api_name the client actually invoked, not the rewritten internal one.
  const { apiType, apiName } = classify(originalPath, request.method);
  const authorization = request.headers.get("authorization");
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  const method = request.method;
  const requestSizeBytes = requestBody?.byteLength ?? 0;
  const responseSizeBytes = responseBody?.byteLength ?? 0;
  const status: "success" | "error" = errorMessage ? "error" : "success";
  const impersonationForLog = impersonation;
  // Client platform header: mobile apps send x-spentx-platform (android/ios),
  // browser clients default to 'web'.
  const platformHeader = request.headers.get("x-spentx-platform");
  const platform: "web" | "android" | "ios" =
    platformHeader === "android" || platformHeader === "ios" ? platformHeader : "web";
  const appVersion = request.headers.get("x-spentx-version");

  // Log after the response is sent — the logging write adds zero latency to
  // the proxied call itself.
  after(async () => {
    if (impersonationForLog) {
      // Attributed to the TARGET user (whose data it is) AND to the real
      // admin who acted — both, always, never just one.
      const target = await lookupUserBrief(impersonationForLog.targetUserId);
      await logApiCall({
        userId: impersonationForLog.targetUserId,
        userEmail: target.email,
        userName: target.name,
        actorRole: "user",
        apiType,
        apiName,
        method,
        status,
        statusCode,
        errorMessage,
        requestSizeBytes,
        responseSizeBytes,
        durationMs,
        ipAddress,
        userAgent,
        platform,
        appVersion,
        impersonatedByAdminId: impersonationForLog.adminId,
      });
      return;
    }
    const identity = await resolveCallerIdentity(authorization);
    await logApiCall({
      userId: identity.userId,
      userEmail: identity.email,
      userName: identity.name,
      actorRole: identity.actorRole,
      apiType,
      apiName,
      method,
      status,
      statusCode,
      errorMessage,
      requestSizeBytes,
      responseSizeBytes,
      durationMs,
      ipAddress,
      userAgent,
      platform,
      appVersion,
    });
  });

  if (!upstream) {
    return Response.json({ error: errorMessage ?? "proxy failed" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }

  // HTTP 204 / 205 / 304 must not include a body. Undici's Response
  // constructor throws "Invalid response status code 204" if a body is
  // passed (even an empty ArrayBuffer). PostgREST returns 204 for
  // successful PATCH/UPDATE/DELETE without Prefer: return=representation —
  // which is the default supabase-js update path and was crashing bootstrap.
  const nullBodyStatuses = new Set([204, 205, 304]);
  const body = nullBodyStatuses.has(upstream.status) ? null : responseBody;

  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
  handle as HEAD,
};
