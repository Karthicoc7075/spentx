import type { PurposeShare } from "@/types";

export function normalizeShareEmail(email: string) {
  return email.trim().toLowerCase();
}

export function emailToShareSlug(email: string) {
  return normalizeShareEmail(email)
    .replace(/@/g, "_at_")
    .replace(/\./g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** LLD §5.3 — O(1) viewer lookup: {purposeId}_{viewerUid} */
export function purposeShareLinkedDocId(purposeId: string, viewerUid: string) {
  return `${purposeId}_${viewerUid}`;
}

/** Pending invite before viewer signs in — scoped by owner to avoid collisions. */
export function purposeSharePendingDocId(
  ownerId: string,
  purposeId: string,
  viewerEmail: string,
) {
  return `${ownerId}_${purposeId}_pending_${emailToShareSlug(viewerEmail)}`;
}

/** Pre-LLD format kept for one-time migration reads. */
export function legacyPurposeShareLinkedDocId(
  ownerId: string,
  purposeId: string,
  viewerUid: string,
) {
  return `${ownerId}__${purposeId}__${viewerUid}`;
}

/** Pre-LLD pending invite format. */
export function legacyPurposeSharePendingDocId(
  ownerId: string,
  purposeId: string,
  viewerEmail: string,
) {
  return `${ownerId}__${purposeId}__pending__${emailToShareSlug(viewerEmail)}`;
}

export function isActiveViewerShare(
  share: PurposeShare,
  viewerUid?: string,
  viewerEmail?: string,
) {
  if (viewerUid && share.viewerUid === viewerUid) return true;
  if (
    viewerEmail &&
    normalizeShareEmail(share.viewerEmail) === normalizeShareEmail(viewerEmail)
  ) {
    return true;
  }
  return false;
}

export function getViewerShares(
  shares: PurposeShare[],
  viewerUid?: string,
  viewerEmail?: string,
) {
  return shares.filter((share) => isActiveViewerShare(share, viewerUid, viewerEmail));
}

export function getOwnedShares(shares: PurposeShare[], ownerId?: string) {
  if (!ownerId) return [];
  return shares.filter((share) => share.ownerId === ownerId);
}

export function viewerGrantDocId(viewerUid: string, ownerId: string) {
  return `${viewerUid}__${ownerId}`;
}

export type ShareExpiryPreset = "1-day" | "7-days" | "1-month" | "6-months" | "always";

export const shareExpiryOptions: Array<{ value: ShareExpiryPreset; label: string }> = [
  { value: "1-day", label: "1 day" },
  { value: "7-days", label: "7 days" },
  { value: "1-month", label: "1 month" },
  { value: "6-months", label: "6 months" },
  { value: "always", label: "Always" },
];

/** Null means "never expires." */
export function computeShareExpiresAt(
  preset: ShareExpiryPreset,
  from: Date = new Date(),
): string | null {
  const date = new Date(from);
  switch (preset) {
    case "1-day":
      date.setDate(date.getDate() + 1);
      return date.toISOString();
    case "7-days":
      date.setDate(date.getDate() + 7);
      return date.toISOString();
    case "1-month":
      date.setMonth(date.getMonth() + 1);
      return date.toISOString();
    case "6-months":
      date.setMonth(date.getMonth() + 6);
      return date.toISOString();
    case "always":
      return null;
  }
}

/** A non-revoked share for the same (purpose, viewer email) already exists —
 * mirrors the DB's purpose_shares_active_owner_purpose_email_idx so the UI
 * can fail fast with a clear message before making any network calls. */
export function findActiveShareForInvite(
  shares: PurposeShare[],
  ownerId: string | undefined,
  purposeId: string,
  viewerEmail: string,
) {
  const normalizedEmail = normalizeShareEmail(viewerEmail);
  return shares.find(
    (share) =>
      share.ownerId === ownerId &&
      share.purposeId === purposeId &&
      normalizeShareEmail(share.viewerEmail) === normalizedEmail &&
      share.status !== "revoked",
  );
}