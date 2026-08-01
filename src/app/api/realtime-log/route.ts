import { after } from "next/server";
import {
  extractClientIp,
  logApiCall,
  resolveCallerIdentity,
} from "@/lib/server/api-log";

// Realtime subscriptions are long-lived WebSockets that bypass the HTTP
// proxy, so their START is logged here (one entry per subscribe) — never
// per pushed change event, which would flood the log for as long as a tab
// stays open.
export async function POST(request: Request) {
  let table = "unknown";
  try {
    const body = await request.json();
    if (typeof body?.table === "string" && body.table) {
      table = body.table.slice(0, 100);
    }
  } catch {
    // keep "unknown"
  }

  const authorization = request.headers.get("authorization");
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");

  after(async () => {
    const identity = await resolveCallerIdentity(authorization);
    await logApiCall({
      userId: identity.userId,
      userEmail: identity.email,
      userName: identity.name,
      actorRole: identity.actorRole,
      apiType: "realtime",
      apiName: `realtime:${table}`,
      method: null,
      status: "success",
      statusCode: null,
      errorMessage: null,
      requestSizeBytes: null,
      responseSizeBytes: null,
      durationMs: null,
      ipAddress,
      userAgent,
    });
  });

  return Response.json({ ok: true });
}
