/**
 * Canonical Firestore collection paths and document ID conventions (LLD §5).
 * All financial entities live in top-level collections scoped by userId field.
 */

export const FIRESTORE_COLLECTIONS = {
  purposes: "purposes",
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  snapshots: "snapshots",
  monthlyPlans: "monthlyPlans",
  planTemplates: "planTemplates",
  investments: "investments",
  purposeShares: "purposeShares",
  outings: "outings",
  outingExpenses: "outingExpenses",
  outingSettlements: "outingSettlements",
  friends: "friends",
  contributors: "contributors",
  users: "users",
  defaultCategories: "defaultCategories",
  globalSettings: "globalSettings",
  viewerGrants: "viewerGrants",
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];

/** Top-level collections that require a userId field on every document. */
export const USER_SCOPED_COLLECTIONS = [
  FIRESTORE_COLLECTIONS.purposes,
  FIRESTORE_COLLECTIONS.accounts,
  FIRESTORE_COLLECTIONS.categories,
  FIRESTORE_COLLECTIONS.transactions,
  FIRESTORE_COLLECTIONS.snapshots,
  FIRESTORE_COLLECTIONS.monthlyPlans,
  FIRESTORE_COLLECTIONS.planTemplates,
  FIRESTORE_COLLECTIONS.investments,
  FIRESTORE_COLLECTIONS.friends,
  FIRESTORE_COLLECTIONS.contributors,
] as const;

/** Legacy nested paths under users/{userId}/ — migrated to top-level on read. */
export const LEGACY_USER_SUBCOLLECTIONS = {
  accounts: "accounts",
  purposes: "purposes",
  transactions: "transactions",
  categories: "categories",
  customCategories: "customCategories",
  outings: "outings",
  outing_expenses: "outing_expenses",
  outing_settlements: "outing_settlements",
  investments: "investments",
  friends: "friends",
} as const;

export function monthlyPlanDocumentId(
  userId: string,
  purposeId: string,
  month: string,
) {
  return `${userId}_${purposeId}_${month}`;
}

export function deriveMonthKey(date: string) {
  return date.slice(0, 7);
}