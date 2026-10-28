// ============================================================================
// Admin portal data access. Everything here goes through the dedicated
// admin-only RPC layer (supabase/migrations/20260720_admin_portal.sql and
// 20261011_admin_fixes.sql) —
// never through relaxed RLS. Each RPC re-checks require_admin() server-side,
// so these wrappers are safe to call optimistically; a non-admin gets a
// hard error, not data.
// ============================================================================
import { createClient } from "@/lib/supabase/client";

export type AdminColumnMeta = {
  name: string;
  type: string;
  udt: string;
  nullable: boolean;
  hasDefault: boolean;
};

export type AdminTableMeta = {
  table: string;
  pk: string;
  userCol: string | null;
  deletable: boolean;
  updatable?: boolean;
  insertable?: boolean;
  /** true = admin delete sets deleted_at (restorable); false = hard delete */
  softDelete?: boolean;
  columns?: AdminColumnMeta[];
};

export type AdminRow = Record<string, unknown>;

export type AdminOverview = {
  totalUsers: number;
  newUsersWeek: number;
  newUsersMonth: number;
  totalTransactions: number;
  totalVolume: number;
  expenseVolume: number;
  incomeVolume: number;
  backupsLast7d: number;
  backupFailuresLast7d: number;
  activeUsers7d?: number;
  suspendedUsers?: number;
  apiErrors24h?: number;
  maintenanceMode: boolean;
  storage: Array<{ bucket: string; objects: number; bytes: number }>;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  txCount: number;
  monthSpend: number;
  totalSpend: number;
  emailConfirmed?: boolean;
  bannedUntil?: string | null;
  lastSignInAt?: string | null;
  lastSeenAt?: string | null;
};

export type AdminUserOverview = {
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
    joinedAt: string;
    phone: string | null;
    setupCompleted?: boolean | null;
    timezone?: string | null;
  } | null;
  auth?: {
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    bannedUntil: string | null;
    createdAt: string | null;
  } | null;
  txCount: number;
  unverifiedCount?: number;
  totalSpend: number;
  totalIncome: number;
  monthSpend: number;
  monthIncome?: number;
  spendByCategory: Array<{ categoryId: string; name: string; amount: number }>;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    last4: string | null;
    openingBalance: number;
    isActive: boolean;
    balance: number;
  }>;
  purposes: Array<{ id: string; name: string; color: string; isActive: boolean }>;
  outings?: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    totalAmount: number;
  }>;
  friends?: Array<{
    id: string;
    name: string;
    phone: string | null;
  }>;
  recentTransactions: Array<{
    id: string;
    merchant: string;
    total_amount: number;
    type: string;
    transaction_date: string;
    status: string;
    entry_source?: string | null;
    outing_id?: string | null;
    outing_name?: string | null;
    purpose_name?: string | null;
    account_name?: string | null;
    to_account_name?: string | null;
    splits?: Array<{
      amount: number;
      category: string | null;
      purpose: string | null;
      contributor: string | null;
    }> | null;
  }>;
  lastBackup: {
    created_at: string;
    status: string;
    type: string;
    size_bytes: number | null;
    error_message?: string | null;
  } | null;
  devices?: Array<{
    id: string;
    device_label: string | null;
    platform: string | null;
    user_agent: string | null;
    last_seen_at: string | null;
    created_at: string | null;
  }>;
  logins?: Array<{
    id: string;
    logged_in_at: string;
    platform: string | null;
    user_agent: string | null;
  }>;
  recentErrors?: Array<{
    id: string;
    created_at: string;
    api_type: string;
    api_name: string;
    method: string | null;
    status_code: number | null;
    error_message: string | null;
    platform: string | null;
    app_version: string | null;
  }>;
  sms?: { detected30d: number; lastDetectedAt: string | null; learnedMerchants: number };
  wealth?: { goals: number; investments: number };
};

export type AdminBalanceInputs = {
  outings: AdminRow[];
  outingExpenses: AdminRow[];
  settlements: AdminRow[];
  friendSplits: AdminRow[];
  friendSettlements: AdminRow[];
};

export type AdminMetrics = {
  days: number;
  series: Array<{
    date: string;
    signups: number;
    activeUsers: number;
    transactions: number;
    smsDetected: number;
    apiCalls: number;
    apiErrors: number;
  }>;
};

export type AdminActionLog = {
  id: string;
  admin_id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  before: AdminRow | null;
  after?: AdminRow | null;
  reason?: string | null;
  target_user_id: string | null;
  impersonation_session_id: string | null;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
  target_email: string | null;
  target_name: string | null;
};

function client() {
  return createClient();
}

/** Error carrying the PostgREST/Postgres code, so pages can tell "run the
 * migration" (42883 / PGRST202 / 42P01) apart from real failures. */
export class AdminApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
  }
}

export function isMissingMigrationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as AdminApiError).code;
  if (code && ["42883", "PGRST202", "42P01", "PGRST205", "PGRST204"].includes(code)) return true;
  return /does not exist|could not find the function|schema cache|run .*migration/i.test(error.message);
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new AdminApiError(error.message, error.code);
  return data as T;
}

async function postJson<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminApiError(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function fetchAdminTableMeta(): Promise<AdminTableMeta[]> {
  return rpc<AdminTableMeta[]>("admin_table_meta");
}

export async function adminListTable(params: {
  table: string;
  limit?: number;
  offset?: number;
  orderBy?: string | null;
  orderDir?: "asc" | "desc";
  filterUser?: string | null;
  search?: string | null;
}): Promise<AdminRow[]> {
  return rpc<AdminRow[]>("admin_list_table", {
    p_table: params.table,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_order_by: params.orderBy ?? null,
    p_order_dir: params.orderDir ?? "desc",
    p_filter_user: params.filterUser ?? null,
    p_search: params.search?.trim() || null,
  });
}

export async function adminCountTable(
  table: string,
  filterUser?: string | null,
  search?: string | null,
): Promise<number> {
  return rpc<number>("admin_count_table", {
    p_table: table,
    p_filter_user: filterUser ?? null,
    p_search: search?.trim() || null,
  });
}

/** Soft-deletes (sets deleted_at) when the table supports it, else hard-deletes. */
export async function adminDeleteRow(table: string, id: string): Promise<void> {
  await rpc<void>("admin_delete_row", { p_table: table, p_id: id });
}

export async function adminRestoreRow(table: string, id: string): Promise<void> {
  await rpc<void>("admin_restore_row", { p_table: table, p_id: id });
}

export async function adminLogAction(params: {
  action: "view_table" | "view_row" | "export";
  table?: string | null;
  recordId?: string | null;
  targetUserId?: string | null;
}): Promise<void> {
  await rpc<void>("admin_log_action", {
    p_action: params.action,
    p_table: params.table ?? null,
    p_record_id: params.recordId ?? null,
    p_target_user_id: params.targetUserId ?? null,
  });
}

export async function adminListActionLogs(params: {
  limit?: number;
  offset?: number;
  action?: string | null;
  adminId?: string | null;
  targetUserId?: string | null;
  impersonationSessionId?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<AdminActionLog[]> {
  return rpc<AdminActionLog[]>("admin_list_action_logs", {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_action: params.action ?? null,
    p_admin_id: params.adminId ?? null,
    p_target_user_id: params.targetUserId ?? null,
    p_impersonation_session_id: params.impersonationSessionId ?? null,
    p_search: params.search?.trim() || null,
    p_from: params.from || null,
    p_to: params.to || null,
  });
}

export async function adminCountActionLogs(params: {
  action?: string | null;
  adminId?: string | null;
  targetUserId?: string | null;
  impersonationSessionId?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<number> {
  return rpc<number>("admin_count_action_logs", {
    p_action: params.action ?? null,
    p_admin_id: params.adminId ?? null,
    p_target_user_id: params.targetUserId ?? null,
    p_impersonation_session_id: params.impersonationSessionId ?? null,
    p_search: params.search?.trim() || null,
    p_from: params.from || null,
    p_to: params.to || null,
  });
}

export async function fetchAdminMetrics(days = 30): Promise<AdminMetrics> {
  return rpc<AdminMetrics>("admin_get_metrics", { p_days: days });
}

export async function adminListBackups(params: {
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminRow[]> {
  return rpc<AdminRow[]>("admin_list_backups", {
    p_status: params.status || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
}

export async function adminCountBackups(status?: string | null): Promise<number> {
  return rpc<number>("admin_count_backups", { p_status: status || null });
}

export async function adminPurgeApiLogs(olderThanDays: number): Promise<number> {
  return rpc<number>("admin_purge_api_logs", { p_older_than_days: olderThanDays });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return rpc<AdminOverview>("admin_get_overview");
}

export type AdminUserSort = "joined_desc" | "joined_asc" | "name_asc" | "email_asc";

export async function adminListUsers(params: {
  search?: string | null;
  limit?: number;
  offset?: number;
  role?: string | null;
  sort?: AdminUserSort;
}): Promise<AdminUserRow[]> {
  return rpc<AdminUserRow[]>("admin_list_users", {
    p_search: params.search?.trim() || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_role: params.role || null,
    p_sort: params.sort ?? "joined_desc",
  });
}

export async function adminCountUsers(params: {
  search?: string | null;
  role?: string | null;
}): Promise<number> {
  return rpc<number>("admin_count_users", {
    p_search: params.search?.trim() || null,
    p_role: params.role || null,
  });
}

/** Exact lookup by email (case-insensitive) or user id. Never partial. */
export async function adminFindUser(query: string): Promise<string | null> {
  return rpc<string | null>("admin_find_user", { p_query: query });
}

export async function fetchAdminUserBalanceInputs(userId: string): Promise<AdminBalanceInputs> {
  return rpc<AdminBalanceInputs>("admin_get_user_balance_inputs", { p_user_id: userId });
}

export async function fetchAdminUserOverview(
  userId: string,
): Promise<AdminUserOverview> {
  return rpc<AdminUserOverview>("admin_get_user_overview", {
    p_user_id: userId,
  });
}

// --- Default categories CRUD (global_settings.default_categories) --------

export async function adminAddDefaultCategory(params: {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
}): Promise<void> {
  await rpc<void>("admin_add_default_category", {
    p_id: params.id,
    p_name: params.name,
    p_type: params.type,
    p_color: params.color,
    p_icon: params.icon,
  });
}

export async function adminUpdateDefaultCategory(params: {
  id: string;
  name: string;
  color: string;
  icon: string;
}): Promise<void> {
  await rpc<void>("admin_update_default_category", {
    p_id: params.id,
    p_name: params.name,
    p_color: params.color,
    p_icon: params.icon,
  });
}

export async function adminDeleteDefaultCategory(id: string): Promise<void> {
  await rpc<void>("admin_delete_default_category", { p_id: id });
}

// --- Default categories = category_catalog (admin RPCs, audited) ----------

/** Add or edit a catalog default (also re-activates a removed one). */
export async function adminUpsertCatalogCategory(params: {
  slug: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
}): Promise<void> {
  await rpc<void>("admin_upsert_category_catalog", {
    p_slug: params.slug,
    p_name: params.name,
    p_type: params.type,
    p_color: params.color,
    p_icon: params.icon,
  });
}

/** Remove (deactivate) or restore a catalog default. Never deletes the row. */
export async function adminSetCatalogCategoryActive(slug: string, active: boolean): Promise<void> {
  await rpc<void>("admin_set_category_catalog_active", { p_slug: slug, p_active: active });
}

// --- Generic audited row update ------------------------------------------

export async function adminUpdateRow(
  table: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<void> {
  await rpc<void>("admin_update_row", {
    p_table: table,
    p_id: id,
    p_updates: updates,
  });
}

// --- Universal API call logs (user_api_logs) ------------------------------

export type UserApiLog = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  actor_role: "user" | "admin" | "anonymous";
  api_type: string;
  api_name: string;
  method: string | null;
  status: "success" | "error";
  status_code: number | null;
  error_message: string | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  duration_ms: number | null;
  ip_address: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  platform?: string | null;
  user_agent: string | null;
  impersonated_by_admin_id: string | null;
  created_at: string;
};

export type ApiLogFilters = {
  from?: string | null;
  to?: string | null;
  emailSearch?: string | null;
  actorRole?: string | null;
  status?: string | null;
  apiType?: string | null;
};

export async function adminListApiLogs(
  filters: ApiLogFilters,
  limit = 50,
  offset = 0,
): Promise<UserApiLog[]> {
  return rpc<UserApiLog[]>("admin_list_api_logs", {
    p_limit: limit,
    p_offset: offset,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_email_search: filters.emailSearch || null,
    p_actor_role: filters.actorRole || null,
    p_status: filters.status || null,
    p_api_type: filters.apiType || null,
  });
}

export async function adminCountApiLogs(filters: ApiLogFilters): Promise<number> {
  return rpc<number>("admin_count_api_logs", {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_email_search: filters.emailSearch || null,
    p_actor_role: filters.actorRole || null,
    p_status: filters.status || null,
    p_api_type: filters.apiType || null,
  });
}

// --- Impersonation sessions -----------------------------------------------

export type ImpersonationMode = "read" | "write";

export async function adminStartImpersonation(
  targetUserId: string,
  mode: ImpersonationMode = "read",
  reason?: string | null,
): Promise<string> {
  return rpc<string>("admin_start_impersonation", {
    p_target_user_id: targetUserId,
    p_mode: mode,
    p_reason: reason?.trim() || null,
  });
}

/** Ends via the route so the proxy's session cache is cleared immediately. */
export async function adminEndImpersonation(sessionId: string): Promise<void> {
  try {
    await postJson("/api/impersonation/end", { sessionId });
  } catch {
    await rpc<void>("admin_end_impersonation", { p_session_id: sessionId });
  }
}

// --- Admin-triggered password reset (service-role Route Handler) ----------

export async function adminResetPassword(userId: string): Promise<void> {
  await postJson(`/api/admin/users/${userId}/reset-password`);
}

export async function adminResendVerification(userId: string): Promise<void> {
  await postJson(`/api/admin/users/${userId}/resend-verification`);
}

export async function adminForceVerifyEmail(userId: string): Promise<void> {
  await postJson(`/api/admin/users/${userId}/force-verify-email`);
}

export async function adminSetSuspended(
  userId: string,
  suspend: boolean,
  reason?: string,
): Promise<void> {
  await postJson(`/api/admin/users/${userId}/suspend`, { suspend, reason });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await postJson(`/api/admin/users/${userId}`, undefined, "DELETE");
}

export async function adminResetUserData(userId: string): Promise<void> {
  await postJson(`/api/admin/users/${userId}/reset-data`, {});
}

export async function adminResetAllUsersData(password: string): Promise<void> {
  await postJson(`/api/admin/reset-data-all`, {
    password: password.trim(),
    confirm: "RESET ALL USERS DATA",
  });
}

/** Audited insert through the admin_insert_row RPC (allow-listed tables only). */
export async function adminInsertRow(
  table: string,
  record: Record<string, unknown>,
): Promise<AdminRow> {
  return rpc<AdminRow>("admin_insert_row", { p_table: table, p_record: record });
}

// --- Merchant / category rules (20261011_merchant_category_rules.sql) -------

export type MerchantBrand = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  category_slug: string;
  subcategory?: string | null;
  confidence?: number;
  aliases: string[];
  upi_handles: string[];
  sms_patterns: string[];
  is_active: boolean;
  source: string | null;
  updated_at: string;
  keys_count?: number;
};

export type MerchantBrandKey = {
  key: string;
  key_type: "name" | "alias" | "upi";
  match_mode: "contains" | "prefix" | "exact";
  brand_id: string;
  merchant_brands?: {
    id: string;
    canonical_name: string;
    category_slug: string;
    confidence?: number;
  } | null;
};

export type MatchResult = {
  matched: boolean;
  stage: "upi_handle" | "brand_key" | "keyword_rule" | "none";
  brand?: {
    id: string;
    canonical_name: string;
    category_slug: string;
    confidence?: number;
  } | null;
  key?: {
    key: string;
    key_type: string;
    match_mode: string;
  } | null;
  keyword_rule?: {
    id: number;
    keyword: string;
    match_type: string;
    category_slug: string;
    priority: number;
  } | null;
  category: string;
  confidence: number;
  explanation: string;
};

export type KeywordRule = {
  id: number;
  keyword: string;
  match_type: "word" | "prefix" | "contains" | "regex";
  category_slug: string;
  subcategory?: string | null;
  priority: number;
  applies_to: "merchant" | "sms" | "vpa";
  direction: "any" | "debit" | "credit";
  note: string | null;
  is_active: boolean;
  updated_at: string;
};

export type CategoryCatalogEntry = { slug: string; display_name: string; is_active: boolean };

function tableError(error: { message: string; code?: string } | null) {
  return error ? new AdminApiError(error.message, error.code) : null;
}

export async function listCategoryCatalog(): Promise<CategoryCatalogEntry[]> {
  const { data, error } = await client()
    .from("category_catalog")
    .select("slug, display_name, is_active")
    .order("sort_order", { ascending: true });
  const err = tableError(error);
  if (err) throw err;
  return (data ?? []) as CategoryCatalogEntry[];
}

export async function listMerchantBrands(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: MerchantBrand[]; total: number }> {
  let query = client()
    .from("merchant_brands")
    .select("*, merchant_brand_keys(count)", { count: "exact" })
    .order("canonical_name", { ascending: true })
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  const term = params.search?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    // Also find brands whose keys match the search
    const { data: keyMatches } = await client()
      .from("merchant_brand_keys")
      .select("brand_id")
      .ilike("key", `%${safe}%`)
      .limit(100);

    const matchedBrandIds = Array.from(new Set((keyMatches ?? []).map((k: any) => k.brand_id).filter(Boolean)));
    if (matchedBrandIds.length > 0) {
      query = query.or(
        `canonical_name.ilike.%${safe}%,normalized_name.ilike.%${safe}%,category_slug.ilike.%${safe}%,id.in.(${matchedBrandIds.slice(0, 50).join(",")})`,
      );
    } else {
      query = query.or(
        `canonical_name.ilike.%${safe}%,normalized_name.ilike.%${safe}%,category_slug.ilike.%${safe}%`,
      );
    }
  }

  const { data, error, count } = await query;
  const err = tableError(error);
  if (err) throw err;

  const rows = (data ?? []).map((row: any) => ({
    ...row,
    keys_count: row.merchant_brand_keys?.[0]?.count ?? 0,
  })) as MerchantBrand[];

  return { rows, total: count ?? 0 };
}

export async function listMerchantBrandKeys(params: {
  search?: string;
  key_type?: string;
  match_mode?: string;
  brand_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: MerchantBrandKey[]; total: number }> {
  let query = client()
    .from("merchant_brand_keys")
    .select("key, key_type, match_mode, brand_id, merchant_brands(id, canonical_name, category_slug, confidence)", { count: "exact" })
    .order("key", { ascending: true })
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  if (params.brand_id) {
    query = query.eq("brand_id", params.brand_id);
  }
  if (params.key_type && params.key_type !== "all") {
    query = query.eq("key_type", params.key_type);
  }
  if (params.match_mode && params.match_mode !== "all") {
    query = query.eq("match_mode", params.match_mode);
  }
  const term = params.search?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.ilike("key", `%${safe}%`);
  }

  const { data, error, count } = await query;
  const err = tableError(error);
  if (err) throw err;
  return { rows: (data ?? []) as MerchantBrandKey[], total: count ?? 0 };
}

export async function listKeywordRules(params: {
  search?: string;
  category_slug?: string;
  match_type?: string;
  direction?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: KeywordRule[]; total: number }> {
  let query = client()
    .from("merchant_keyword_rules")
    .select("*", { count: "exact" })
    .order("priority", { ascending: false })
    .order("keyword", { ascending: true })
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  if (params.category_slug && params.category_slug !== "all") {
    query = query.eq("category_slug", params.category_slug);
  }
  if (params.match_type && params.match_type !== "all") {
    query = query.eq("match_type", params.match_type);
  }
  if (params.direction && params.direction !== "all") {
    query = query.eq("direction", params.direction);
  }

  const term = params.search?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(`keyword.ilike.%${safe}%,category_slug.ilike.%${safe}%`);
  }
  const { data, error, count } = await query;
  const err = tableError(error);
  if (err) throw err;
  return { rows: (data ?? []) as KeywordRule[], total: count ?? 0 };
}

export async function adminUpsertMerchantBrand(brand: Partial<MerchantBrand>): Promise<MerchantBrand> {
  return rpc<MerchantBrand>("admin_upsert_merchant_brand", { p_brand: brand });
}

export async function adminUpsertKeywordRule(rule: Partial<KeywordRule>): Promise<KeywordRule> {
  return rpc<KeywordRule>("admin_upsert_keyword_rule", { p_rule: rule });
}

export async function adminDeleteMerchantBrand(id: string): Promise<void> {
  await postJson(`/api/admin/merchant-rules?type=brand&id=${encodeURIComponent(id)}`, undefined, "DELETE");
}

export async function adminDeleteKeywordRule(id: string | number): Promise<void> {
  await postJson(`/api/admin/merchant-rules?type=keyword&id=${encodeURIComponent(String(id))}`, undefined, "DELETE");
}

export async function adminUpsertMerchantBrandKey(payload: {
  brand_id: string;
  key: string;
  key_type: "name" | "alias" | "upi";
  match_mode: "contains" | "prefix" | "exact";
  old_key?: string;
  old_key_type?: string;
}): Promise<void> {
  await postJson("/api/admin/merchant-rules", { action: "upsert_key", ...payload }, "POST");
}

export async function adminDeleteMerchantBrandKey(params: {
  brand_id: string;
  key: string;
  key_type: string;
}): Promise<void> {
  await postJson(
    `/api/admin/merchant-rules?type=key&brand_id=${encodeURIComponent(params.brand_id)}&key=${encodeURIComponent(params.key)}&key_type=${encodeURIComponent(params.key_type)}`,
    undefined,
    "DELETE",
  );
}

export async function adminTestMerchantMatch(text: string): Promise<MatchResult> {
  return postJson<MatchResult>("/api/admin/merchant-rules", { action: "test_match", text }, "POST");
}

