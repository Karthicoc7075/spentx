import { defaultPurposes } from "@/lib/mock-data";
import type { Purpose } from "@/types";

export const PERSONAL_PURPOSE_ID = "personal";
/** Legacy alias — mobile / sync use the name "Family". */
export const HOME_PURPOSE_ID = "home";
export const FAMILY_PURPOSE_ID = "family";

const FAMILY_NAME_ALIASES = new Set(["family", "home", "home/family"]);

/** Opening balance is attributed entirely to Personal, not split across purposes. */
export function openingBalanceForPurpose(
  totalOpening: number,
  purposeId: string,
  purposes: Purpose[] = [],
): number {
  return isPersonalPurposeRef(purposeId, purposes) ? totalOpening : 0;
}

export function isFamilyPurposeName(name: string | undefined) {
  return FAMILY_NAME_ALIASES.has((name ?? "").trim().toLowerCase());
}

export function isFamilyPurposeRef(purposeRef: string, purposes: Purpose[]) {
  if (
    purposeRef === FAMILY_PURPOSE_ID ||
    purposeRef === HOME_PURPOSE_ID ||
    isFamilyPurposeName(purposeRef)
  ) {
    return true;
  }
  const purpose = getPurposeById(purposes, purposeRef);
  return isFamilyPurposeName(purpose?.name);
}

export function getDefaultFamilyPurpose(purposes: Purpose[]) {
  const normalized = normalizePurposes(purposes);
  return (
    normalized.find((purpose) => isFamilyPurposeName(purpose.name)) ?? null
  );
}

export function normalizePurpose(purpose: Purpose): Purpose {
  const fallback = defaultPurposes.find(
    (item) =>
      item.id === purpose.id ||
      item.name.toLowerCase() === purpose.name.toLowerCase() ||
      (isFamilyPurposeName(item.name) && isFamilyPurposeName(purpose.name)),
  );

  return {
    ...purpose,
    // Canonical display name for mobile parity.
    name: isFamilyPurposeName(purpose.name) ? "Family" : purpose.name,
    color: purpose.color ?? fallback?.color ?? "#64748b",
    isActive: purpose.isActive ?? true,
    isDefault:
      purpose.isDefault ??
      purpose.name.trim().toLowerCase() === "personal",
    canDelete:
      purpose.canDelete ??
      !(
        purpose.name.trim().toLowerCase() === "personal" ||
        isFamilyPurposeName(purpose.name)
      ),
  };
}

export function normalizePurposes(purposes: Purpose[]) {
  return purposes.map(normalizePurpose);
}

export function getActivePurposes(purposes: Purpose[]) {
  return normalizePurposes(purposes).filter((purpose) => purpose.isActive !== false);
}

export function getPurposeById(purposes: Purpose[], purposeId: string) {
  return normalizePurposes(purposes).find((purpose) => purpose.id === purposeId);
}

export function getDefaultPersonalPurpose(purposes: Purpose[]) {
  const normalized = normalizePurposes(purposes);
  return (
    normalized.find((purpose) => purpose.isDefault) ??
    normalized.find((purpose) => purpose.name.toLowerCase() === "personal") ??
    normalized[0]
  );
}

export function isPersonalPurposeRef(purposeRef: string, purposes: Purpose[]) {
  if (purposeRef === PERSONAL_PURPOSE_ID) return true;
  const defaultPersonal = getDefaultPersonalPurpose(purposes);
  return Boolean(defaultPersonal && purposeRef === defaultPersonal.id);
}

export function transactionMatchesPurpose(
  transactionPurpose: string | undefined,
  filterPurposeId: string,
  purposes: Purpose[],
) {
  if (!filterPurposeId) return true;
  if (!transactionPurpose) {
    return isPersonalPurposeRef(filterPurposeId, purposes);
  }

  const resolvedTransaction = resolvePurposeId(transactionPurpose, purposes);
  const resolvedFilter = resolvePurposeId(filterPurposeId, purposes);
  if (resolvedTransaction === resolvedFilter) return true;

  return (
    isPersonalPurposeRef(filterPurposeId, purposes) &&
    isPersonalPurposeRef(resolvedTransaction, purposes)
  );
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

  if (isFamilyPurposeName(value)) {
    const family = getDefaultFamilyPurpose(normalized);
    if (family) return family.id;
  }

  const legacyMap: Record<string, string> = {
    "purpose-1": FAMILY_PURPOSE_ID,
    "purpose-2": PERSONAL_PURPOSE_ID,
    "purpose-3": FAMILY_PURPOSE_ID,
    Home: FAMILY_PURPOSE_ID,
    Personal: PERSONAL_PURPOSE_ID,
    Family: FAMILY_PURPOSE_ID,
    "Home/Family": FAMILY_PURPOSE_ID,
  };

  return legacyMap[value] ?? PERSONAL_PURPOSE_ID;
}

export function getPurposeDisplayName(
  purposeRef: string | undefined,
  purposes: Purpose[],
) {
  if (!purposeRef) return "Personal";
  if (isPersonalPurposeRef(purposeRef, purposes)) {
    return getDefaultPersonalPurpose(purposes)?.name ?? "Personal";
  }
  if (isFamilyPurposeRef(purposeRef, purposes)) {
    return "Family";
  }
  const purpose = getPurposeById(purposes, purposeRef);
  if (purpose) return purpose.name;
  // Resolve by name when ref is already a label.
  const byName = normalizePurposes(purposes).find(
    (item) => item.name.toLowerCase() === purposeRef.toLowerCase(),
  );
  return byName?.name ?? purposeRef;
}