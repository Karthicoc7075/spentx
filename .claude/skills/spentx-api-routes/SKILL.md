---
name: spentx-api-routes
description: Use whenever adding a new Next.js Route Handler (API endpoint) under src/app/api/**/route.ts in this repo — so the new endpoint matches this project's established structure/conventions (route logging wrapper, validation, admin auth re-check, audit logging) instead of inventing a new one. Triggers on requests like "add an API route/endpoint", "create a route handler for X".
---

# SpentX API route patterns

Concrete, copy-from-a-real-file conventions for this repo. When asked to add a new API route, follow the sections below instead of improvising a structure. Cite the referenced real files if you need more context than the skeleton gives you.

**Reference files:** `src/app/api/ai/weekly-summary/route.ts` (simple), `src/app/api/auth/sign-up/route.ts` (validation-heavy), `src/app/api/admin/users/[id]/route.ts` (admin + audit-log pattern).

**Rules:**
- One `route.ts` per endpoint under `src/app/api/<area>/.../route.ts`; dynamic segments use `[id]` folders, `params` is a `Promise` (`const { id } = await params`).
- Write a plain `async function handler(request: Request, context?)` (or `handleGet`/`handlePost` if a file exports more than one method), wrap the **entire body** in `try { ... } catch (error) { return NextResponse.json({ error: ... }, { status: 500 }) }`.
- Validate/parse input first and return early with a specific 4xx + `{ error: "..." }` message before doing any work — don't let a bad request fall through to a 500.
- Every exported method handler must be wrapped: `export const POST = withRouteLogging("<area>/<name>", "<route_handler|auth>", handler);` (import from `@/lib/server/with-route-logging`). This is how the endpoint shows up in `/admin/api-logs` — don't skip it, and don't reimplement logging inline.
- Admin-only routes re-verify the caller server-side even though the UI already gates it: `createClient()` → `auth.getUser()` → 401 if none → look up `users.role` → 403 if not `admin`. Never trust a client-supplied "I'm an admin" flag.
- Routes needing the service-role key use `createAdminClient()` from `@/lib/supabase/admin` — only inside a route handler / server-only module, never exposed to the client bundle.
- Destructive/audited admin writes: capture a `before` image and insert into `admin_action_logs` **before** performing the destructive operation, and fail the request if the audit insert itself fails ("refusing to delete without an audit log entry") rather than deleting and logging after.
- Comments explain the non-obvious *why* (e.g. why an operation can't go through the normal RPC layer, why logging happens before vs. after a write) — not what the next line of code does.

**Skeleton:**
```ts
import { NextResponse } from "next/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handler(request: Request) {
  try {
    const body = await request.json();
    // validate body fields, return NextResponse.json({ error }, { status: 400 }) early on failure

    // ...do the work...

    return NextResponse.json({ /* result */ });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
export const POST = withRouteLogging("<area>/<name>", "route_handler", handler);
```

Note: most normal CRUD doesn't need a bespoke route at all — it goes through `/api/proxy/[...path]` automatically via `supabase-data.ts` + RLS. Only add a new route handler when something genuinely needs server-only secrets (Gemini/Resend keys, service-role key) or custom auth-callback logic.
