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