import { after } from "next/server";
import {
  extractClientIp,
  logApiCall,
  resolveCallerIdentity,
  resolveCallerIdentityFromCookie,
  type ApiLogEntry,
} from "@/lib/server/api-log";

// Wraps an existing Route Handler with universal API logging. These routes
// already run server-side, so they log their own invocation directly (one
// entry per handler call) instead of passing through the generic proxy.
// Logging happens in after(), adding no latency to the response.
export function withRouteLogging<Ctx>(
  apiName: string,
  apiType: Extract<ApiLogEntry["apiType"], "route_handler" | "auth">,
  handler: (request: Request, context: Ctx) => Promise<Response>,
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    const startTime = Date.now();
    const method = request.method;
    const ipAddress = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent");
    const authorization = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");
    const contentLength = request.headers.get("content-length");
    const requestSizeBytes = contentLength ? Number(contentLength) || null : null;

    let response: Response;
    let thrown: unknown = null;
    try {
      response = await handler(request, context);
    } catch (error) {
      thrown = error;
      response = Response.json({ error: "Unexpected error." }, { status: 500 });
    }

    const durationMs = Date.now() - startTime;
    const statusCode = response.status;
    const isError = thrown !== null || statusCode >= 400;

    // Clone before returning so reading the body doesn't consume the
    // response the client receives.
    const cloned = response.clone();

    after(async () => {
      let responseSizeBytes: number | null = null;
      let errorMessage: string | null = null;
      try {
        const body = await cloned.arrayBuffer();
        responseSizeBytes = body.byteLength;
        if (isError) {
          errorMessage =
            thrown instanceof Error
              ? thrown.message
              : new TextDecoder().decode(body.slice(0, 500)) || `HTTP ${statusCode}`;
        }
      } catch {
        // size/error extraction is best-effort
      }

      const identity = authorization
        ? await resolveCallerIdentity(authorization)
        : await resolveCallerIdentityFromCookie(cookieHeader);

      await logApiCall({
        userId: identity.userId,
        userEmail: identity.email,
        userName: identity.name,
        actorRole: identity.actorRole,
        apiType,
        apiName,
        method,
        status: isError ? "error" : "success",
        statusCode,
        errorMessage,
        requestSizeBytes,
        responseSizeBytes,
        durationMs,
        ipAddress,
        userAgent,
      });
    });

    if (thrown) {
      // Preserve original throw semantics for upstream error handling? No —
      // the JSON 500 above is what the client sees; rethrowing here would
      // double-handle. The error is captured in the log.
    }
    return response;
  };
}
