import type { ImpersonationMode } from "@/lib/admin-api";

// Hand-off between the user detail page (where the admin picks read/write and
// types a reason) and the impersonation shell that starts the session. Kept
// in sessionStorage so the reason never lands in the URL / browser history.
const key = (userId: string) => `spentx_impersonation_request:${userId}`;

export type ImpersonationRequest = { mode: ImpersonationMode; reason: string | null };

export function saveImpersonationRequest(userId: string, request: ImpersonationRequest) {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify({ ...request, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

// Valid for a short window only (survives React strict-mode's double effect
// run, but a later visit to the impersonate URL falls back to read-only).
const MAX_AGE_MS = 60 * 1000;

/** Anything missing, stale or invalid means read-only. */
export function takeImpersonationRequest(userId: string): ImpersonationRequest {
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return { mode: "read", reason: null };
    const parsed = JSON.parse(raw) as Partial<ImpersonationRequest> & { at?: number };
    if (!parsed.at || Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(key(userId));
      return { mode: "read", reason: null };
    }
    return {
      mode: parsed.mode === "write" ? "write" : "read",
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
    };
  } catch {
    return { mode: "read", reason: null };
  }
}

export function clearImpersonationRequest(userId: string) {
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}
