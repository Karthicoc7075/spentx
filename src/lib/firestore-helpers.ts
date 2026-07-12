import { deriveMonthKey } from "@/lib/firestore-schema";
import { defaultPurposes, defaultUserSettings } from "@/lib/mock-data";
import { PERSONAL_PURPOSE_ID, resolvePurposeId } from "@/lib/purposes";
import { sumPlanned } from "@/lib/plan";
import type {
  Account,
  Category,
  Contributor,
  EntrySource,
  Friend,
  Investment,
  MonthlyPlan,
  Outing,
  OutingExpense,
  OutingSettlement,
  PlanChangeHistoryEntry,
  Purpose,
  Transaction,
  TransactionSource,
  TransactionType,
  UserDocument,
  UserProfile,
  UserSettings,
} from "@/types";

export function monthlyPlanDocId(
  userId: string,
  month: string,
  purposeId = PERSONAL_PURPOSE_ID,
) {
  if (!purposeId || purposeId === PERSONAL_PURPOSE_ID) {
    return `${userId}_${month}`;
  }
  return `${userId}_${month}_${purposeId}`;
}

export function monthlyPlanDocCandidates(
  userId: string,
  month: string,
  purposeId = PERSONAL_PURPOSE_ID,
) {
  const primary = monthlyPlanDocId(userId, month, purposeId);
  if (purposeId === PERSONAL_PURPOSE_ID && primary === `${userId}_${month}`) {
    return [primary, `${userId}_${month}_${PERSONAL_PURPOSE_ID}`];
  }
  return [primary];
}

function stripUndefinedFields<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
}

/**
 * Firestore rejects `undefined` anywhere in a payload — including inside
 * nested objects and arrays. Recursively removes every undefined field so
 * setDoc never throws "Unsupported field value: undefined".
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      result[key] = stripUndefinedDeep(item);
    }
    return result as T;
  }
  return value;
}

function normalizeTransactionDate(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  const timestampLike = value as
    | { toDate?: () => Date; seconds?: number }
    | undefined;

  if (typeof timestampLike?.toDate === "function") {
    return timestampLike.toDate().toISOString();
  }

  if (typeof timestampLike?.seconds === "number") {
    return new Date(timestampLike.seconds * 1000).toISOString();
  }

  return typeof value === "number" ? new Date(value).toISOString() : "";
}

export function mapEntrySourceFromStore(
  entrySource: unknown,
  source: unknown,
  isAutoDetected?: boolean,
): EntrySource {
  if (entrySource === "manual" || entrySource === "mobile-manual" || entrySource === "sms-auto-detected") {
    return entrySource;
  }
  if (isAutoDetected || source === "import" || source === "bank-sync") {
    return "sms-auto-detected";
  }
  if (source === "mobile") return "mobile-manual";
  return "manual";
}

export function mapEntrySourceToLegacySource(entrySource: EntrySource): TransactionSource {
  if (entrySource === "mobile-manual") return "mobile";
  if (entrySource === "sms-auto-detected") return "import";
  return "manual";
}

export function normalizeTransactionFromStore(
  id: string,
  data: Record<string, unknown>,
): Transaction {
  const merchant =
    (data.merchant as string | undefined) ??
    (data.description as string | undefined) ??
    "";
  const isExpense = data.isExpense as boolean | undefined;
  const type =
    (data.type as TransactionType | undefined) ??
    (isExpense === false ? "income" : "expense");
  const reference =
    (data.reference as string | undefined) ??
    (data.referenceId as string | undefined);
  const date = normalizeTransactionDate(
    data.date ?? data.timestamp ?? data.transactionDate ?? data.createdAt,
  );

  const purpose = resolvePurposeId(data.purpose as string | undefined, defaultPurposes);
  const entrySource = mapEntrySourceFromStore(
    data.entrySource,
    data.source,
    data.isAutoDetected as boolean | undefined,
  );
  const source =
    (data.source as TransactionSource | undefined) ??
    mapEntrySourceToLegacySource(entrySource);
  const monthKey =
    (data.monthKey as string | undefined) ??
    (date ? deriveMonthKey(date.slice(0, 10)) : undefined);

  return {
    id,
    ...(data as Omit<
      Transaction,
      "id" | "merchant" | "type" | "reference" | "date" | "purpose" | "source" | "entrySource" | "monthKey"
    >),
    type,
    merchant,
    date,
    purpose,
    source,
    entrySource,
    monthKey,
    description: (data.description as string | undefined) ?? merchant,
    reference,
    referenceId: reference,
    isExpense: isExpense ?? type === "expense",
    status: (data.status as Transaction["status"]) ?? "completed",
  };
}

export function normalizeTransactionForStore(transaction: Transaction) {
  const { id: _id, ...rest } = transaction;
  const reference = transaction.reference ?? transaction.referenceId;
  const entrySource =
    transaction.entrySource ??
    mapEntrySourceFromStore(
      undefined,
      transaction.source,
      transaction.isAutoDetected,
    );
  const monthKey =
    transaction.monthKey ?? deriveMonthKey(transaction.date.slice(0, 10));

  const payload: Record<string, any> = {
    ...rest,
    type: transaction.type,
    isExpense: transaction.type === "expense",
    description: transaction.description ?? transaction.merchant,
    merchant: transaction.merchant,
    entrySource,
    source: mapEntrySourceToLegacySource(entrySource),
    monthKey,
    status: transaction.status ?? "completed",
  };

  if (reference !== undefined) {
    payload.reference = reference;
    payload.referenceId = reference;
  } else {
    delete payload.reference;
    delete payload.referenceId;
  }

  return stripUndefinedFields(payload);
}

export function normalizeFriendFromStore(
  id: string,
  data: Record<string, unknown>,
): Friend {
  const upiIds = data.upiIds as string[] | undefined;
  const upiId =
    (data.upiId as string | undefined) ?? upiIds?.[0];

  return {
    id,
    ...(data as Omit<Friend, "id" | "upiId" | "upiIds">),
    upiId,
    upiIds: upiIds ?? (upiId ? [upiId] : undefined),
  };
}

export function normalizeFriendForStore(userId: string, friend: Friend) {
  const upiIds = friend.upiIds ?? (friend.upiId ? [friend.upiId] : []);

  return stripUndefinedFields({
    ...friend,
    userId,
    upiIds,
    upiId: friend.upiId ?? upiIds[0],
  });
}

export function normalizeContributorForStore(
  userId: string,
  contributor: Contributor,
) {
  return stripUndefinedFields({
    ...contributor,
    userId,
    isDefault: contributor.isDefault ?? false,
    createdAt: contributor.createdAt ?? new Date().toISOString(),
  });
}

export function normalizeCategoryForStore(userId: string, category: Category) {
  return stripUndefinedFields({
    ...category,
    userId,
    isDefault: category.isDefault ?? false,
  });
}

export function normalizePurposeForStore(userId: string, purpose: Purpose) {
  return stripUndefinedFields({
    ...purpose,
    userId,
    is_active: purpose.is_active ?? purpose.isActive ?? true,
    createdAt: purpose.createdAt ?? new Date().toISOString(),
  });
}

export function normalizeAccountForStore(userId: string, account: Account) {
  return stripUndefinedFields({
    ...account,
    userId,
    is_active: account.is_active ?? true,
    openingBalance: account.openingBalance ?? 0,
    createdAt: account.createdAt,
    openingBalanceDate: account.openingBalanceDate,
  });
}

export function normalizeOutingExpenseForStore(
  userId: string,
  expense: OutingExpense,
) {
  return stripUndefinedFields({
    ...expense,
    userId,
  });
}

export function normalizeOutingSettlementForStore(
  userId: string,
  settlement: OutingSettlement,
) {
  return stripUndefinedFields({
    ...settlement,
    userId,
  });
}

export function normalizeInvestmentFromStore(
  id: string,
  data: Record<string, unknown>,
): Investment {
  const amount = data.amount as number | undefined;
  const investedAmount =
    (data.investedAmount as number | undefined) ?? amount ?? 0;
  const currentValue =
    (data.currentValue as number | undefined) ?? amount ?? investedAmount;

  return {
    id,
    ...(data as Omit<Investment, "id" | "investedAmount" | "currentValue" | "amount">),
    investedAmount,
    currentValue,
    amount: amount ?? currentValue,
    growthPercent: data.growthPercent as number | undefined,
  };
}

export function normalizeInvestmentForStore(
  userId: string,
  investment: Investment,
) {
  return stripUndefinedFields({
    ...investment,
    userId,
    amount: investment.amount ?? investment.currentValue ?? investment.investedAmount,
    growthPercent: investment.growthPercent,
  });
}

export function normalizeOutingFromStore(id: string, data: Record<string, unknown>): Outing {
  const name =
    (data.name as string | undefined) ??
    (data.title as string | undefined) ??
    "Outing";

  return {
    id,
    ...(data as Omit<Outing, "id" | "name">),
    name,
    title: (data.title as string | undefined) ?? name,
    createdBy:
      (data.createdBy as string | undefined) ??
      (data.userId as string | undefined),
    userId: (data.userId as string | undefined) ?? (data.createdBy as string | undefined),
  };
}

export function normalizeOutingForStore(userId: string, outing: Outing) {
  const { id: _id, ...rest } = outing;
  const participants =
    outing.participants ??
    outing.members?.map((member) => member.id).filter(Boolean) ??
    [];

  return stripUndefinedFields({
    ...rest,
    userId,
    createdBy: outing.createdBy ?? userId,
    title: outing.title ?? outing.name,
    name: outing.name,
    participants,
  });
}

export function parseUserDocument(
  userId: string,
  data: Record<string, unknown> | undefined,
): UserDocument | null {
  if (!data) return null;

  const rawSettings = (data.settings as Record<string, unknown> | undefined) ?? {};
  const settings: UserSettings = {
    ...defaultUserSettings,
    ...(rawSettings as UserSettings),
    autoSync:
      (rawSettings.autoSync as boolean | undefined) ??
      (rawSettings.autoDetection as boolean | undefined) ??
      defaultUserSettings.autoSync,
  };

  return {
    uid: (data.uid as string | undefined) ?? userId,
    name: (data.name as string | undefined) ?? "SpentX User",
    email: (data.email as string | undefined) ?? "",
    photoURL: data.photoURL as string | undefined,
    phone: data.phone as string | undefined,
    joinedAt: data.joinedAt as string | undefined,
    role: data.role as UserProfile["role"],
    settings,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export function buildUserDocumentPayload(
  profile: UserProfile,
  settings: UserSettings,
): Omit<UserDocument, "uid"> & { uid: string } {
  return {
    uid: profile.uid,
    name: profile.name,
    email: profile.email,
    photoURL: profile.photoURL,
    phone: profile.phone,
    joinedAt: profile.joinedAt,
    role: profile.role,
    settings: {
      ...settings,
      autoDetection: settings.autoDetection ?? settings.autoSync,
    },
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function appendPlanChangeHistory(
  previous: MonthlyPlan | null,
  next: MonthlyPlan,
  userId: string,
): PlanChangeHistoryEntry[] {
  const history = [...(previous?.changeHistory ?? [])];
  const date = todayIsoDate();

  function pushIfChanged(
    type: PlanChangeHistoryEntry["type"],
    oldValue: number | undefined,
    newValue: number | undefined,
    note?: string,
  ) {
    if (oldValue === undefined && newValue === undefined) return;
    if (oldValue === newValue) return;

    // Build the entry without undefined fields — Firestore rejects them.
    const entry: PlanChangeHistoryEntry = {
      date,
      type,
      changedBy: userId,
    };
    if (oldValue !== undefined) entry.oldValue = oldValue;
    if (newValue !== undefined) entry.newValue = newValue;
    if (note !== undefined) entry.note = note;

    history.push(entry);
  }

  pushIfChanged(
    "income_updated",
    previous?.expectedIncome,
    next.expectedIncome,
  );
  pushIfChanged(
    "budget_updated",
    previous?.monthlyBudget,
    next.monthlyBudget,
  );
  pushIfChanged(
    "safe_limit_changed",
    previous?.safeSpendingLimit,
    next.safeSpendingLimit,
  );

  const previousPlanned = previous ? sumPlanned(previous.allocations) : undefined;
  const nextPlanned = sumPlanned(next.allocations);
  pushIfChanged(
    "allocation_changed",
    previousPlanned,
    nextPlanned,
    "Total planned allocation changed",
  );

  return history;
}

export function enrichMonthlyPlan(
  plan: MonthlyPlan,
  previous: MonthlyPlan | null,
  userId: string,
): MonthlyPlan {
  const totalPlanned = sumPlanned(plan.allocations);
  const monthlyBudget = plan.monthlyBudget ?? totalPlanned;
  const totalIncome = plan.totalIncome ?? plan.expectedIncome;
  const totalExpense = plan.totalExpense ?? 0;
  const remainingBudget = plan.remainingBudget ?? monthlyBudget - totalExpense;
  const savingsRate =
    plan.savingsRate ??
    (totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
      : 0);
  const savingsTarget =
    plan.savingsTarget ??
    Math.max(0, plan.expectedIncome - totalPlanned);

  const daysInMonth = plan.month
    ? new Date(
        Number(plan.month.split("-")[0]),
        Number(plan.month.split("-")[1]),
        0,
      ).getDate()
    : 30;
  const dailySafeLimit =
    plan.dailySafeLimit ??
    plan.safeSpendingLimit ??
    (monthlyBudget > 0 ? Math.round(monthlyBudget / daysInMonth) : 0);

  const changeHistory = appendPlanChangeHistory(previous, plan, userId);
  const isFirstSave = !previous && !plan.isTemplate;

  return stripUndefinedDeep({
    ...plan,
    userId,
    totalPlanned,
    monthlyBudget,
    dailySafeLimit,
    safeSpendingLimit: dailySafeLimit,
    savingsTarget,
    totalIncome,
    totalExpense,
    remainingBudget,
    savingsRate,
    changeHistory,
    budgetSetAt:
      plan.budgetSetAt ??
      previous?.budgetSetAt ??
      new Date().toISOString(),
    isBudgetLocked: plan.isBudgetLocked ?? (previous?.isBudgetLocked ?? isFirstSave),
    lastModifiedBy: userId,
  });
}