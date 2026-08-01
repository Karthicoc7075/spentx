import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { logRealtimeSubscribe } from "@/lib/realtime-log";
import {
  bootstrapUserWorkspace,
  clearBootstrapSessionCache,
  readBootstrapClientContext,
  type BootstrapClientContext,
} from "@/lib/user-bootstrap";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  defaultAppConfig,
  defaultCategories,
  defaultUserSettings,
  defaultNotificationPreferences,
} from "@/lib/mock-data";
import { deriveMonthKey } from "@/lib/data-schema";
import { getTodayCalendarDate } from "@/lib/date-filters";
import { buildOpeningBalanceTransaction } from "@/lib/wealth";
import {
  getDefaultPersonalPurpose,
  isPersonalPurposeRef,
  PERSONAL_PURPOSE_ID,
} from "@/lib/purposes";
import type {
  Account,
  AiChatMessage,
  AiInsight,
  AppConfig,
  BalanceSnapshot,
  Category,
  Contributor,
  DefaultCategory,
  Friend,
  GlobalSettings,
  IncomeStream,
  IncomeTargets,
  MonthlyPlan,
  NetWorthSnapshot,
  Outing,
  OutingCategoryRow,
  OutingExpense,
  OutingSettlement,
  FriendSplit,
  FriendSettlement,
  TripMember,
  PlanTemplate,
  Preferences,
  Purpose,
  PurposeShare,
  Reflection,
  SavingsGoal,
  SmartAlert,
  SmartView,
  SmsBlockRule,
  SmsDetectionRule,
  SmsTemplateRule,
  Transaction,
  UserDocument,
  UserMerchant,
  UserProfile,
  UserSettings,
} from "@/types";
import { OUTING_CATEGORIES } from "@/types";
import type { ServerTransactionFilters } from "@/lib/transactions-query";
import { applyServerTransactionFilters } from "@/lib/transactions-query";

type Row = Record<string, any>;
type ProfileSavedListener = ((userId: string) => void) | null;
export const isSupabaseConfigured = hasSupabaseConfig();

let profileSavedListener: ProfileSavedListener = null;

function toAuthUser(user: any) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    displayName: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
    photoURL: user.user_metadata?.avatar_url ?? null,
  };
}

export function setProfileSavedListener(listener: ProfileSavedListener) {
  profileSavedListener = listener;
}

function client() {
  return createClient();
}

function nowIso() {
  return new Date().toISOString();
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function compact<T extends Row>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  ) as T;
}

async function throwIfError<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

function toUserProfile(row: Row | null | undefined): UserProfile | null {
  if (!row) return null;
  return {
    uid: row.id,
    name: row.name ?? "SpentX User",
    email: row.email ?? "",
    photoURL: row.photo_url ?? undefined,
    phone: row.phone ?? undefined,
    joinedAt: row.joined_at ?? undefined,
    role: row.role ?? "user",
  };
}

function toUserSettings(row: Row | null | undefined): UserSettings {
  if (!row) return defaultUserSettings;
  return {
    theme: row.theme ?? defaultUserSettings.theme,
    notifications: row.notifications ?? defaultUserSettings.notifications,
    notificationPreferences:
      row.notification_preferences ?? defaultNotificationPreferences,
    defaultAccountId: row.default_account_id ?? "",
    monthlySafeSpendingAlert:
      row.monthly_safe_spending_alert ??
      defaultUserSettings.monthlySafeSpendingAlert,
    privateMode: row.private_mode ?? defaultUserSettings.privateMode,
    includeOutingExpenses: row.include_outing_expenses ?? true,
    dashboardKpiCards: row.dashboard_kpi_cards ?? undefined,
  };
}

function toAccount(row: Row): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    last4: row.last4 ?? undefined,
    openingBalance: Number(row.opening_balance ?? 0),
    openingBalanceDate: row.opening_balance_date ?? undefined,
    purposeIds: row.purpose_ids ?? undefined,
    isDefault: row.is_default ?? false,
    canDelete: row.can_delete ?? true,
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function accountPayload(userId: string | undefined, account: Account): Row {
  const row = compact({
    id: isUuid(account.id) ? account.id : undefined,
    user_id: userId,
    name: account.name,
    type: account.type,
    last4: account.last4,
    opening_balance: account.openingBalance ?? 0,
    opening_balance_date: account.openingBalanceDate,
    purpose_ids: account.purposeIds?.filter(isUuid),
    is_default: account.isDefault ?? false,
    can_delete: account.canDelete ?? true,
    is_active: account.isActive ?? true,
    deleted_at: account.deletedAt,
    deleted_by: isUuid(account.deletedBy) ? account.deletedBy : undefined,
  });
  return row;
}

function toCategory(row: Row, source: "global" | "custom" = "custom"): Category {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon ?? undefined,
    isDefault: source === "global",
    canDelete: row.can_delete ?? source !== "global",
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    source,
    isInvestment: row.is_investment ?? false,
  };
}

function categoryPayload(userId: string | undefined, category: Category): Row {
  return compact({
    id: isUuid(category.id) ? category.id : undefined,
    user_id: userId,
    name: category.name,
    type: category.type,
    color: category.color,
    icon: category.icon ?? "tag",
    can_delete: category.canDelete ?? true,
    is_active: category.isActive ?? true,
    deleted_at: category.deletedAt,
    deleted_by: isUuid(category.deletedBy) ? category.deletedBy : undefined,
    is_investment: category.isInvestment ?? false,
  });
}

function toPurpose(row: Row): Purpose {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    isDefault: row.is_default ?? false,
    canDelete: row.can_delete ?? true,
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

function purposePayload(userId: string | undefined, purpose: Purpose): Row {
  const active = purpose.isActive !== false;
  return compact({
    id: isUuid(purpose.id) ? purpose.id : undefined,
    user_id: userId,
    name: purpose.name,
    color: purpose.color ?? "#8b7ff0",
    is_default: purpose.isDefault ?? false,
    can_delete: purpose.canDelete ?? true,
    is_active: active,
    // Explicit null clears soft-delete metadata when turning a purpose back on.
    deleted_at: active ? null : purpose.deletedAt ?? nowIso(),
    deleted_by: active
      ? null
      : isUuid(purpose.deletedBy)
        ? purpose.deletedBy
        : userId,
  });
}

function toContributor(row: Row): Contributor {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color ?? undefined,
    isDefault: row.is_default ?? false,
    canDelete: row.can_delete ?? true,
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

function toTransaction(row: Row): Transaction {
  const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
  const splits = row.transaction_splits ?? row.splits ?? [];
  const splitList = Array.isArray(splits) ? splits : splits ? [splits] : [];
  const split = splitList[0];
  const totalAmount = Number(row.total_amount ?? row.amount ?? split?.amount ?? 0);
  const transactionDate = row.transaction_date ?? row.date ?? nowIso();
  const purposeId = split?.purpose_id ?? row.purpose_id ?? "";
  const category = split?.category_id ?? row.category ?? "";
  const mappedSplits = splitList.map((item: Row) => ({
    id: String(item.id ?? ""),
    transactionId: String(item.transaction_id ?? row.id),
    userId: String(item.user_id ?? row.user_id ?? ""),
    purposeId: String(item.purpose_id ?? ""),
    categoryId: String(item.category_id ?? ""),
    contributorId: item.contributor_id ? String(item.contributor_id) : undefined,
    outingId: item.outing_id ? String(item.outing_id) : undefined,
    amount: Number(item.amount ?? 0),
    note: item.note ? String(item.note) : undefined,
  }));
  const itemRows = row.transaction_items ?? [];
  const itemList: Row[] = Array.isArray(itemRows)
    ? itemRows
    : itemRows
      ? [itemRows]
      : [];
  const mappedItems = itemList
    .slice()
    .sort((a: Row, b: Row) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((item: Row) => ({
      id: String(item.id ?? ""),
      transactionId: String(item.transaction_id ?? row.id),
      userId: String(item.user_id ?? row.user_id ?? ""),
      name: String(item.name ?? ""),
      categoryId: item.category_id ? String(item.category_id) : undefined,
      amount: Number(item.amount ?? 0),
      position: item.position != null ? Number(item.position) : undefined,
    }));
  const mapped = {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    merchant: row.merchant ?? "",
    totalAmount,
    amount: totalAmount,
    category,
    accountId: row.account_id ?? "",
    accountName: account?.name ?? row.account_name ?? "",
    account: account?.name ?? row.account_name ?? "",
    purposeId,
    purpose: purposeId,
    purposeIds: Array.isArray(splits)
      ? splits.map((item: Row) => item.purpose_id).filter(Boolean)
      : purposeId
        ? [purposeId]
        : [],
    transactionDate,
    date: transactionDate,
    hasSplits: row.has_splits ?? mappedSplits.length > 1,
    splits: mappedSplits.length > 0 ? mappedSplits : undefined,
    paymentMethod: row.payment_method ?? undefined,
    paymentType: row.payment_method ?? undefined,
    source: row.source ?? "manual",
    entrySource: row.entry_source ?? "manual",
    monthKey: row.month_key ?? deriveMonthKey(transactionDate),
    reference: row.reference ?? undefined,
    referenceId: row.reference_id ?? undefined,
    // Merchant identifier (first-class; fallback tags upi: for older rows).
    upiId:
      row.upi ??
      row.raw_identifier ??
      (Array.isArray(row.tags)
        ? (row.tags as string[])
            .find((t) => typeof t === "string" && t.startsWith("upi:"))
            ?.slice(4)
        : undefined) ??
      undefined,
    note: row.note ?? undefined,
    description: row.description ?? undefined,
    title: row.title ?? undefined,
    items: mappedItems.length > 0 ? mappedItems : undefined,
    hasItems: row.has_items ?? mappedItems.length > 0,
    outingId: row.outing_id ?? undefined,
    status: row.status ?? "completed",
    tags: row.tags ?? undefined,
    receiptImageUrl: row.receipt_url ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    contributorSource: split?.contributor_id ?? undefined,
  };
  return mapped as Transaction;
}

function transactionParentPayload(transaction: Partial<Transaction> & Row): Row {
  const transactionDate =
    transaction.transactionDate ?? transaction.date ?? new Date().toISOString();
  const totalAmount = transaction.totalAmount ?? transaction.amount ?? 0;
  return compact({
    accountId: transaction.accountId,
    merchant: transaction.merchant ?? "",
    title: transaction.title,
    totalAmount,
    type: transaction.type ?? "expense",
    paymentMethod: transaction.paymentMethod ?? transaction.paymentType ?? "UPI",
    source: transaction.source ?? "manual",
    entrySource:
      transaction.entrySource ??
      (transaction.source === "mobile" ? "mobile-manual" : "manual"),
    transactionDate,
    monthKey: transaction.monthKey ?? deriveMonthKey(transactionDate),
    description: transaction.description,
    note: transaction.note,
    reference: transaction.reference,
    referenceId: transaction.referenceId,
    // Merchant identifier — prefer explicit upiId, else reference if it looks like one.
    upi:
      transaction.upiId?.trim() ||
      (transaction.reference?.includes("@")
        ? transaction.reference.trim()
        : undefined) ||
      (transaction.referenceId?.includes("@")
        ? transaction.referenceId.trim()
        : undefined) ||
      undefined,
    rawIdentifier:
      transaction.upiId?.trim() ||
      transaction.referenceId?.trim() ||
      transaction.reference?.trim() ||
      undefined,
    status: transaction.status ?? "completed",
    tags: transaction.tags,
    outingId: transaction.outingId,
  });
}

function transactionRowPayload(userId: string | undefined, transaction: Partial<Transaction> & Row): Row {
  const payload = transactionParentPayload(transaction);
  return compact({
    user_id: userId,
    account_id: payload.accountId,
    merchant: payload.merchant,
    total_amount: payload.totalAmount,
    type: payload.type,
    payment_method: payload.paymentMethod,
    source: payload.source,
    entry_source: payload.entrySource,
    transaction_date: payload.transactionDate,
    month_key: payload.monthKey,
    description: payload.description,
    note: payload.note,
    reference: payload.reference,
    reference_id: payload.referenceId,
    upi: payload.upi ?? null,
    raw_identifier: payload.rawIdentifier ?? null,
    status: payload.status,
    tags: payload.tags,
    // Explicit null clears an outing link on update (unlink).
    outing_id: isUuid(payload.outingId)
      ? payload.outingId
      : payload.outingId === null || payload.outingId === ""
        ? null
        : undefined,
  });
}

function splitPayload(
  userId: string,
  transactionId: string,
  transaction: Partial<Transaction> & Row,
  contributorId?: string,
): Row {
  return compact({
    transaction_id: transactionId,
    user_id: userId,
    purpose_id: transaction.purposeId,
    category_id: transaction.category,
    contributor_id: contributorId,
    outing_id: isUuid(transaction.outingId)
      ? transaction.outingId
      : transaction.outingId === null || transaction.outingId === ""
        ? null
        : undefined,
    amount: transaction.totalAmount ?? transaction.amount ?? 0,
    note: transaction.note,
  });
}

function toPlan(row: Row | null | undefined): MonthlyPlan | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    month: row.month,
    title: row.title ?? undefined,
    purposeId: row.purpose_id ?? undefined,
    expectedIncome: Number(row.expected_income ?? 0),
    allocations: row.allocations ?? [],
    budgetSetAt: row.budget_set_at ?? undefined,
    isBudgetLocked: row.is_budget_locked ?? false,
    dailySafeLimit: row.daily_safe_limit ?? undefined,
    savingsTarget: row.savings_target ?? undefined,
    changeHistory: row.change_history ?? undefined,
    lastModifiedBy: row.last_modified_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function planPayload(userId: string | undefined, plan: MonthlyPlan): Row {
  return compact({
    id: isUuid(plan.id) ? plan.id : undefined,
    user_id: userId,
    month: plan.month,
    title: plan.title?.trim() || undefined,
    purpose_id: isUuid(plan.purposeId) ? plan.purposeId : undefined,
    expected_income: plan.expectedIncome ?? 0,
    allocations: plan.allocations ?? [],
    daily_safe_limit: plan.dailySafeLimit,
    savings_target: plan.savingsTarget,
    budget_set_at: plan.budgetSetAt,
    is_budget_locked: plan.isBudgetLocked ?? false,
    change_history: plan.changeHistory ?? [],
    last_modified_by: isUuid(plan.lastModifiedBy) ? plan.lastModifiedBy : undefined,
  });
}

function normalizeOutingMembers(raw: unknown): TripMember[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Row, index: number) => {
    const name = String(item?.name ?? "Member");
    const isCurrentUser =
      item?.isCurrentUser === true || name.toLowerCase() === "you";
    return {
      id: String(item?.id ?? `member-${index}`),
      name: isCurrentUser ? "You" : name,
      upiId: item?.upiId ? String(item.upiId) : item?.upi ? String(item.upi) : undefined,
      friendId: item?.friendId
        ? String(item.friendId)
        : item?.friend_id
          ? String(item.friend_id)
          : undefined,
      isCurrentUser,
    };
  });
}

function toOuting(row: Row): Outing {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.title ?? row.name,
    title: row.title ?? row.name,
    category: row.type ?? undefined,
    location: row.location ?? undefined,
    budget: row.budget === null ? undefined : Number(row.budget ?? 0),
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    status: row.status ?? "active",
    purposeId: row.purpose_id ?? undefined,
    members: normalizeOutingMembers(row.members),
    participants: row.participants ?? [],
    // Per-outing toggle removed from UI; SMS settings drive detection.
    // Default true so active trips can receive linked spends.
    autoAddMode: row.auto_add_mode ?? true,
    createdBy: row.created_by ?? undefined,
    totalSpent: row.total_spent === null ? undefined : Number(row.total_spent ?? 0),
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    isQuickSplit: row.is_quick_split ?? false,
  };
}

function toTimestamptz(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Date-only from <input type="date"> → midnight UTC for stable storage.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  return trimmed;
}

function outingPayload(userId: string | undefined, outing: Outing): Row {
  return compact({
    id: isUuid(outing.id) ? outing.id : undefined,
    user_id: userId,
    created_by: userId,
    title: outing.title ?? outing.name,
    type: outing.category ?? "Trip",
    location: outing.location || null,
    budget: outing.budget ?? null,
    start_date: toTimestamptz(outing.startDate),
    end_date: toTimestamptz(outing.endDate) ?? null,
    members: outing.members ?? [],
    participants: (outing.participants ?? []).filter(isUuid),
    status: outing.status ?? "active",
    purpose_id: isUuid(outing.purposeId) ? outing.purposeId : undefined,
    // Linking uses active status + trip dates; SMS detect is a mobile setting.
    auto_add_mode: outing.autoAddMode ?? true,
    total_spent: outing.totalSpent ?? 0,
    is_active: outing.isActive ?? true,
    deleted_at: outing.deletedAt ?? null,
    deleted_by: isUuid(outing.deletedBy) ? outing.deletedBy : null,
    is_quick_split: outing.isQuickSplit ?? undefined,
  });
}

async function selectByUser<T>(
  table: string,
  userId: string | undefined,
  mapper: (row: Row) => T,
  orderColumn = "created_at",
): Promise<T[]> {
  if (!userId) return [];
  const data = await throwIfError(
    client().from(table).select("*").eq("user_id", userId).order(orderColumn, {
      ascending: false,
    }),
  );
  return ((data as Row[]) ?? []).map(mapper);
}

async function upsertById<T>(
  table: string,
  payload: Row,
  mapper: (row: Row) => T,
): Promise<T> {
  const data = await throwIfError(
    client().from(table).upsert(payload).select("*").single(),
  );
  return mapper(data as Row);
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return { ...data, user: toAuthUser(data.user) };
}

async function postAuthApi(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Request failed.",
    );
  }
  return payload;
}

export async function sendPasswordReset(email: string) {
  return postAuthApi("/api/auth/forgot-password", { email: email.trim() });
}

export async function resendVerificationEmail(email: string) {
  return postAuthApi("/api/auth/resend-verification", { email: email.trim() });
}

export async function updatePassword(password: string) {
  const { data, error } = await client().auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function completeAuthSession(
  userId?: string,
  profile?: { name?: string; email?: string; photoURL?: string },
) {
  if (userId) {
    await ensureUserWorkspace(userId, profile).catch(() => null);
  }
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signUpWithEmail(first: string, second: string, third: string) {
  const firstIsEmail = first.includes("@");
  const email = firstIsEmail ? first : second;
  const password = firstIsEmail ? second : third;
  const name = firstIsEmail ? third : first;
  const data = await postAuthApi("/api/auth/sign-up", {
    email: email.trim(),
    password: password.trim(),
    name: name.trim(),
  });
  return {
    ...data,
    session: data.session ?? null,
    user: data.user ? toAuthUser(data.user) : null,
    profileName: name,
    email,
  };
}

export async function signOutUser() {
  const { error } = await client().auth.signOut();
  clearUserWorkspaceSessionCache();
  if (error) throw error;
}

async function fetchTransactionsRaw(userId: string) {
  try {
    return await throwIfError(
      client()
        .from("transactions")
        .select("*, accounts(name), transaction_splits(*), transaction_items(*)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("transaction_date", { ascending: false }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.toLowerCase().includes("relationship")) {
      throw error;
    }
    return await throwIfError(
      client()
        .from("transactions")
        .select("*, transaction_splits(*), transaction_items(*)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("transaction_date", { ascending: false }),
    );
  }
}

export async function fetchTransactions(userId?: string) {
  if (!userId) return [];
  const data = await fetchTransactionsRaw(userId);
  const transactions = ((data as Row[]) ?? []).map(toTransaction);
  return enrichTransactionContributors(userId, transactions);
}

// supabase-js returns the EXISTING channel when asked for a topic that's
// already registered. Attaching a postgres_changes handler to a channel that
// has already been subscribe()'d throws:
//   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
// That bites whenever a subscribe helper has more than one concurrent caller,
// and again on React StrictMode's dev remount (removeChannel is async, so the
// old channel can still be registered). A monotonic suffix guarantees
// channel() always returns a fresh, un-subscribed channel.
let realtimeTopicSeq = 0;
function uniqueTopic(prefix: string) {
  realtimeTopicSeq += 1;
  return `${prefix}#${realtimeTopicSeq}`;
}

export function subscribeToTransactions(
  userId: string | undefined,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  if (!userId) {
    onData([]);
    return () => undefined;
  }

  void fetchTransactions(userId).then(onData).catch(onError);
  const supabase = client();
  logRealtimeSubscribe("transactions");
  // Unique topic per subscriber: this helper has more than one caller
  // (app-data-provider always, plus useFilteredTransactions' fallback path).
  // A shared topic would hand the second caller the already-subscribed
  // channel, and attaching a postgres_changes handler to it throws
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  const channel = supabase
    .channel(uniqueTopic(`transactions:${userId}`))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
      () => void fetchTransactions(userId).then(onData).catch(onError),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transaction_splits", filter: `user_id=eq.${userId}` },
      () => void fetchTransactions(userId).then(onData).catch(onError),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transaction_items", filter: `user_id=eq.${userId}` },
      () => void fetchTransactions(userId).then(onData).catch(onError),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToFilteredTransactions(
  userId: string,
  filters: ServerTransactionFilters,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  const publish = () =>
    fetchFilteredTransactions(userId, filters).then(onData).catch(onError);
  void publish();
  return subscribeToTransactions(userId, (items) =>
    onData(applyServerTransactionFilters(items, filters)),
  );
}

export async function fetchFilteredTransactions(
  userId: string,
  filters: ServerTransactionFilters,
) {
  return applyServerTransactionFilters(await fetchTransactions(userId), filters);
}

export async function fetchTransactionsPage(
  userId: string | undefined,
  page = 1,
  pageSize = 25,
) {
  const transactions = await fetchTransactions(userId);
  const start = Math.max(0, (page - 1) * pageSize);
  return {
    transactions: transactions.slice(start, start + pageSize),
    total: transactions.length,
    hasMore: start + pageSize < transactions.length,
  };
}

export async function fetchTransaction(userId: string | undefined, transactionId: string) {
  if (!userId || !transactionId) return null;
  const data = await throwIfError(
    client()
      .from("transactions")
      .select("*, accounts(name), transaction_splits(*), transaction_items(*)")
      .eq("user_id", userId)
      .eq("id", transactionId)
      .maybeSingle(),
  );
  return data ? toTransaction(data as Row) : null;
}

async function resolveAccountId(
  userId: string,
  accountRef?: Pick<Transaction, "accountId" | "account"> | string,
) {
  const accounts = await fetchAccounts(userId);
  const accountId =
    typeof accountRef === "string"
      ? accountRef
      : accountRef?.accountId ?? accountRef?.account;

  if (isUuid(accountId)) {
    const byId = accounts.find((account) => account.id === accountId);
    if (byId?.id) return byId.id;
  }

  const accountName =
    typeof accountRef === "string"
      ? undefined
      : accountRef?.account ?? accountRef?.accountId;
  if (accountName) {
    const byName = accounts.find((account) => account.name === accountName);
    if (byName?.id) return byName.id;
    if (isUuid(accountName)) {
      const byUuidName = accounts.find((account) => account.id === accountName);
      if (byUuidName?.id) return byUuidName.id;
    }
  }

  const fallback = accounts.find((account) => account.isDefault) ?? accounts[0];
  if (!fallback?.id) {
    throw new Error("Add an account in Settings before recording transactions.");
  }
  return fallback.id;
}

async function resolvePurposeId(userId: string, purposeId?: string) {
  if (isUuid(purposeId)) return purposeId!;
  const purposes = await fetchPurposes(userId);
  const fallback = purposes.find((purpose) => purpose.isDefault) ?? purposes[0];
  if (!fallback?.id) {
    throw new Error("Add a purpose in Settings before recording transactions.");
  }
  return fallback.id;
}

async function resolveContributorId(userId: string, contributorRef?: string) {
  if (!contributorRef) return undefined;
  const contributors = await fetchContributors(userId);
  if (isUuid(contributorRef)) {
    const byId = contributors.find((contributor) => contributor.id === contributorRef);
    return byId?.id;
  }
  const byName = contributors.find((contributor) => contributor.name === contributorRef);
  return byName?.id;
}

// ── Merchants (user_merchants) ─────────────────────────────────────────────
// Shared by manual entry (web) and SMS learning (mobile). Never written for
// outing expenses — those go through saveOutingExpense, not addTransaction.

function normalizeMerchantKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toUserMerchant(row: Row): UserMerchant {
  return {
    id: row.id,
    payee: row.payee ?? "",
    normalizedPayee: row.normalized_payee ?? "",
    title: row.title ?? row.payee ?? "",
  };
}

export async function fetchUserMerchants(userId?: string): Promise<UserMerchant[]> {
  if (!userId) return [];
  const data = await throwIfError(
    client()
      .from("user_merchants")
      .select("*")
      .eq("user_id", userId)
      .order("title", { ascending: true }),
  );
  return ((data as Row[]) ?? []).map(toUserMerchant);
}

/**
 * Find-or-create the verified merchant for a manual transaction.
 * Match priority: exact UPI/identifier → normalized merchant name.
 * Never called for outing expenses (see AddTransactionSlideOver / outing-transactions).
 */
async function resolveMerchant(
  userId: string,
  merchant: { name?: string; upi?: string },
) {
  const name = merchant.name?.trim();
  if (!name) return;
  const upi = merchant.upi?.trim();

  const merchants = await fetchUserMerchants(userId);
  const byUpi = upi
    ? merchants.find((item) => item.normalizedPayee === normalizeMerchantKey(upi))
    : undefined;
  const byName = merchants.find(
    (item) => normalizeMerchantKey(item.title) === normalizeMerchantKey(name),
  );
  const match = byUpi ?? byName;

  if (match) {
    // Keep the display name fresh and re-verify on reuse; the identifier
    // itself never changes once matched.
    await throwIfError(
      client()
        .from("user_merchants")
        .update({ title: name, verified_at: nowIso() })
        .eq("user_id", userId)
        .eq("id", match.id),
    );
    return;
  }

  const payee = upi || name;
  await throwIfError(
    client()
      .from("user_merchants")
      .upsert(
        compact({
          user_id: userId,
          payee,
          normalized_payee: normalizeMerchantKey(payee),
          title: name,
        }),
        { onConflict: "user_id,normalized_payee" },
      ),
  );
}

async function enrichTransactionContributors(
  userId: string,
  transactions: Transaction[],
) {
  const contributors = await fetchContributors(userId);
  const byId = new Map(contributors.map((contributor) => [contributor.id, contributor.name]));
  return transactions.map((transaction) => {
    const contributorId = transaction.contributorSource;
    if (contributorId && isUuid(contributorId)) {
      return {
        ...transaction,
        contributorSource: byId.get(contributorId) ?? contributorId,
      };
    }
    return transaction;
  });
}

async function resolvePlanPurposeId(userId: string, purposeId?: string) {
  const purposes = await fetchPurposes(userId);
  const defaultPersonal = getDefaultPersonalPurpose(purposes);
  if (
    !purposeId ||
    purposeId === PERSONAL_PURPOSE_ID ||
    isPersonalPurposeRef(purposeId, purposes)
  ) {
    return defaultPersonal?.id;
  }
  return isUuid(purposeId) ? purposeId : defaultPersonal?.id;
}

export async function addTransaction(
  userId: string | undefined,
  transaction: Omit<Transaction, "id">,
) {
  if (!userId) throw new Error("Sign in before adding transactions.");
  const accountId = await resolveAccountId(userId, transaction);
  const purposeId = await resolvePurposeId(
    userId,
    transaction.purposeId ?? transaction.purpose,
  );
  const contributorId = await resolveContributorId(
    userId,
    transaction.contributorSource,
  );
  const parent = transactionParentPayload({
    ...(transaction as any),
    accountId,
    purposeId,
  });
  // Outing expenses never reach this function (they write outing_expenses
  // via saveOutingExpense) — no outingId guard needed here for that case,
  // but outing rollup/settlement rows do pass through, so skip those too.
  if (!parent.outingId) {
    resolveMerchant(userId, { name: parent.merchant, upi: parent.upi }).catch((error) => {
      console.error("Merchant save failed", error);
    });
  }
  // Multi-row split (category or friend split on a normal transaction) —
  // falls back to the single-row derived split when not provided.
  const providedSplits = (transaction.splits ?? []).filter(
    (item) => (item.amount ?? 0) > 0,
  );
  const splits =
    providedSplits.length > 1
      ? await Promise.all(
          providedSplits.map(async (item) => ({
            purposeId: await resolvePurposeId(userId, item.purposeId),
            categoryId: item.categoryId || transaction.category,
            contributorId: item.contributorId ?? contributorId,
            outingId: item.outingId ?? transaction.outingId,
            amount: item.amount,
            note: item.note ?? transaction.note,
          })),
        )
      : [
          {
            purposeId,
            categoryId: transaction.category,
            contributorId,
            outingId: transaction.outingId,
            amount: transaction.totalAmount ?? (transaction as any).amount ?? 0,
            note: transaction.note,
          },
        ];

  // Purchased line items — independent of splits, purely descriptive.
  const items = (transaction.items ?? [])
    .filter((item) => item.name?.trim() && (item.amount ?? 0) > 0)
    .map((item) => ({
      name: item.name.trim(),
      categoryId: item.categoryId,
      amount: item.amount,
    }));

  const transactionId = await throwIfError(
    client().rpc("create_transaction_with_splits", {
      p_transaction: parent,
      p_splits: splits,
      p_items: items,
    }),
  );
  const saved = await fetchTransaction(userId, transactionId as string);
  return saved ?? ({ id: transactionId, ...transaction } as Transaction);
}

export async function updateTransaction(
  userId: string | undefined,
  transactionId: string,
  transaction: Partial<Transaction>,
) {
  if (!userId) {
    throw new Error("Sign in before updating transactions.");
  }

  const existing = await fetchTransaction(userId, transactionId);
  const merged = { ...(existing ?? {}), ...transaction } as Partial<Transaction> & Row;

  if (merged.accountId || merged.account) {
    merged.accountId = await resolveAccountId(userId, merged);
  }

  if (merged.purposeId || merged.purpose) {
    merged.purposeId = await resolvePurposeId(
      userId,
      merged.purposeId ?? merged.purpose,
    );
  }

  const contributorId = await resolveContributorId(
    userId,
    merged.contributorSource,
  );

  if (transaction.merchant !== undefined && !merged.outingId) {
    resolveMerchant(userId, { name: merged.merchant, upi: merged.upiId }).catch(
      (error) => {
        console.error("Merchant save failed", error);
      },
    );
  }

  // Multi-row split (category or friend split) — falls back to the
  // single-row derived split when not provided.
  const providedSplits = (transaction.splits ?? []).filter(
    (item) => (item.amount ?? 0) > 0,
  );
  const hasMultiSplit = providedSplits.length > 1;

  // Purchased line items — independent of splits, purely descriptive.
  const providedItems = (transaction.items ?? []).filter(
    (item) => item.name?.trim() && (item.amount ?? 0) > 0,
  );
  const hasItems = providedItems.length > 0;

  await throwIfError(
    client()
      .from("transactions")
      .update({
        ...transactionRowPayload(userId, merged),
        ...(transaction.splits !== undefined ? { has_splits: hasMultiSplit } : {}),
        ...(transaction.items !== undefined ? { has_items: hasItems } : {}),
      })
      .eq("user_id", userId)
      .eq("id", transactionId),
  );

  // Always rewrite splits when amount fields are present (including 0).
  // Truthy checks used to skip updates when amount was 0, and could miss
  // outing-rollup total rewrites that only pass amount/totalAmount.
  if (
    transaction.purposeId !== undefined ||
    transaction.purpose !== undefined ||
    transaction.category !== undefined ||
    transaction.totalAmount !== undefined ||
    transaction.amount !== undefined ||
    transaction.note !== undefined ||
    transaction.description !== undefined ||
    transaction.contributorSource !== undefined ||
    transaction.outingId !== undefined ||
    transaction.paymentMethod !== undefined ||
    transaction.status !== undefined ||
    transaction.tags !== undefined ||
    transaction.reference !== undefined ||
    transaction.referenceId !== undefined ||
    transaction.splits !== undefined
  ) {
    await throwIfError(
      client().from("transaction_splits").delete().eq("transaction_id", transactionId),
    );
    const rows = hasMultiSplit
      ? await Promise.all(
          providedSplits.map(async (item) => ({
            transaction_id: transactionId,
            user_id: userId,
            purpose_id: await resolvePurposeId(userId, item.purposeId),
            category_id: item.categoryId || merged.category,
            contributor_id: item.contributorId ?? contributorId,
            outing_id: isUuid(item.outingId) ? item.outingId : merged.outingId,
            amount: item.amount,
            note: item.note ?? merged.note,
          })),
        )
      : [splitPayload(userId, transactionId, merged, contributorId)];
    await throwIfError(client().from("transaction_splits").insert(rows));
  }

  // Rewrite items whenever a new items list is explicitly provided — same
  // delete-then-reinsert approach as splits, kept in its own table so it
  // never interacts with split allocation math.
  if (transaction.items !== undefined) {
    await throwIfError(
      client().from("transaction_items").delete().eq("transaction_id", transactionId),
    );
    if (providedItems.length > 0) {
      const itemRows = providedItems.map((item, index) => ({
        transaction_id: transactionId,
        user_id: userId,
        name: item.name.trim(),
        category_id: item.categoryId || null,
        amount: item.amount,
        position: index,
      }));
      await throwIfError(client().from("transaction_items").insert(itemRows));
    }
  }
}

export async function deleteTransaction(userId: string | undefined, transactionId: string) {
  if (!userId) {
    throw new Error("Sign in before deleting transactions.");
  }
  // Cascade related rows for THIS transaction only (not other friend data).
  // friend_settlements cascade from friend_splits (FK). transaction_splits and
  // transaction_items cascade from transactions (FK). Explicit friend_splits
  // delete keeps Friends UI clean even if a client cache lags, and matches the
  // mobile removeSplitByTransactionId path.
  await throwIfError(
    client()
      .from("friend_splits")
      .delete()
      .eq("user_id", userId)
      .eq("transaction_id", transactionId),
  );
  await throwIfError(
    client().from("transactions").delete().eq("user_id", userId).eq("id", transactionId),
  );
}

export async function fetchAccounts(userId?: string) {
  const accounts = await selectByUser("accounts", userId, toAccount, "created_at");
  return accounts.filter((account) => account.isActive !== false);
}

export async function saveAccount(userId: string | undefined, account: Account) {
  if (!userId) throw new Error("Sign in before saving accounts.");
  if (account.isDefault) {
    await throwIfError(
      client().from("accounts").update({ is_default: false }).eq("user_id", userId),
    );
  }
  return upsertById("accounts", accountPayload(userId, account), toAccount);
}

export async function deleteAccount(userId: string | undefined, accountId: string) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("accounts")
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: userId })
      .eq("user_id", userId)
      .eq("id", accountId),
  );
}

export async function fetchDefaultCategories(): Promise<Category[]> {
  const data = await throwIfError(
    client().from("global_settings").select("default_categories").eq("id", "app").maybeSingle(),
  );
  const list = (data as Row | null)?.default_categories;
  return Array.isArray(list) && list.length > 0
    ? list.map((item) => toCategory(item, "global"))
    : defaultCategories.map((item) => ({ ...item, source: "global" as const }));
}

export async function fetchCustomCategories(userId?: string) {
  return selectByUser("categories", userId, (row) => toCategory(row, "custom"), "name");
}

export async function saveCustomCategory(userId: string | undefined, category: Category) {
  if (!userId) throw new Error("Sign in before saving categories.");
  return upsertById("categories", categoryPayload(userId, category), (row) =>
    toCategory(row, "custom"),
  );
}

export async function deleteCustomCategory(userId: string | undefined, categoryId: string) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("categories")
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: userId })
      .eq("user_id", userId)
      .eq("id", categoryId),
  );
}

export async function fetchCategories(userId?: string) {
  const [defaults, custom] = await Promise.all([
    fetchDefaultCategories(),
    fetchCustomCategories(userId),
  ]);
  return [...defaults, ...custom.filter((category) => category.isActive !== false)];
}

export async function fetchPurposes(userId?: string) {
  return selectByUser("purposes", userId, toPurpose);
}

export async function savePurpose(userId: string | undefined, purpose: Purpose) {
  if (!userId) throw new Error("Sign in before saving purposes.");
  return upsertById("purposes", purposePayload(userId, purpose), toPurpose);
}

export async function archivePurpose(userId: string | undefined, purpose: Purpose) {
  return savePurpose(userId, { ...purpose, isActive: false, deletedAt: nowIso(), deletedBy: userId });
}

export async function deletePurpose(userId: string | undefined, purposeId: string) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("purposes")
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: userId })
      .eq("user_id", userId)
      .eq("id", purposeId),
  );
}

export const saveCategory = saveCustomCategory;
export const deleteCategory = deleteCustomCategory;
export const archiveAccount = saveAccount;

export async function fetchPurposeShares(
  ownerId?: string,
  viewerEmail?: string,
): Promise<PurposeShare[]> {
  if (!ownerId) return [];

  const mapShareRow = (row: Row): PurposeShare => ({
    id: row.id,
    ownerId: row.owner_id,
    viewerEmail: row.viewer_email,
    viewerUid: row.viewer_id ?? undefined,
    purposeId: row.purpose_id,
    role: row.role ?? "viewer",
    linkToken: row.link_token ?? undefined,
    contributorId: row.contributor_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    status: row.status ?? "pending",
    lastViewedAt: row.last_viewed_at ?? undefined,
    totalViews: row.total_views ?? 0,
    createdAt: row.created_at,
  });

  const owned = await throwIfError(
    client()
      .from("purpose_shares")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
  );

  const normalizedEmail = viewerEmail?.trim().toLowerCase();
  const received =
    normalizedEmail && normalizedEmail !== ""
      ? await throwIfError(
          client()
            .from("purpose_shares")
            .select("*")
            .eq("viewer_email", normalizedEmail)
            .order("created_at", { ascending: false }),
        )
      : [];

  const merged = new Map<string, PurposeShare>();
  for (const row of [...((owned as Row[]) ?? []), ...((received as Row[]) ?? [])]) {
    merged.set(row.id, mapShareRow(row));
  }

  return [...merged.values()].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function createPurposeShare(
  ownerId: string | undefined,
  viewerEmail: string,
  purposeId: string,
  linkToken?: string,
  contributorId?: string | null,
  expiresAt?: string | null,
) {
  if (!ownerId) throw new Error("Sign in before sharing purposes.");
  const { data, error } = await client()
    .from("purpose_shares")
    .insert({
      owner_id: ownerId,
      viewer_email: viewerEmail.trim().toLowerCase(),
      purpose_id: purposeId,
      role: "viewer",
      status: "pending",
      // Records exactly which share_links row this invite's URL is, so
      // revoke can delete that row by an exact token match instead of
      // re-deriving it from (owner_id, purpose_id, viewer_email), which
      // is one more thing that could silently mismatch.
      link_token: linkToken,
      expires_at: expiresAt ?? null,
      contributor_id: contributorId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // purpose_shares_active_owner_purpose_email_idx — one active share per
    // (owner, purpose, viewer email). Surface it as an actionable message
    // instead of a raw Postgres constraint error.
    if (error.code === "23505") {
      throw new Error(
        "This purpose is already shared with this email. Revoke the existing share first, then invite again.",
      );
    }
    throw new Error(error.message);
  }
  const inserted = data as Row;
  const shares = await fetchPurposeShares(ownerId);
  return (
    shares.find((share) => share.id === inserted.id) ?? {
      id: inserted.id,
      ownerId: inserted.owner_id,
      viewerEmail: inserted.viewer_email,
      viewerUid: inserted.viewer_id ?? undefined,
      purposeId: inserted.purpose_id,
      role: inserted.role ?? "viewer",
      linkToken: inserted.link_token ?? undefined,
      contributorId: inserted.contributor_id ?? undefined,
      expiresAt: inserted.expires_at ?? undefined,
      status: inserted.status ?? "pending",
      lastViewedAt: inserted.last_viewed_at ?? undefined,
      totalViews: inserted.total_views ?? 0,
      createdAt: inserted.created_at,
    }
  );
}

export async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const response = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // The API route already returns { error: <real Resend/message text> }
    // (e.g. Resend's sandbox-domain restriction) — surfacing it instead of
    // a generic string is what makes that failure diagnosable at all.
    throw new Error(body?.error ?? "Failed to send email.");
  }
  return body;
}

export async function sendPurposeShareInviteEmail(params: {
  to?: string;
  viewerEmail?: string;
  ownerName?: string;
  inviterName?: string;
  inviterEmail?: string;
  purposeName: string;
  shareUrl?: string;
}) {
  const ownerName = params.ownerName ?? params.inviterName ?? "SpentX";
  return sendEmail({
    to: params.to ?? params.viewerEmail ?? "",
    subject: `${ownerName} shared ${params.purposeName} with you`,
    html: `<p>${ownerName} shared a SpentX purpose with you.</p><p><a href="${params.shareUrl ?? "#"}">Open shared view</a></p>`,
  });
}

export async function getOrCreateShareLink(params: {
  ownerId?: string;
  purposeId: string;
  purposeName: string;
  viewerEmail: string;
  /** Scopes the link to one contributor's transactions within the purpose.
   * Undefined/null means every contributor (today's default behavior). */
  contributorId?: string | null;
  /** ISO timestamp the link stops working at. Undefined/null means it
   * never expires. */
  expiresAt?: string | null;
}) {
  if (!params.ownerId) throw new Error("Sign in before sharing purposes.");
  const contributorId = params.contributorId ?? null;
  let existingQuery = client()
    .from("share_links")
    .select("*")
    .eq("owner_id", params.ownerId)
    .eq("purpose_id", params.purposeId)
    .eq("viewer_email", params.viewerEmail.toLowerCase());
  existingQuery = contributorId
    ? existingQuery.eq("contributor_id", contributorId)
    : existingQuery.is("contributor_id", null);
  const existing = await throwIfError(existingQuery.maybeSingle());
  if (existing) return (existing as Row).token as string;
  const data = await throwIfError(
    client()
      .from("share_links")
      .insert({
        owner_id: params.ownerId,
        purpose_id: params.purposeId,
        purpose_name: params.purposeName,
        viewer_email: params.viewerEmail.toLowerCase(),
        contributor_id: contributorId,
        expires_at: params.expiresAt ?? null,
      })
      .select("*")
      .single(),
  );
  return (data as Row).token as string;
}

export type ClaimedShareLink = {
  shareId?: string;
  ownerId: string;
  purposeId: string;
  purposeName: string;
  viewerEmail: string;
};

export async function claimShareLink(token: string): Promise<ClaimedShareLink> {
  const link = await throwIfError(
    client().rpc("get_share_link", { p_token: token }),
  );
  if (!link) throw new Error("This share link is invalid or has expired.");
  const row = link as Row;
  return {
    ownerId: row.owner_id,
    purposeId: row.purpose_id,
    purposeName: row.purpose_name,
    viewerEmail: row.viewer_email,
  };
}

function toSharedTransaction(row: Row, purposeId: string): Transaction {
  const totalAmount = Number(row.amount ?? 0);
  const transactionDate = row.transaction_date ?? nowIso();
  return {
    id: row.id,
    type: row.type,
    merchant: row.merchant ?? "",
    totalAmount,
    amount: totalAmount,
    category: row.category_id ?? "",
    accountName: row.account_name ?? "",
    account: row.account_name ?? "",
    purposeId,
    purpose: purposeId,
    source: "manual",
    transactionDate,
    date: transactionDate,
    note: row.note ?? undefined,
    description: row.description ?? undefined,
    contributorSource: row.contributor_name ?? undefined,
    tags: row.tags ?? undefined,
    status: row.status ?? "completed",
  };
}

// The anonymous viewer has no auth.uid(), so a plain RLS-scoped fetch (the
// same client used everywhere else) always returns zero rows for them.
// get_shared_transactions/get_shared_purposes/get_shared_monthly_plan are all
// security definer and re-validate the token/expiry themselves, so they're
// the only safe way to read the owner's data here — scoped strictly to that
// token's own owner_id/purpose_id, never a caller-supplied one. Realtime
// (postgres_changes) is RLS-gated too, so the reused Dashboard/Transactions/
// Analysis hooks poll these on an interval instead of subscribing.
export async function fetchSharedTransactions(
  token: string,
  purposeId: string,
): Promise<Transaction[]> {
  const rows = await throwIfError(
    client().rpc("get_shared_transactions", { p_token: token }),
  );
  return ((rows as Row[]) ?? []).map((row) => toSharedTransaction(row, purposeId));
}

export async function fetchSharedPurposes(token: string): Promise<Purpose[]> {
  const rows = await throwIfError(
    client().rpc("get_shared_purposes", { p_token: token }),
  );
  return ((rows as Row[]) ?? []).map(toPurpose);
}

export async function fetchSharedMonthlyPlan(
  token: string,
  month: string,
): Promise<MonthlyPlan | null> {
  const data = await throwIfError(
    client().rpc("get_shared_monthly_plan", { p_token: token, p_month: month }),
  );
  return toPlan(data as Row | null);
}

export async function logSharedPageView(token: string, page: string): Promise<void> {
  await throwIfError(
    client().rpc("log_shared_page_view", { p_token: token, p_page: page }),
  );
}

export async function revokePurposeShare(
  ownerId: string | undefined,
  shareId: string,
  purposeId?: string,
  viewerEmail?: string,
) {
  if (!ownerId) return;
  // .update() with no .select() reports success even when RLS or the
  // .eq() filters match zero rows — Supabase only surfaces that as an
  // empty result, never as an error — so without checking the returned
  // rows a failed revoke looks identical to a successful one.
  const updated = await throwIfError(
    client()
      .from("purpose_shares")
      .update({ status: "revoked" })
      .eq("owner_id", ownerId)
      .eq("id", shareId)
      .select("id, link_token"),
  );
  const updatedRows = (updated as Row[]) ?? [];
  if (updatedRows.length === 0) {
    throw new Error("Could not revoke access — the share may have already been removed.");
  }

  // The invite's own shareable link (share_links) is what the anonymous
  // /share/[token] flow actually validates — it never checks
  // purpose_shares.status at all. Without also removing this row, the
  // link keeps working for anyone who already has it even after "revoke."
  // Prefer the exact token this invite recorded at creation time; only fall
  // back to matching (owner_id, purpose_id, viewer_email) for older shares
  // created before link_token was captured here.
  const linkToken = updatedRows[0]?.link_token as string | null | undefined;
  const deleteQuery = linkToken
    ? client().from("share_links").delete().eq("owner_id", ownerId).eq("token", linkToken)
    : purposeId && viewerEmail
      ? client()
          .from("share_links")
          .delete()
          .eq("owner_id", ownerId)
          .eq("purpose_id", purposeId)
          .eq("viewer_email", viewerEmail.trim().toLowerCase())
      : null;

  if (deleteQuery) {
    const { error } = await deleteQuery.select("token");
    if (error) {
      throw new Error(
        `Access was revoked, but the share link itself couldn't be removed: ${error.message}`,
      );
    }
  }
}

export async function linkPurposeSharesForViewer(viewerUid: string, viewerEmail: string) {
  const { error } = await client()
    .from("purpose_shares")
    .update({ viewer_id: viewerUid, status: "active" })
    .eq("viewer_email", viewerEmail.toLowerCase());
  if (error) {
    console.warn("[purpose_shares] viewer link skipped:", error.message);
  }
}

export async function fetchBalanceSnapshots(userId?: string, accountId?: string) {
  if (!userId) return [];
  let query = client().from("account_balance_history").select("*").eq("user_id", userId);
  if (accountId) query = query.eq("account_id", accountId);
  const data = await throwIfError(query.order("snapshot_date", { ascending: false }));
  return ((data as Row[]) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    date: row.snapshot_date,
    balance: Number(row.balance ?? 0),
    createdAt: row.created_at,
  })) as BalanceSnapshot[];
}

export async function saveBalanceSnapshot(
  userId: string | undefined,
  snapshot: Omit<BalanceSnapshot, "id" | "createdAt"> & Partial<BalanceSnapshot>,
) {
  if (!userId) throw new Error("Sign in before saving balance snapshots.");
  const snapshotDate = snapshot.date?.trim();
  if (!snapshotDate) {
    throw new Error("Balance snapshot date is required.");
  }
  const data = await throwIfError(
    client()
      .from("account_balance_history")
      .upsert(
        {
          account_id: snapshot.accountId,
          user_id: userId,
          balance: snapshot.balance,
          snapshot_date: snapshotDate,
          month_key: snapshotDate.slice(0, 7),
        },
        { onConflict: "account_id,snapshot_date" },
      )
      .select("*")
      .single(),
  );
  const savedRow = data as Row;
  const snapshots = await fetchBalanceSnapshots(userId);
  return (
    snapshots.find((item) => item.id === savedRow.id) ?? {
      id: savedRow.id,
      userId: savedRow.user_id,
      accountId: savedRow.account_id,
      date: savedRow.snapshot_date,
      balance: Number(savedRow.balance ?? 0),
      createdAt: savedRow.created_at,
    }
  );
}

export async function deleteBalanceSnapshot(snapshotId: string) {
  await throwIfError(client().from("account_balance_history").delete().eq("id", snapshotId));
}

function toNetWorthSnapshot(row: Row): NetWorthSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.snapshot_date,
    cashBalance: Number(row.cash_balance ?? 0),
    bankBalance: Number(row.bank_balance ?? 0),
    walletBalance: Number(row.wallet_balance ?? 0),
    investmentValue: Number(row.investment_value ?? 0),
    netWorth: Number(row.net_worth ?? 0),
    createdAt: row.created_at,
  };
}

/** Daily Snapshot feature — reads net_worth_history (one row per user/day). */
export async function fetchNetWorthHistory(userId?: string) {
  if (!userId) return [];
  const data = await throwIfError(
    client()
      .from("net_worth_history")
      .select("*")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: false }),
  );
  return ((data as Row[]) ?? []).map(toNetWorthSnapshot);
}

export async function upsertNetWorthSnapshot(
  userId: string | undefined,
  snapshot: Omit<NetWorthSnapshot, "id" | "userId" | "createdAt">,
) {
  if (!userId) throw new Error("Sign in before saving a wealth snapshot.");
  const data = await throwIfError(
    client()
      .from("net_worth_history")
      .upsert(
        {
          user_id: userId,
          snapshot_date: snapshot.date,
          cash_balance: snapshot.cashBalance,
          bank_balance: snapshot.bankBalance,
          wallet_balance: snapshot.walletBalance,
          investment_value: snapshot.investmentValue,
          net_worth: snapshot.netWorth,
        },
        { onConflict: "user_id,snapshot_date" },
      )
      .select("*")
      .single(),
  );
  return toNetWorthSnapshot(data as Row);
}

export async function deleteNetWorthSnapshot(id: string) {
  await throwIfError(client().from("net_worth_history").delete().eq("id", id));
}

export async function fetchUserDocument(userId?: string): Promise<UserDocument | null> {
  const profile = await fetchUserProfile(userId);
  if (!profile) return null;
  return { ...profile, settings: await fetchUserSettings(userId) };
}

export async function fetchUserProfile(userId?: string) {
  if (!userId) return null;
  const data = await throwIfError(
    client().from("users").select("*").eq("id", userId).maybeSingle(),
  );
  return toUserProfile(data as Row | null);
}

export async function saveUserProfile(userId: string | undefined, profile: Partial<UserProfile>) {
  if (!userId) throw new Error("Sign in before saving a profile.");
  const existing = await fetchUserProfile(userId);
  const data = await throwIfError(
    client()
      .from("users")
      .upsert(
        compact({
          id: userId,
          name: profile.name ?? existing?.name ?? "SpentX User",
          email: profile.email ?? existing?.email ?? "",
          photo_url: profile.photoURL,
          phone: profile.phone,
          role: profile.role,
        }),
        { onConflict: "id" },
      )
      .select("*")
      .single(),
  );
  profileSavedListener?.(userId);
  return toUserProfile(data as Row);
}

export type UserWorkspaceInitResult = {
  profile: UserProfile | null;
  accounts: Account[];
  purposes: Purpose[];
  categories: Category[];
};

// Coalesce concurrent ensureUserWorkspace calls (getUser + onAuthStateChange
// both fire on load) and skip the heavy bootstrap path after the first success
// in this tab session (sessionStorage survives hard refresh).
const workspaceEnsureInFlight = new Map<string, Promise<UserWorkspaceInitResult>>();
const workspaceEnsureReady = new Set<string>();
const WORKSPACE_READY_KEY = "spentx_workspace_ready";

function workspaceReadyStorageKey(userId: string) {
  return `${WORKSPACE_READY_KEY}:${userId}`;
}

function isWorkspaceEnsureReady(userId: string) {
  if (workspaceEnsureReady.has(userId)) return true;
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(workspaceReadyStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markWorkspaceEnsureReady(userId: string) {
  workspaceEnsureReady.add(userId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(workspaceReadyStorageKey(userId), "1");
  } catch {
    /* ignore */
  }
}

export function clearUserWorkspaceSessionCache(userId?: string) {
  if (userId) {
    workspaceEnsureInFlight.delete(userId);
    workspaceEnsureReady.delete(userId);
    try {
      sessionStorage?.removeItem(workspaceReadyStorageKey(userId));
    } catch {
      /* ignore */
    }
  } else {
    workspaceEnsureInFlight.clear();
    workspaceEnsureReady.clear();
    if (typeof sessionStorage !== "undefined") {
      try {
        const keys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          if (key?.startsWith(`${WORKSPACE_READY_KEY}:`)) keys.push(key);
        }
        for (const key of keys) sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  clearBootstrapSessionCache(userId);
}

export async function ensureUserWorkspace(
  userId: string,
  profileHint?: { name?: string; email?: string; photoURL?: string },
  clientContext?: BootstrapClientContext,
): Promise<UserWorkspaceInitResult> {
  const existing = workspaceEnsureInFlight.get(userId);
  if (existing) return existing;

  if (isWorkspaceEnsureReady(userId)) {
    // Warm path: profile only. Accounts/purposes/categories load on demand
    // via AppDataProvider / page hooks — not on every auth re-entry.
    const profile = await fetchUserProfile(userId).catch(() => null);
    return { profile, accounts: [], purposes: [], categories: [] };
  }

  const work = (async (): Promise<UserWorkspaceInitResult> => {
    // Avoid an extra auth.getUser hop — callers already pass name/email from
    // the session user. bootstrap itself is idempotent + session-cached.
    await bootstrapUserWorkspace(
      client(),
      userId,
      {
        name: profileHint?.name ?? "SpentX User",
        email: profileHint?.email ?? "",
        photoURL: profileHint?.photoURL,
      },
      clientContext ?? readBootstrapClientContext({ recordLogin: true }),
    );

    const profile = await fetchUserProfile(userId);
    markWorkspaceEnsureReady(userId);
    return {
      profile,
      // Intentionally empty: nothing on the auth path consumed these lists,
      // and refetching them on every load doubled (or tripled) admin traffic.
      accounts: [],
      purposes: [],
      categories: [],
    };
  })().finally(() => {
    workspaceEnsureInFlight.delete(userId);
  });

  workspaceEnsureInFlight.set(userId, work);
  return work;
}

export async function ensureUserProfile(
  userId?: string,
  profile?: { name?: string; email?: string; photoURL?: string },
) {
  if (!userId) return null;
  const existing = await fetchUserProfile(userId);
  if (existing) return existing;
  if (!profile) return null;
  return saveUserProfile(userId, profile);
}

export async function dismissBankOnboarding(userId: string | undefined) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("users")
      .update({ show_bank_onboarding: false })
      .eq("id", userId),
  );
}

// Exactly what handle_new_user() seeds with zero user input. Anything beyond
// this set means the user (or a mobile sync) has already really used the
// account, so first-run onboarding must not run again.
// Keep in sync with supabase/migrations/20260724_default_family_purpose.sql.
const SEEDED_ACCOUNT_NAMES = new Set(["cash", "account 1"]);
const SEEDED_PURPOSE_NAMES = new Set(["personal", "family"]);

/**
 * Server-decided first-run gate — the web equivalent of mobile's
 * AuthService.accountHasExistingData().
 *
 * Deliberately derived from server state, not a local flag, so a user who
 * signs up on web, abandons onboarding, then signs in from another browser
 * or device still gets the flow. `show_bank_onboarding` is only the
 * dismissal record (set when the user completes or skips), never the sole
 * source of truth.
 *
 * Previous behaviour was broken: it treated "has any bank/wallet account" and
 * "more than one account" as proof of prior use, but handle_new_user() seeds
 * BOTH a 'Cash' account and an 'Account 1' account of type 'bank'. Both
 * conditions were therefore true the instant the account existed, so the
 * modal auto-dismissed itself — and dismissBankOnboarding() persisted that,
 * meaning no new user ever saw onboarding and it could never appear later.
 */
export async function fetchOnboardingState(userId?: string) {
  if (!userId) return { needsOnboarding: false };

  const data = await throwIfError(
    client().from("users").select("show_bank_onboarding").eq("id", userId).maybeSingle(),
  );
  // Explicitly completed or skipped before — never re-prompt.
  if (!Boolean((data as Row | null)?.show_bank_onboarding)) {
    return { needsOnboarding: false };
  }

  try {
    const [accounts, purposes, txCount] = await Promise.all([
      fetchAccounts(userId),
      fetchPurposes(userId),
      countTransactions(userId),
    ]);

    if (txCount > 0) return { needsOnboarding: false };

    const activeAccounts = accounts.filter((a) => a.isActive !== false);
    const activePurposes = purposes.filter((p) => p.isActive !== false);

    const accountsBeyondSeed = activeAccounts.some(
      (a) => !SEEDED_ACCOUNT_NAMES.has(a.name.trim().toLowerCase()),
    );
    const purposesBeyondSeed = activePurposes.some(
      (p) => !SEEDED_PURPOSE_NAMES.has(p.name.trim().toLowerCase()),
    );

    if (
      accountsBeyondSeed ||
      purposesBeyondSeed ||
      activeAccounts.length > SEEDED_ACCOUNT_NAMES.size ||
      activePurposes.length > SEEDED_PURPOSE_NAMES.size
    ) {
      return { needsOnboarding: false };
    }
  } catch {
    // Offline/schema drift: fall back to the flag alone rather than either
    // blocking a real user or silently skipping setup.
    return { needsOnboarding: true };
  }

  return { needsOnboarding: true };
}

export type OnboardingAccountDraft = {
  name: string;
  type: Account["type"];
  last4?: string;
  openingBalance: number;
};

export type OnboardingSelection = {
  accounts: OnboardingAccountDraft[];
  /** Purpose names the user wants active. "Personal" is always implied. */
  purposes: string[];
};

/**
 * Applies the first-run onboarding selection.
 *
 * Idempotent by NAME, mirroring mobile's completeOnboarding() merge (see
 * user_state_provider.dart) — a double-click, a network retry, or a mobile
 * sync landing mid-flow can never produce a second "Cash"/"Personal" row.
 * That matters beyond tidiness: mobile derives deterministic remote ids from
 * (user, name), so duplicate names corrupt its pull/merge. The DB indexes
 * added in 20260730 are the hard backstop; this is the cooperative path that
 * reuses rather than collides.
 */
export async function completeOnboarding(
  userId: string | undefined,
  selection: OnboardingSelection,
) {
  if (!userId) throw new Error("Sign in before completing setup.");

  const today = getTodayCalendarDate();
  const existingAccounts = (await fetchAccounts(userId)).filter(
    (a) => a.isActive !== false,
  );
  const byName = new Map(
    existingAccounts.map((a) => [a.name.trim().toLowerCase(), a]),
  );

  // The seed's throwaway placeholder. If the user names an account something
  // else, reuse this row instead of inserting a new one and stranding an
  // "Account 1" nobody asked for.
  const placeholder = existingAccounts.find(
    (a) => a.name.trim().toLowerCase() === "account 1",
  );
  let placeholderAvailable = Boolean(placeholder);

  const claimedNames = new Set<string>();

  for (const draft of selection.accounts) {
    const name = draft.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (claimedNames.has(key)) continue; // de-dupe within the form itself
    claimedNames.add(key);

    const existing = byName.get(key);
    const balance = Number.isFinite(draft.openingBalance)
      ? draft.openingBalance
      : 0;

    let saved: Account;
    if (existing) {
      // Reuse the row that already owns this name (seeded Cash, or a row a
      // mobile sync created while the modal was open).
      saved = await saveAccount(userId, {
        ...existing,
        type: draft.type,
        last4: draft.last4?.trim() || existing.last4,
        openingBalance: balance,
        openingBalanceDate: existing.openingBalanceDate ?? today,
      });
    } else if (placeholderAvailable && placeholder) {
      placeholderAvailable = false;
      saved = await saveAccount(userId, {
        ...placeholder,
        name,
        type: draft.type,
        last4: draft.last4?.trim() || undefined,
        openingBalance: balance,
        openingBalanceDate: today,
      });
    } else {
      saved = await saveAccount(userId, {
        id: crypto.randomUUID(),
        name,
        type: draft.type,
        last4: draft.last4?.trim() || undefined,
        openingBalance: balance,
        openingBalanceDate: today,
        createdAt: nowIso(),
        isActive: true,
      } as Account);
    }

    // Only seed a ledger row when there's a balance to represent, and only
    // once — a re-run finds the account already carrying its opening balance.
    if (balance > 0 && !existing) {
      await addTransaction(userId, buildOpeningBalanceTransaction(saved));
    }
  }

  // An unclaimed placeholder is noise on the dashboard — archive it.
  if (placeholderAvailable && placeholder) {
    await deleteAccount(userId, placeholder.id);
  }

  // ── Purposes ─────────────────────────────────────────────────────────────
  const wanted = new Set(
    ["Personal", ...selection.purposes]
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.toLowerCase()),
  );
  const existingPurposes = await fetchPurposes(userId);
  const activePurposes = existingPurposes.filter((p) => p.isActive !== false);
  const activeByName = new Map(
    activePurposes.map((p) => [p.name.trim().toLowerCase(), p]),
  );

  for (const rawName of ["Personal", ...selection.purposes]) {
    const name = rawName.trim();
    if (!name) continue;
    if (activeByName.has(name.toLowerCase())) continue;

    // Reactivate a previously-archived purpose of the same name rather than
    // inserting a duplicate the unique index would reject.
    const archived = existingPurposes.find(
      (p) => p.isActive === false && p.name.trim().toLowerCase() === name.toLowerCase(),
    );
    await savePurpose(userId, {
      ...(archived ?? {
        id: crypto.randomUUID(),
        color: "#8b7ff0",
        isDefault: false,
        canDelete: true,
      }),
      name,
      isActive: true,
      deletedAt: undefined,
      deletedBy: undefined,
    } as Purpose);
  }

  // Family is seeded on by default; honour an explicit opt-out.
  for (const purpose of activePurposes) {
    const key = purpose.name.trim().toLowerCase();
    if (key === "personal") continue;
    if (!wanted.has(key)) {
      await deletePurpose(userId, purpose.id);
    }
  }

  await dismissBankOnboarding(userId);
}

async function countTransactions(userId: string) {
  const { count, error } = await client()
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchUserSettings(userId?: string): Promise<UserSettings> {
  if (!userId) return defaultUserSettings;
  const data = await throwIfError(
    client().from("users").select("*").eq("id", userId).maybeSingle(),
  );
  return toUserSettings(data as Row | null);
}

export async function saveUserSettings(userId: string | undefined, settings: UserSettings) {
  if (!userId) throw new Error("Sign in before saving settings.");
  await throwIfError(
    client()
      .from("users")
      .update({
        theme: settings.theme,
        notifications: settings.notifications,
        notification_preferences: settings.notificationPreferences ?? defaultNotificationPreferences,
        default_account_id: isUuid(settings.defaultAccountId)
          ? settings.defaultAccountId
          : null,
        monthly_safe_spending_alert: settings.monthlySafeSpendingAlert,
        private_mode: settings.privateMode,
        include_outing_expenses: settings.includeOutingExpenses ?? false,
        dashboard_kpi_cards: settings.dashboardKpiCards ?? null,
      })
      .eq("id", userId),
  );
  return settings;
}

/**
 * Forgot mobile app PIN — does NOT store any PIN on the server.
 * Writes only a timestamp; the signed-in mobile app clears its local PIN
 * hash on the next sync / open and forces a new 4-digit PIN setup.
 */
export async function requestMobileAppPinReset(userId: string | undefined) {
  if (!userId) throw new Error("Sign in before resetting the mobile app PIN.");
  const at = new Date().toISOString();
  await throwIfError(
    client()
      .from("users")
      .update({ app_pin_reset_at: at })
      .eq("id", userId),
  );
  return { appPinResetAt: at };
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const data = await throwIfError(
    client().from("global_settings").select("*").eq("id", "app").maybeSingle(),
  );
  const row = data as Row | null;
  if (!row) return defaultAppConfig;
  return {
    defaultSafeSpendingPercentage: Number(row.default_safe_spending_percentage ?? 20),
    maxCategoryLimit: row.max_category_limit ?? 50,
    appVersion: row.app_version ?? "1.0.0",
    maintenanceMode: row.maintenance_mode ?? false,
    defaultMonthlyBudget: Number(row.default_monthly_budget ?? 0),
    maxPurposesLimit: row.max_purposes_limit ?? 10,
    maxAccountsLimit: row.max_accounts_limit ?? 10,
  };
}

export async function saveAppConfig(config: AppConfig) {
  await throwIfError(
    client()
      .from("global_settings")
      .update({
        default_safe_spending_percentage: config.defaultSafeSpendingPercentage,
        max_category_limit: config.maxCategoryLimit,
        app_version: config.appVersion,
        maintenance_mode: config.maintenanceMode,
        default_monthly_budget: config.defaultMonthlyBudget,
        max_purposes_limit: config.maxPurposesLimit,
        max_accounts_limit: config.maxAccountsLimit,
      })
      .eq("id", "app"),
  );
  return config;
}

export async function fetchPreferences(userId?: string): Promise<Preferences> {
  const settings = await fetchUserSettings(userId);
  return { privateMode: settings.privateMode, theme: settings.theme };
}

export async function savePreferences(userId: string | undefined, preferences: Preferences) {
  const current = await fetchUserSettings(userId);
  return saveUserSettings(userId, { ...current, ...preferences });
}

export async function fetchMonthlyPlan(
  userId: string | undefined,
  month: string,
  purposeId = PERSONAL_PURPOSE_ID,
) {
  if (!userId) return null;

  const baseQuery = () =>
    client()
      .from("monthly_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("month", month);

  const purposes = await fetchPurposes(userId);
  const isPersonalQuery =
    purposeId === PERSONAL_PURPOSE_ID || isPersonalPurposeRef(purposeId, purposes);

  if (isPersonalQuery) {
    const defaultPersonal = getDefaultPersonalPurpose(purposes);
    if (defaultPersonal?.id) {
      const personalPlan = await throwIfError(
        baseQuery().eq("purpose_id", defaultPersonal.id).maybeSingle(),
      );
      if (personalPlan) return toPlan(personalPlan as Row | null);
    }

    const legacyPlan = await throwIfError(
      baseQuery().is("purpose_id", null).maybeSingle(),
    );
    return toPlan(legacyPlan as Row | null);
  }

  let query = baseQuery();
  query = isUuid(purposeId)
    ? query.eq("purpose_id", purposeId)
    : query.is("purpose_id", null);
  const data = await throwIfError(query.maybeSingle());
  return toPlan(data as Row | null);
}

export async function fetchAllMonthlyPlans(userId: string | undefined) {
  if (!userId) return [];
  const data = await throwIfError(
    client()
      .from("monthly_plans")
      .select("*")
      .eq("user_id", userId)
      .order("month", { ascending: false }),
  );
  return ((data as Row[]) ?? [])
    .map(toPlan)
    .filter((plan): plan is MonthlyPlan => plan !== null);
}

export type MonthlyPlanActuals = {
  planId: string;
  month: string;
  purposeId?: string;
  expectedIncome: number;
  actualExpense: number;
  actualIncome: number;
  totalPlanned: number;
  remainingBudget: number;
  variance: number;
};

function toPlanActuals(row: Row): MonthlyPlanActuals {
  return {
    planId: row.plan_id,
    month: row.month,
    purposeId: row.purpose_id ?? undefined,
    expectedIncome: Number(row.expected_income ?? 0),
    actualExpense: Number(row.actual_expense ?? 0),
    actualIncome: Number(row.actual_income ?? 0),
    totalPlanned: Number(row.total_planned ?? 0),
    remainingBudget: Number(row.remaining_budget ?? 0),
    variance: Number(row.variance ?? 0),
  };
}

/** One row per saved plan — powers the Saved Plans list's quick indicator
 * without an N+1 query per card. */
export async function fetchAllMonthlyPlanActuals(userId: string | undefined) {
  if (!userId) return [];
  const data = await throwIfError(
    client().from("monthly_plan_actuals").select("*").eq("user_id", userId),
  );
  return ((data as Row[]) ?? []).map(toPlanActuals);
}

export async function fetchPlanTemplates(userId: string | undefined) {
  const rows = await selectByUser("budget_templates", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.template_name,
    expectedIncome: Number(row.expected_income ?? 0),
    allocations: row.allocations ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as PlanTemplate);
  return rows;
}

export async function savePlanTemplate(userId: string | undefined, template: PlanTemplate) {
  if (!userId) throw new Error("Sign in before saving templates.");
  const data = await throwIfError(
    client()
      .from("budget_templates")
      .upsert(
        compact({
          id: isUuid(template.id) ? template.id : undefined,
          user_id: userId,
          template_name: template.name,
          expected_income: template.expectedIncome,
          allocations: template.allocations,
        }),
      )
      .select("*")
      .single(),
  );
  return (await fetchPlanTemplates(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function deletePlanTemplate(userId: string | undefined, templateId: string) {
  if (!userId) return;
  await throwIfError(
    client().from("budget_templates").delete().eq("user_id", userId).eq("id", templateId),
  );
}

function isMissingMonthlyPlanTitleColumn(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("title") && normalized.includes("monthly_plans");
}

export async function saveMonthlyPlan(userId: string | undefined, plan: MonthlyPlan) {
  if (!userId) throw new Error("Sign in before saving monthly plans.");
  const resolvedPurposeId = await resolvePlanPurposeId(userId, plan.purposeId);
  const resolvedPlan = { ...plan, purposeId: resolvedPurposeId };

  async function upsertPlan(nextPlan: MonthlyPlan) {
    const data = await throwIfError(
      client()
        .from("monthly_plans")
        .upsert(planPayload(userId, nextPlan), {
          onConflict: "user_id,month,purpose_id",
        })
        .select("*")
        .single(),
    );
    return toPlan(data as Row)!;
  }

  try {
    return await upsertPlan(resolvedPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (plan.title && isMissingMonthlyPlanTitleColumn(message)) {
      const { title: _title, ...planWithoutTitle } = resolvedPlan;
      return upsertPlan(planWithoutTitle as MonthlyPlan);
    }
    throw error;
  }
}

export async function deleteMonthlyPlan(userId: string | undefined, planId: string) {
  if (!userId) return;
  await throwIfError(
    client().from("monthly_plans").delete().eq("user_id", userId).eq("id", planId),
  );
}




export async function fetchReflections(userId?: string) {
  return selectByUser("reflections", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    weekStart: row.week_start,
    mood: row.mood,
    wins: row.wins,
    unnecessarySpend: row.unnecessary_spend,
    planAdherence: row.plan_adherence,
    planAdherenceNote: row.plan_adherence_note ?? undefined,
    differentNextWeek: row.different_next_week,
    standoutTransactions: row.standout_transactions ?? undefined,
    aiSummary: row.ai_summary ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as Reflection);
}

export async function fetchReflection(userId: string | undefined, weekStart: string) {
  if (!userId) return null;
  const data = await throwIfError(
    client()
      .from("reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle(),
  );
  return data ? (await fetchReflections(userId)).find((item) => item.id === (data as Row).id) ?? null : null;
}

export async function saveReflection(userId: string | undefined, reflection: Reflection) {
  if (!userId) throw new Error("Sign in before saving reflections.");
  const data = await throwIfError(
    client()
      .from("reflections")
      .upsert(
        compact({
          id: isUuid(reflection.id) ? reflection.id : undefined,
          user_id: userId,
          week_start: reflection.weekStart,
          mood: reflection.mood,
          wins: reflection.wins,
          unnecessary_spend: reflection.unnecessarySpend,
          plan_adherence: reflection.planAdherence,
          plan_adherence_note: reflection.planAdherenceNote,
          different_next_week: reflection.differentNextWeek,
          standout_transactions: reflection.standoutTransactions,
          ai_summary: reflection.aiSummary,
        }),
        { onConflict: "user_id,week_start" },
      )
      .select("*")
      .single(),
  );
  return (await fetchReflections(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function fetchAlerts(userId?: string) {
  return selectByUser("smart_alerts", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    read: row.read,
    createdAt: row.created_at,
  }) as SmartAlert);
}

export async function upsertAlerts(userId: string | undefined, alerts: SmartAlert[]) {
  if (!userId || alerts.length === 0) return [];
  await throwIfError(
    client().from("smart_alerts").upsert(
      alerts.map((alert) =>
        compact({
          id: isUuid(alert.id) ? alert.id : undefined,
          user_id: userId,
          type: alert.type,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          read: alert.read,
          created_at: alert.createdAt,
        }),
      ),
    ),
  );
  return fetchAlerts(userId);
}

export async function markAlertRead(userId: string | undefined, alertId: string) {
  if (!userId) return [];
  await throwIfError(
    client().from("smart_alerts").update({ read: true }).eq("user_id", userId).eq("id", alertId),
  );
  return fetchAlerts(userId);
}

export async function markAllAlertsRead(userId: string | undefined) {
  if (!userId) return [];
  await throwIfError(client().from("smart_alerts").update({ read: true }).eq("user_id", userId));
  return fetchAlerts(userId);
}

export async function fetchIncomeStreams(userId?: string) {
  return selectByUser("income_streams", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    source: row.source,
    amount: Number(row.amount ?? 0),
    frequency: row.frequency,
    lastReceived: row.last_received ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as IncomeStream);
}

export async function saveIncomeStream(userId: string | undefined, stream: IncomeStream) {
  if (!userId) throw new Error("Sign in before saving income streams.");
  const data = await throwIfError(
    client()
      .from("income_streams")
      .upsert(
        compact({
          id: isUuid(stream.id) ? stream.id : undefined,
          user_id: userId,
          source: stream.source,
          amount: stream.amount,
          frequency: stream.frequency,
          last_received: stream.lastReceived,
        }),
      )
      .select("*")
      .single(),
  );
  return (await fetchIncomeStreams(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function deleteIncomeStream(userId: string | undefined, streamId: string) {
  if (!userId) return;
  await throwIfError(client().from("income_streams").delete().eq("user_id", userId).eq("id", streamId));
}

export async function fetchIncomeTargets(userId?: string): Promise<IncomeTargets> {
  if (!userId) return { target3Months: 0, target6Months: 0, target12Months: 0, activeHorizon: 3 };
  const data = await throwIfError(
    client().from("income_targets").select("*").eq("user_id", userId).maybeSingle(),
  );
  const row = data as Row | null;
  return {
    target3Months: Number(row?.target_3_months ?? 0),
    target6Months: Number(row?.target_6_months ?? 0),
    target12Months: Number(row?.target_12_months ?? 0),
    activeHorizon: row?.active_horizon ?? 3,
  };
}

export async function saveIncomeTargets(userId: string | undefined, targets: IncomeTargets) {
  if (!userId) throw new Error("Sign in before saving income targets.");
  await throwIfError(
    client().from("income_targets").upsert({
      user_id: userId,
      target_3_months: targets.target3Months,
      target_6_months: targets.target6Months,
      target_12_months: targets.target12Months,
      active_horizon: targets.activeHorizon,
    }),
  );
  return targets;
}

/** Total of expense transactions in investment-flagged categories, via the
 * investment_totals view — the "Total Investment" number on Wealth. */
export async function fetchInvestmentTotal(userId?: string) {
  if (!userId) return 0;
  const data = await throwIfError(
    client()
      .from("investment_totals")
      .select("total_invested")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return Number((data as Row | null)?.total_invested ?? 0);
}

export async function fetchSavingsGoals(userId?: string) {
  return selectByUser("savings_goals", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetAmount: Number(row.target_amount ?? 0),
    savedAmount: Number(row.saved_amount ?? 0),
    monthlyContribution:
      row.monthly_contribution === null ? undefined : Number(row.monthly_contribution),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as SavingsGoal);
}

export async function saveSavingsGoal(userId: string | undefined, goal: SavingsGoal) {
  if (!userId) throw new Error("Sign in before saving savings goals.");
  const data = await throwIfError(
    client()
      .from("savings_goals")
      .upsert(
        compact({
          id: isUuid(goal.id) ? goal.id : undefined,
          user_id: userId,
          name: goal.name,
          target_amount: goal.targetAmount,
          saved_amount: goal.savedAmount,
          monthly_contribution: goal.monthlyContribution,
        }),
      )
      .select("*")
      .single(),
  );
  return (await fetchSavingsGoals(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function deleteSavingsGoal(userId: string | undefined, goalId: string) {
  if (!userId) return;
  await throwIfError(client().from("savings_goals").delete().eq("user_id", userId).eq("id", goalId));
}

export async function fetchProjectorSettings(userId?: string) {
  if (!userId) return null;
  const data = await throwIfError(
    client().from("projector_settings").select("settings").eq("user_id", userId).maybeSingle(),
  );
  return ((data as Row | null)?.settings ?? null) as any;
}

export async function saveProjectorSettings(userId: string | undefined, settings: any) {
  if (!userId) throw new Error("Sign in before saving projector settings.");
  await throwIfError(
    client().from("projector_settings").upsert({ user_id: userId, settings }),
  );
  return settings;
}

export async function fetchOutings(userId?: string) {
  const outings = await selectByUser("outings", userId, toOuting);
  return outings.filter((outing) => outing.isActive !== false);
}

export function subscribeToOutings(
  userId: string | undefined,
  onData: (outings: Outing[]) => void,
  onError?: (error: Error) => void,
) {
  if (!userId) {
    onData([]);
    return () => undefined;
  }
  void fetchOutings(userId).then(onData).catch(onError);
  const supabase = client();
  logRealtimeSubscribe("outings");
  const channel = supabase
    .channel(uniqueTopic(`outings:${userId}`))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "outings", filter: `user_id=eq.${userId}` },
      () => void fetchOutings(userId).then(onData).catch(onError),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live invalidation when outing expenses change (mobile edit amounts, etc.). */
export function subscribeToOutingExpenseChanges(
  userId: string | undefined,
  onChange: () => void,
) {
  if (!userId) return () => undefined;
  const supabase = client();
  logRealtimeSubscribe("outing_expenses");
  const channel = supabase
    .channel(uniqueTopic(`outing_expenses:${userId}`))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "outing_expenses",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// One shared accounts channel per user, fanned out to every subscriber.
//
// useAccounts() is consumed by ~13 components, several of which mount at the
// same time on Dashboard. supabase-js returns the EXISTING channel when you
// ask for a topic that already exists, so a naive "channel().on().subscribe()"
// per hook instance makes the second caller attach a postgres_changes handler
// to an already-subscribed channel — which throws:
//   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
// Registering the listener once and refcounting subscribers avoids both that
// crash and 13 duplicate websocket channels.
type AccountChannelEntry = {
  channel: RealtimeChannel;
  listeners: Set<() => void>;
};

const accountChannels = new Map<string, AccountChannelEntry>();

// Signal-only Realtime subscription — Dashboard/Wealth read accounts via
// useAccounts()'s own React Query cache (fetchAccounts), so this doesn't
// duplicate that fetch; it just tells the caller "something changed" so it
// can invalidate the query it already owns. Closes the gap where accounts
// previously had no Realtime coverage at all and relied solely on the
// 10-minute global staleTime with refetchOnWindowFocus/refetchOnMount off.
export function subscribeToAccountChanges(
  userId: string | undefined,
  onChange: () => void,
) {
  if (!userId) return () => undefined;

  const supabase = client();
  let entry = accountChannels.get(userId);

  if (!entry) {
    const listeners = new Set<() => void>();
    logRealtimeSubscribe("accounts");
    // Attach the handler BEFORE subscribe(), exactly once per user.
    const channel = supabase
      .channel(uniqueTopic(`accounts:${userId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        () => {
          for (const listener of listeners) listener();
        },
      )
      .subscribe();

    entry = { channel, listeners };
    accountChannels.set(userId, entry);
  }

  entry.listeners.add(onChange);

  return () => {
    const current = accountChannels.get(userId);
    if (!current) return;
    current.listeners.delete(onChange);
    // Last subscriber left — tear the channel down so it isn't leaked across
    // sign-out/user-switch.
    if (current.listeners.size === 0) {
      accountChannels.delete(userId);
      void supabase.removeChannel(current.channel);
    }
  };
}

type AlertChannelEntry = {
  channel: RealtimeChannel;
  listeners: Set<() => void>;
};

const alertChannels = new Map<string, AlertChannelEntry>();

export function subscribeToAlerts(
  userId: string | undefined,
  onData: (alerts: SmartAlert[]) => void,
  onError?: (error: Error) => void,
) {
  if (!userId) {
    onData([]);
    return () => undefined;
  }

  void fetchAlerts(userId).then(onData).catch(onError);

  const supabase = client();
  let entry = alertChannels.get(userId);

  if (!entry) {
    const listeners = new Set<() => void>();
    logRealtimeSubscribe("smart_alerts");
    const channel = supabase
      .channel(uniqueTopic(`alerts:${userId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "smart_alerts", filter: `user_id=eq.${userId}` },
        () => {
          for (const listener of listeners) listener();
        },
      )
      .subscribe();

    entry = { channel, listeners };
    alertChannels.set(userId, entry);
  }

  const onChange = () => {
    void fetchAlerts(userId).then(onData).catch(onError);
  };

  entry.listeners.add(onChange);

  return () => {
    const current = alertChannels.get(userId);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      alertChannels.delete(userId);
      void supabase.removeChannel(current.channel);
    }
  };
}

export async function saveOuting(userId: string | undefined, outing: Outing) {
  if (!userId) throw new Error("Sign in before saving outings.");
  return upsertById("outings", outingPayload(userId, outing), toOuting);
}

/**
 * Soft-delete outing AND cascade ledger/expenses/settlements, atomically,
 * via the cascade_delete_outing RPC (see
 * supabase/migrations/20260736_outing_cascade_soft_delete.sql). Everything
 * linked to the outing disappears immediately but stays fully restorable —
 * see restoreOuting below.
 */
export async function deleteOuting(userId: string | undefined, outingId: string) {
  if (!userId) return;
  await throwIfError(
    client().rpc("cascade_delete_outing", { p_outing_id: outingId, p_user_id: userId }),
  );
}

/** Reverses deleteOuting — restores the outing and everything it cascaded. */
export async function restoreOuting(userId: string | undefined, outingId: string) {
  if (!userId) return;
  await throwIfError(
    client().rpc("restore_deleted_outing", { p_outing_id: outingId, p_user_id: userId }),
  );
}

/** Outings soft-deleted via deleteOuting, for Settings > Data & Backups. */
export async function fetchDeletedOutings(userId?: string) {
  if (!userId) return [];
  const data = await throwIfError(
    client()
      .from("outings")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", false)
      .order("deleted_at", { ascending: false }),
  );
  return ((data as Row[]) ?? []).map(toOuting);
}

export async function fetchOutingExpenses(userId?: string, outingId?: string) {
  if (!userId) return [];
  let query = client()
    .from("outing_expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (outingId) query = query.eq("outing_id", outingId);
  const data = await throwIfError(query.order("expense_date", { ascending: false }));
  return ((data as Row[]) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    outingId: row.outing_id,
    description: row.description,
    amount: Number(row.amount ?? 0),
    category: row.category_id ?? "",
    date: row.expense_date,
    paidByMemberId: row.paid_by_member_id,
    splitType: row.split_type,
    splits: row.splits ?? [],
    source: row.source ?? "manual",
    linkedTransactionId: row.linked_transaction_id ?? undefined,
    accountName: row.account_name ?? undefined,
    paymentMode: row.payment_mode ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as OutingExpense);
}

export async function saveOutingExpense(userId: string | undefined, expense: OutingExpense) {
  if (!userId) throw new Error("Sign in before saving outing expenses.");
  const data = await throwIfError(
    client()
      .from("outing_expenses")
      .upsert(
        compact({
          id: isUuid(expense.id) ? expense.id : undefined,
          user_id: userId,
          outing_id: expense.outingId,
          description: expense.description,
          amount: expense.amount,
          category_id: expense.category,
          expense_date: expense.date,
          paid_by_member_id: expense.paidByMemberId,
          split_type: expense.splitType,
          splits: expense.splits,
          source: expense.source,
          account_name: expense.accountName ?? undefined,
          payment_mode: expense.paymentMode ?? undefined,
          // Explicit null clears a previous link (e.g. payer changed away from you).
          linked_transaction_id: isUuid(expense.linkedTransactionId)
            ? expense.linkedTransactionId
            : null,
        }),
      )
      .select("*")
      .single(),
  );
  return (await fetchOutingExpenses(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function deleteOutingExpense(userId: string | undefined, expenseId: string) {
  if (!userId) return;
  await throwIfError(client().from("outing_expenses").delete().eq("user_id", userId).eq("id", expenseId));
}

export async function fetchOutingSettlements(userId?: string, outingId?: string) {
  if (!userId) return [];
  let query = client().from("settlements").select("*").eq("user_id", userId);
  if (outingId) query = query.eq("outing_id", outingId);
  const data = await throwIfError(query.order("settled_date", { ascending: false }));
  return ((data as Row[]) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    outingId: row.outing_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: Number(row.amount ?? 0),
    date: row.settled_date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  }) as OutingSettlement);
}

export async function saveOutingSettlement(userId: string | undefined, settlement: OutingSettlement) {
  if (!userId) throw new Error("Sign in before saving settlements.");
  const data = await throwIfError(
    client()
      .from("settlements")
      .upsert(
        compact({
          id: isUuid(settlement.id) ? settlement.id : undefined,
          user_id: userId,
          outing_id: settlement.outingId,
          from_member_id: settlement.fromMemberId,
          to_member_id: settlement.toMemberId,
          amount: settlement.amount,
          settled_date: settlement.date,
          note: settlement.note,
        }),
      )
      .select("*")
      .single(),
  );
  return (await fetchOutingSettlements(userId)).find((item) => item.id === (data as Row).id)!;
}

// ============================================================================
// Friend splits — standalone shared expenses. These deliberately do NOT touch
// outings/outing_expenses/settlements; a friend split is not a trip.
// ============================================================================

function toFriendSplit(row: Row): FriendSplit {
  return {
    id: row.id,
    userId: row.user_id,
    transactionId: row.transaction_id,
    description: row.description,
    amount: Number(row.amount ?? 0),
    category: row.category_id ?? "",
    date: row.split_date,
    members: normalizeOutingMembers(row.members),
    paidByMemberId: row.paid_by_member_id,
    splitType: row.split_type,
    splits: row.splits ?? [],
    accountName: row.account_name ?? undefined,
    paymentMode: row.payment_mode ?? undefined,
    note: row.note ?? undefined,
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchFriendSplits(userId?: string, transactionId?: string) {
  if (!userId) return [];
  let query = client()
    .from("friend_splits")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (transactionId) query = query.eq("transaction_id", transactionId);
  const data = await throwIfError(query.order("split_date", { ascending: false }));
  return ((data as Row[]) ?? []).map(toFriendSplit);
}

export async function saveFriendSplit(userId: string | undefined, split: FriendSplit) {
  if (!userId) throw new Error("Sign in before saving friend splits.");
  const data = await throwIfError(
    client()
      .from("friend_splits")
      // A transaction carries at most one split — re-saving rewrites it.
      .upsert(
        compact({
          id: isUuid(split.id) ? split.id : undefined,
          user_id: userId,
          transaction_id: split.transactionId,
          description: split.description,
          amount: split.amount,
          category_id: split.category,
          split_date: toTimestamptz(split.date),
          members: split.members ?? [],
          paid_by_member_id: split.paidByMemberId,
          split_type: split.splitType,
          splits: split.splits ?? [],
          account_name: split.accountName ?? undefined,
          payment_mode: split.paymentMode ?? undefined,
          note: split.note ?? undefined,
          is_active: split.isActive ?? true,
          updated_at: new Date().toISOString(),
        }),
        { onConflict: "transaction_id" },
      )
      .select("*")
      .single(),
  );
  return toFriendSplit(data as Row);
}

export async function deleteFriendSplit(userId: string | undefined, splitId: string) {
  if (!userId) return;
  await throwIfError(
    client().from("friend_splits").delete().eq("user_id", userId).eq("id", splitId),
  );
}

export async function fetchFriendSettlements(userId?: string, friendSplitId?: string) {
  if (!userId) return [];
  let query = client().from("friend_settlements").select("*").eq("user_id", userId);
  if (friendSplitId) query = query.eq("friend_split_id", friendSplitId);
  const data = await throwIfError(query.order("settled_date", { ascending: false }));
  return ((data as Row[]) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    friendSplitId: row.friend_split_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: Number(row.amount ?? 0),
    date: row.settled_date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  }) as FriendSettlement);
}

export async function saveFriendSettlement(
  userId: string | undefined,
  settlement: FriendSettlement,
) {
  if (!userId) throw new Error("Sign in before saving settlements.");
  const data = await throwIfError(
    client()
      .from("friend_settlements")
      .upsert(
        compact({
          id: isUuid(settlement.id) ? settlement.id : undefined,
          user_id: userId,
          friend_split_id: settlement.friendSplitId,
          from_member_id: settlement.fromMemberId,
          to_member_id: settlement.toMemberId,
          amount: settlement.amount,
          settled_date: toTimestamptz(settlement.date),
          note: settlement.note,
        }),
      )
      .select("*")
      .single(),
  );
  const row = data as Row;
  return {
    id: row.id,
    userId: row.user_id,
    friendSplitId: row.friend_split_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: Number(row.amount ?? 0),
    date: row.settled_date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  } as FriendSettlement;
}

export async function deleteFriendSettlement(userId: string | undefined, id: string) {
  if (!userId) return;
  await throwIfError(
    client().from("friend_settlements").delete().eq("user_id", userId).eq("id", id),
  );
}

/** Merge primary + list into unique ordered UPI handles (first = primary). */
export function normalizeFriendUpis(friend: {
  upiId?: string | null;
  upiIds?: string[] | null;
}): { upiId?: string; upiIds: string[] } {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (raw?: string | null) => {
    const v = (raw ?? "").trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(v);
  };
  push(friend.upiId);
  for (const id of friend.upiIds ?? []) push(id);
  return {
    upiId: ordered[0],
    upiIds: ordered,
  };
}

function toFriend(row: Row): Friend {
  const { upiId, upiIds } = normalizeFriendUpis({
    upiId: row.upi ?? undefined,
    upiIds: Array.isArray(row.upi_ids) ? (row.upi_ids as string[]) : [],
  });
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    upiId,
    upiIds,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every friend including soft-deleted ones. Historical outings and splits
 * still reference deleted friends, so the UI needs them to render
 * "Sanjay (Deleted)" rather than dropping the row.
 */
export async function fetchAllFriends(userId?: string) {
  return selectByUser("friends", userId, toFriend);
}

export async function fetchFriends(userId?: string) {
  const friends = await selectByUser("friends", userId, toFriend);
  return friends.filter((friend) => friend.isActive !== false);
}

export async function saveFriend(userId: string | undefined, friend: Friend) {
  if (!userId) throw new Error("Sign in before saving friends.");
  const { upiId, upiIds } = normalizeFriendUpis(friend);
  const data = await throwIfError(
    client()
      .from("friends")
      .upsert(
        compact({
          id: isUuid(friend.id) ? friend.id : undefined,
          user_id: userId,
          name: friend.name,
          upi: upiId ?? null,
          upi_ids: upiIds,
          phone: friend.phone,
          email: friend.email,
          // Explicit null so clearing the field in the modal actually clears it.
          notes: friend.notes?.trim() ? friend.notes.trim() : null,
          is_active: friend.isActive ?? true,
          deleted_at: friend.deletedAt,
          deleted_by: isUuid(friend.deletedBy) ? friend.deletedBy : undefined,
        }),
      )
      .select("*")
      .single(),
  );
  // Map the returned row directly. Re-fetching and .find()!-ing it could
  // yield undefined (and a broken cache entry) if the row didn't come back.
  return toFriend(data as Row);
}

/**
 * Cascades: the friend's splits, those splits' settlement history, and the
 * ledger rows they describe all go with them. Outing membership is left
 * intact — see the RPC comment in 20260747_cascade_delete_friend.sql.
 */
export async function deleteFriend(userId: string | undefined, friendId: string) {
  if (!userId) return;
  await throwIfError(
    client().rpc("cascade_delete_friend", {
      p_friend_id: friendId,
      p_user_id: userId,
    }),
  );
}

// ── Outing categories (picker: Trip / Other / custom) ────────────────────

const DEFAULT_OUTING_CATEGORY_SEED = OUTING_CATEGORIES.map((name, i) => ({
  name,
  sort_order: name === "Other" ? 100 : i + 1,
  is_system: true,
}));

function toOutingCategory(row: Row): OutingCategoryRow {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    name: String(row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    isSystem: row.is_system === true,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/** Ensure defaults exist, then return sorted category names for the picker. */
export async function fetchOutingCategories(
  userId?: string,
): Promise<OutingCategoryRow[]> {
  if (!userId) {
    return DEFAULT_OUTING_CATEGORY_SEED.map((d, i) => ({
      id: `local-${i}`,
      name: d.name,
      sortOrder: d.sort_order,
      isSystem: true,
    }));
  }

  const load = async () => {
    const data = await throwIfError(
      client()
        .from("outing_categories")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true }),
    );
    return ((data as Row[]) ?? []).map(toOutingCategory);
  };

  let rows = await load();

  if (rows.length === 0) {
    for (const d of DEFAULT_OUTING_CATEGORY_SEED) {
      try {
        await client().from("outing_categories").insert({
          user_id: userId,
          name: d.name,
          sort_order: d.sort_order,
          is_system: d.is_system,
        });
      } catch {
        /* ignore duplicates */
      }
    }
    rows = await load();
  }

  return rows
    .filter((r) => r.name.trim())
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

export async function saveOutingCategory(
  userId: string | undefined,
  name: string,
): Promise<OutingCategoryRow> {
  if (!userId) throw new Error("Sign in before saving outing categories.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");

  const existing = await fetchOutingCategories(userId);
  const hit = existing.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (hit) return hit;

  const data = await throwIfError(
    client()
      .from("outing_categories")
      .insert({
        user_id: userId,
        name: trimmed,
        sort_order: existing.length + 1,
        is_system: false,
      })
      .select("*")
      .single(),
  );
  return toOutingCategory(data as Row);
}

export async function deleteOutingCategory(
  userId: string | undefined,
  categoryId: string,
) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("outing_categories")
      .delete()
      .eq("user_id", userId)
      .eq("id", categoryId)
      .eq("is_system", false),
  );
}

export async function fetchContributors(userId?: string) {
  return selectByUser("contributors", userId, toContributor);
}

export function defaultContributorDocId(userId: string) {
  return `${userId}:me`;
}

export async function saveContributor(userId: string | undefined, contributor: Contributor) {
  if (!userId) throw new Error("Sign in before saving contributors.");
  const data = await throwIfError(
    client()
      .from("contributors")
      .upsert(
        compact({
          id: isUuid(contributor.id) ? contributor.id : undefined,
          user_id: userId,
          name: contributor.name,
          color: contributor.color,
          is_default: contributor.isDefault ?? false,
          can_delete: contributor.canDelete ?? true,
          is_active: contributor.isActive ?? true,
          deleted_at: contributor.deletedAt,
          deleted_by: isUuid(contributor.deletedBy) ? contributor.deletedBy : undefined,
        }),
      )
      .select("*")
      .single(),
  );
  return toContributor(data as Row);
}

export async function deleteContributor(userId: string | undefined, contributorId: string) {
  if (!userId) return;
  await throwIfError(
    client()
      .from("contributors")
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: userId })
      .eq("user_id", userId)
      .eq("id", contributorId),
  );
}

function toSmartView(row: Row): SmartView {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    accountId: row.account_id ?? null,
    purposeId: row.purpose_id ?? null,
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids : [],
    contributorId: row.contributor_id ?? null,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function fetchSmartViews(userId?: string) {
  return selectByUser("smart_views", userId, toSmartView, "created_at");
}

export async function saveSmartView(
  userId: string | undefined,
  view: Omit<SmartView, "id" | "userId" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  if (!userId) throw new Error("Sign in before saving Smart Views.");
  const data = await throwIfError(
    client()
      .from("smart_views")
      .upsert(
        compact({
          id: isUuid(view.id) ? view.id : undefined,
          user_id: userId,
          name: view.name,
          account_id: isUuid(view.accountId ?? undefined) ? view.accountId : null,
          purpose_id: isUuid(view.purposeId ?? undefined) ? view.purposeId : null,
          category_ids: view.categoryIds ?? [],
          contributor_id: isUuid(view.contributorId ?? undefined)
            ? view.contributorId
            : null,
        }),
      )
      .select("*")
      .single(),
  );
  return toSmartView(data as Row);
}

export async function deleteSmartView(userId: string | undefined, viewId: string) {
  if (!userId) return;
  await throwIfError(
    client().from("smart_views").delete().eq("user_id", userId).eq("id", viewId),
  );
}

export async function fetchAiChatHistory(userId: string | undefined) {
  return selectByUser("ai_chat_messages", userId, (row) => ({
    id: row.id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
  }) as AiChatMessage, "timestamp");
}

// Channel name shared with the admin-delete route's broadcaster (server)
// and any future mobile foreground subscriber — one channel-naming scheme
// for "this user's account status changed" across every client.
export function userStatusChannelName(userId: string) {
  return `user-status:${userId}`;
}

// Subscribes to the current user's own status channel and calls onRevoked
// the instant an admin-delete broadcasts a "revoked" event on it. This is
// the live half of forced-logout-on-delete; a periodic getUser() check is
// the fallback for the rare case a broadcast is missed (network blip,
// channel not yet established at the moment of deletion, etc.) — see
// SupabaseProvider, which owns both.
export function subscribeToUserRevoked(
  userId: string | undefined,
  onRevoked: () => void,
) {
  if (!userId) return () => undefined;

  const supabase = client();
  logRealtimeSubscribe("user-status");
  const channel = supabase
    .channel(userStatusChannelName(userId))
    .on("broadcast", { event: "revoked" }, () => onRevoked())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToAiChatHistory(
  userId: string | undefined,
  onData: (messages: AiChatMessage[]) => void,
  onError?: (error: Error) => void,
) {
  if (!userId) {
    onData([]);
    return () => undefined;
  }
  void fetchAiChatHistory(userId).then(onData).catch(onError);
  const supabase = client();
  logRealtimeSubscribe("ai_chat_messages");
  const channel = supabase
    .channel(`ai-chat:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ai_chat_messages", filter: `user_id=eq.${userId}` },
      () => void fetchAiChatHistory(userId).then(onData).catch(onError),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function saveAiChatMessage(
  userId: string | undefined,
  message: Pick<AiChatMessage, "role" | "content"> & Partial<AiChatMessage>,
) {
  if (!userId) throw new Error("Sign in before saving chat messages.");
  const data = await throwIfError(
    client()
      .from("ai_chat_messages")
      .insert({
        user_id: userId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp ?? nowIso(),
      })
      .select("*")
      .single(),
  );
  return (await fetchAiChatHistory(userId)).find((item) => item.id === (data as Row).id)!;
}

export async function fetchAiInsight(userId: string | undefined, month: string, type = "financial_health") {
  if (!userId) return null;
  const data = await throwIfError(
    client()
      .from("ai_insights")
      .select("*")
      .eq("user_id", userId)
      .eq("month", month)
      .eq("type", type)
      .maybeSingle(),
  );
  const row = data as Row | null;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    month: row.month,
    type: row.type,
    healthScore: row.health_score,
    summary: row.summary,
    tips: row.tips ?? [],
    generatedAt: row.generated_at,
  } as AiInsight;
}

export async function saveAiInsight(
  userId: string | undefined,
  insight: Omit<AiInsight, "userId"> & Partial<Pick<AiInsight, "userId">>,
): Promise<AiInsight> {
  if (!userId) throw new Error("Sign in before saving AI insights.");
  await throwIfError(
    client().from("ai_insights").upsert(
      compact({
        id: isUuid(insight.id) ? insight.id : undefined,
        user_id: userId,
        month: insight.month,
        type: insight.type,
        health_score: insight.healthScore,
        summary: insight.summary,
        tips: insight.tips,
        generated_at: insight.generatedAt,
      }),
      { onConflict: "user_id,month,type" },
    ),
  );
  return { ...insight, userId };
}

function smsTemplate(row: Row): SmsTemplateRule {
  return {
    id: row.id,
    bankName: row.bank_name,
    type: row.type,
    mode: row.mode,
    templatePattern: row.template_pattern,
    extractionMap: row.extraction_map ?? undefined,
    keywords: row.keywords ?? [],
    sampleMessage: row.sample_message ?? "",
    similarityThreshold: Number(row.similarity_threshold ?? 0.65),
    isActive: row.is_active ?? true,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function smsDetection(row: Row): SmsDetectionRule {
  return {
    id: row.id,
    matchPattern: row.match_pattern ?? "",
    containsKeywords: row.contains_keywords ?? [],
    excludeKeywords: row.exclude_keywords ?? [],
    amountPattern: row.amount_pattern ?? undefined,
    namePattern: row.name_pattern ?? undefined,
    datePattern: row.date_pattern ?? undefined,
    refPattern: row.ref_pattern ?? undefined,
    accountPattern: row.account_pattern ?? undefined,
    upiPattern: row.upi_pattern ?? undefined,
    sampleMessage: row.sample_message ?? "",
    type: row.type,
    mode: row.mode,
    bankName: row.bank_name,
    isActive: row.is_active ?? true,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function smsBlock(row: Row): SmsBlockRule {
  return {
    id: row.id,
    name: row.name,
    keywords: row.keywords ?? [],
    pattern: row.pattern ?? undefined,
    sampleMessage: row.sample_message ?? "",
    similarityThreshold: Number(row.similarity_threshold ?? 0.8),
    isActive: row.is_active ?? true,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSmsTemplateRules() {
  const data = await throwIfError(client().from("sms_template_rules").select("*").order("bank_name"));
  return ((data as Row[]) ?? []).map(smsTemplate);
}

export async function saveSmsTemplateRule(rule: SmsTemplateRule, adminId?: string) {
  const data = await throwIfError(
    client()
      .from("sms_template_rules")
      .upsert(
        compact({
          id: isUuid(rule.id) ? rule.id : undefined,
          bank_name: rule.bankName,
          type: rule.type,
          mode: rule.mode,
          template_pattern: rule.templatePattern,
          extraction_map: rule.extractionMap,
          keywords: rule.keywords,
          sample_message: rule.sampleMessage ?? "",
          similarity_threshold: rule.similarityThreshold ?? 0.65,
          is_active: rule.isActive,
          created_by: isUuid(adminId) ? adminId : undefined,
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single(),
  );
  return smsTemplate(data as Row);
}

export async function deleteSmsTemplateRule(ruleId: string) {
  await throwIfError(client().from("sms_template_rules").delete().eq("id", ruleId));
}

export async function fetchSmsDetectionRules() {
  const data = await throwIfError(client().from("sms_detection_rules").select("*").order("bank_name"));
  return ((data as Row[]) ?? []).map(smsDetection);
}

export async function saveSmsDetectionRule(rule: SmsDetectionRule, adminId?: string) {
  const data = await throwIfError(
    client()
      .from("sms_detection_rules")
      .upsert(
        compact({
          id: isUuid(rule.id) ? rule.id : undefined,
          match_pattern: rule.matchPattern,
          contains_keywords: rule.containsKeywords,
          exclude_keywords: rule.excludeKeywords,
          amount_pattern: rule.amountPattern ?? "",
          name_pattern: rule.namePattern ?? "",
          date_pattern: rule.datePattern ?? "",
          ref_pattern: rule.refPattern ?? "",
          account_pattern: rule.accountPattern ?? "",
          upi_pattern: rule.upiPattern ?? "",
          sample_message: rule.sampleMessage ?? "",
          type: rule.type,
          mode: rule.mode,
          bank_name: rule.bankName,
          is_active: rule.isActive,
          created_by: isUuid(adminId) ? adminId : undefined,
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single(),
  );
  return smsDetection(data as Row);
}

export async function deleteSmsDetectionRule(ruleId: string) {
  await throwIfError(client().from("sms_detection_rules").delete().eq("id", ruleId));
}

export async function fetchSmsBlockRules() {
  const data = await throwIfError(client().from("sms_block_rules").select("*").order("name"));
  return ((data as Row[]) ?? []).map(smsBlock);
}

export async function saveSmsBlockRule(rule: SmsBlockRule, adminId?: string) {
  const data = await throwIfError(
    client()
      .from("sms_block_rules")
      .upsert(
        compact({
          id: isUuid(rule.id) ? rule.id : undefined,
          name: rule.name,
          keywords: rule.keywords,
          pattern: rule.pattern,
          sample_message: rule.sampleMessage ?? "",
          similarity_threshold: rule.similarityThreshold,
          is_active: rule.isActive,
          created_by: isUuid(adminId) ? adminId : undefined,
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single(),
  );
  return smsBlock(data as Row);
}

export async function deleteSmsBlockRule(ruleId: string) {
  await throwIfError(client().from("sms_block_rules").delete().eq("id", ruleId));
}

export async function clearAiChatHistory(userId: string | undefined) {
  if (!userId) return;
  await throwIfError(client().from("ai_chat_messages").delete().eq("user_id", userId));
}

export const BACKUP_VERSION = "1.0";
export const BACKUP_SCHEMA_VERSION = "2.0-supabase";

const backupTables = [
  "accounts",
  "purposes",
  "categories",
  "contributors",
  "transactions",
  "transaction_splits",
  "transaction_items",
  "monthly_plans",
  "budget_templates",
  "friends",
  "outings",
  "outing_expenses",
  "settlements",
  "purpose_shares",
  "account_balance_history",
  "reflections",
  "smart_alerts",
  "income_streams",
  "income_targets",
  "savings_goals",
  "projector_settings",
  "ai_chat_messages",
  "ai_insights",
];

export type SpentXBackup = {
  version: string;
  schemaVersion: string;
  exportedAt: string;
  exportDate: string;
  userId: string;
  manifest: string[];
  data: Record<string, unknown[]>;
};

export function isValidBackupFile(data: unknown): data is SpentXBackup {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as SpentXBackup).schemaVersion &&
      Array.isArray((data as SpentXBackup).manifest) &&
      typeof (data as SpentXBackup).data === "object",
  );
}

export async function gatherAllUserData(userId: string): Promise<SpentXBackup> {
  const data: Record<string, unknown[]> = {};
  for (const table of backupTables) {
    const rows = await throwIfError(
      client().from(table).select("*").eq("user_id", userId),
    ).catch(() => []);
    data[table] = (rows as unknown[]) ?? [];
  }
  const exportedAt = nowIso();
  return {
    version: BACKUP_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    exportDate: exportedAt,
    userId,
    manifest: backupTables,
    data,
  };
}

export function buildBackupZipBytes(backup: SpentXBackup): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(backup.manifest, null, 2)),
    "version.json": strToU8(
      JSON.stringify(
        {
          version: backup.version,
          schemaVersion: backup.schemaVersion,
          exportedAt: backup.exportedAt,
        },
        null,
        2,
      ),
    ),
  };
  for (const [table, rows] of Object.entries(backup.data)) {
    files[`${table}.json`] = strToU8(JSON.stringify(rows, null, 2));
  }
  return zipSync(files);
}

export function parseBackupZipBytes(bytes: Uint8Array): SpentXBackup | null {
  try {
    const files = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(files["manifest.json"] ?? strToU8("[]")));
    const version = JSON.parse(strFromU8(files["version.json"] ?? strToU8("{}")));
    const data: Record<string, unknown[]> = {};
    for (const table of manifest) {
      const file = files[`${table}.json`];
      data[table] = file ? JSON.parse(strFromU8(file)) : [];
    }
    return {
      version: version.version ?? BACKUP_VERSION,
      schemaVersion: version.schemaVersion ?? BACKUP_SCHEMA_VERSION,
      exportedAt: version.exportedAt ?? version.exportDate ?? nowIso(),
      exportDate: version.exportDate ?? version.exportedAt ?? nowIso(),
      userId: "",
      manifest,
      data,
    };
  } catch {
    return null;
  }
}

export async function uploadBackupToStorage(
  userId: string,
  backup: SpentXBackup,
  bytes = buildBackupZipBytes(backup),
) {
  const path = `${userId}/${backup.exportedAt.replace(/[:.]/g, "-")}.zip`;
  const { error } = await client().storage.from("backups").upload(path, bytes, {
    contentType: "application/zip",
    upsert: true,
  });
  const record = {
    user_id: userId,
    type: "manual",
    storage_path: path,
    size_bytes: bytes.byteLength,
    backup_schema_version: backup.schemaVersion,
    manifest: backup.manifest,
    status: error ? "failed" : "success",
    error_message: error?.message,
  };
  await client().from("backup_history").insert(record);
  if (error) throw error;
  return path;
}

export async function restoreBackupData(userId: string, backup: SpentXBackup) {
  for (const table of backup.manifest) {
    const rows = (backup.data[table] ?? []) as Row[];
    if (rows.length === 0) continue;
    const scopedRows = rows.map((row) => ({ ...row, user_id: userId }));
    await throwIfError(client().from(table).upsert(scopedRows));
  }
}

export async function fetchGlobalSettings(): Promise<GlobalSettings | null> {
  const data = await throwIfError(
    client().from("global_settings").select("*").eq("id", "app").maybeSingle(),
  );
  const row = data as Row | null;
  if (!row) return null;
  return {
    id: "app",
    ...(await fetchAppConfig()),
    maxContributorsLimit: row.max_contributors_limit ?? 10,
    defaultCategories: row.default_categories ?? [],
  };
}

/** Fetch global settings once. Realtime was removed — it crashed when many pages subscribed. */
export function subscribeToGlobalSettings(
  onData: (settings: GlobalSettings | null) => void,
  onError?: (error: Error) => void,
) {
  void fetchGlobalSettings().then(onData).catch(onError);
  return () => undefined;
}

export async function updateDefaultCategories(
  userId: string,
  newList: DefaultCategory[],
) {
  await throwIfError(
    client()
      .from("global_settings")
      .update({ default_categories: newList })
      .eq("id", "app"),
  );
}

export async function bootstrapGlobalSettingsIfMissing() {
  return;
}
