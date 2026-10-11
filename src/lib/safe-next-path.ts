/**
 * Only same-site relative paths are allowed as a post-auth redirect.
 * Rejects "//host", "/\host" (browsers treat "\" as "/"), control
 * characters, and anything that resolves to another origin.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  const value = next.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const base = "https://spentx.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
