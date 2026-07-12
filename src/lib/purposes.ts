import { defaultPurposes } from "@/lib/mock-data";
import type { Purpose } from "@/types";

export const PERSONAL_PURPOSE_ID = "personal";
export const HOME_PURPOSE_ID = "home";

/** Opening balance is attributed entirely to Personal, not split across purposes. */
export function openingBalanceForPurpose(
  totalOpening: number,
  purposeId: string,
): number {
  return purposeId === PERSONAL_PURPOSE_ID ? totalOpening : 0;
}

export function normalizePurpose(purpose: Purpose): Purpose {
  const fallback = defaultPurposes.find(
    (item) => item.id === purpose.id || item.name === purpose.name,
  );

  return {
    ...purpose,
    color: purpose.color ?? fallback?.color ?? "#64748b",
    is_active: purpose.is_active ?? true,
  };
}

export function normalizePurposes(purposes: Purpose[]) {
  return purposes.map(normalizePurpose);
}

export function getActivePurposes(purposes: Purpose[]) {
  return normalizePurposes(purposes).filter((purpose) => purpose.is_active !== false);
}

export function getPurposeById(purposes: Purpose[], purposeId: string) {
  return normalizePurposes(purposes).find((purpose) => purpose.id === purposeId);
}

export function isHomeFamilyPurpose(purposeId: string, purposes: Purpose[]) {
  const purpose = getPurposeById(purposes, purposeId);
  if (!purpose) {
    return purposeId === HOME_PURPOSE_ID;
  }
  return (
    purpose.id === HOME_PURPOSE_ID ||
    purpose.name.toLowerCase().includes("home") ||
    purpose.name.toLowerCase().includes("family")
  );
}

export function transactionMatchesPurpose(
  transactionPurpose: string | undefined,
  filterPurposeId: string,
  purposes: Purpose[],
) {
  if (!filterPurposeId) return true;
  if (!transactionPurpose) return filterPurposeId === PERSONAL_PURPOSE_ID;

  const resolved = resolvePurposeId(transactionPurpose, purposes);
  return resolved === filterPurposeId;
}

export function getPurposeLabel(purposeId: string, purposes: Purpose[]) {
  const purpose = getPurposeById(purposes, purposeId);
  return purpose?.name ?? purposeId;
}

export function resolvePurposeId(
  value: string | undefined,
  purposes: Purpose[],
): string {
  if (!value) return PERSONAL_PURPOSE_ID;

  const normalized = normalizePurposes(purposes);
  const byId = normalized.find((purpose) => purpose.id === value);
  if (byId) return byId.id;

  const byName = normalized.find(
    (purpose) => purpose.name.toLowerCase() === value.toLowerCase(),
  );
  if (byName) return byName.id;

  const legacyMap: Record<string, string> = {
    "purpose-1": HOME_PURPOSE_ID,
    "purpose-2": PERSONAL_PURPOSE_ID,
    "purpose-3": HOME_PURPOSE_ID,
    Home: HOME_PURPOSE_ID,
    Personal: PERSONAL_PURPOSE_ID,
    Family: HOME_PURPOSE_ID,
  };

  return legacyMap[value] ?? PERSONAL_PURPOSE_ID;
}