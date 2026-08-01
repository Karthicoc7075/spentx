import type {
  Account,
  AnalyticsFilters,
  Category,
  Contributor,
  Purpose,
  SmartView,
} from "@/types";

type SmartViewContext = {
  accounts: Account[];
  purposes: Purpose[];
  categories: Category[];
  contributors: Contributor[];
};

/**
 * Resolves a Smart View's saved ids to today's live filter values.
 * A dimension whose referenced row was since deleted (account/purpose/
 * contributor removed) resolves to "" — i.e. no filter on that dimension —
 * rather than erroring, since the FK is `on delete set null`.
 */
export function resolveSmartViewFilters(
  view: SmartView,
  context: SmartViewContext,
): Pick<AnalyticsFilters, "account" | "purposeId" | "purpose" | "categories" | "contributorSource"> {
  const account = view.accountId
    ? context.accounts.find((item) => item.id === view.accountId)
    : undefined;
  const purpose = view.purposeId
    ? context.purposes.find((item) => item.id === view.purposeId)
    : undefined;
  const contributor = view.contributorId
    ? context.contributors.find((item) => item.id === view.contributorId)
    : undefined;
  const categoryNames = view.categoryIds
    .map((id) => context.categories.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    account: account?.name ?? "",
    purposeId: purpose?.id ?? "",
    purpose: purpose?.name ?? "",
    categories: categoryNames,
    contributorSource: contributor?.name ?? "",
  };
}

/** Whether `filters` currently matches what applying `view` would produce. */
export function isSmartViewActive(
  view: SmartView,
  filters: AnalyticsFilters,
  context: SmartViewContext,
): boolean {
  const resolved = resolveSmartViewFilters(view, context);
  return (
    resolved.account === filters.account &&
    resolved.purposeId === filters.purposeId &&
    resolved.contributorSource === filters.contributorSource &&
    resolved.categories.length === filters.categories.length &&
    resolved.categories.every((name) => filters.categories.includes(name))
  );
}

/** Short "Account · Category, Category" style preview for a Smart View card. */
export function describeSmartView(
  view: SmartView,
  context: SmartViewContext,
): string {
  const parts: string[] = [];
  if (view.accountId) {
    const account = context.accounts.find((item) => item.id === view.accountId);
    if (account) parts.push(account.name);
  }
  if (view.purposeId) {
    const purpose = context.purposes.find((item) => item.id === view.purposeId);
    if (purpose) parts.push(purpose.name);
  }
  if (view.categoryIds.length > 0) {
    const names = view.categoryIds
      .map((id) => context.categories.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 1) parts.push(names[0]);
    else if (names.length > 1) parts.push(`${names.length} categories`);
  }
  if (view.contributorId) {
    const contributor = context.contributors.find(
      (item) => item.id === view.contributorId,
    );
    if (contributor) parts.push(contributor.name);
  }
  return parts.length > 0 ? parts.join(" · ") : "All transactions";
}
