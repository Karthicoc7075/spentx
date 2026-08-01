/** Site origin for Supabase auth email links (verification + password reset). */

export type AuthEmailLinkType = "signup" | "magiclink" | "recovery";

export function getSiteOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function getServerSiteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function getAuthCallbackUrl(next = "/") {
  const origin = getSiteOrigin();
  const url = new URL("/auth/callback", origin);
  if (next && next !== "/") {
    url.searchParams.set("next", next);
  }
  return url.toString();
}

export function getServerAuthCallbackUrl(next = "/") {
  const url = new URL("/auth/callback", getServerSiteOrigin());
  if (next && next !== "/") {
    url.searchParams.set("next", next);
  }
  return url.toString();
}

/** Client confirm page — avoids email prefetch consuming one-time tokens. */
export function buildAuthConfirmUrl(
  tokenHash: string,
  type: AuthEmailLinkType,
  next = "/",
) {
  const url = new URL("/auth/confirm", getServerSiteOrigin());
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  if (next && next !== "/") {
    url.searchParams.set("next", next);
  }
  return url.toString();
}

export function verificationLinkFromGenerateLink(
  properties: { hashed_token?: string | null } | null | undefined,
  type: AuthEmailLinkType,
  next = "/",
) {
  const tokenHash = properties?.hashed_token;
  if (!tokenHash) return null;
  return buildAuthConfirmUrl(tokenHash, type, next);
}