// ============================================================================
// Admin portal data access. Everything here goes through the dedicated
// admin-only RPC layer (supabase/migrations/20260720_admin_portal.sql) —
// never through relaxed RLS. Each RPC re-checks require_admin() server-side,
// so these wrappers are safe to call optimistically; a non-admin gets a
// hard error, not data.
// ============================================================================
import { createClient } from "@/lib/supabase/client";

export type AdminTableMeta = {
  table: string;
  pk: string;
  userCol: string | null;
  deletable: boolean;
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
};

export type AdminUserOverview = {
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
    joinedAt: string;
    phone: string | null;
  } | null;
  txCount: number;
  totalSpend: number;
  totalIncome: number;
  monthSpend: number;
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
    netBalance: number;
  }>;
  recentTransactions: Array<{
    id: string;
    merchant: string;
    total_amount: number;
    type: string;
    transaction_date: string;
    status: string;
    outing_id?: string | null;
    outing_name?: string | null;
    purpose_name?: string | null;
    splits?: Array<{
      friendId: string | null;
      amount: number;
      isReturn: boolean;
      friendName: string | null;
    }> | null;
  }>;
  lastBackup: {
    created_at: string;
    status: string;
    type: string;
    size_bytes: number | null;
  } | null;
};

export type AdminActionLog = {
  id: string;
  admin_id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  before: AdminRow | null;
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

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
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
}): Promise<AdminRow[]> {
  return rpc<AdminRow[]>("admin_list_table", {
    p_table: params.table,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_order_by: params.orderBy ?? null,
    p_order_dir: params.orderDir ?? "desc",
    p_filter_user: params.filterUser ?? null,
  });
}

export async function adminCountTable(
  table: string,
  filterUser?: string | null,
): Promise<number> {
  return rpc<number>("admin_count_table", {
    p_table: table,
    p_filter_user: filterUser ?? null,
  });
}

export async function adminDeleteRow(table: string, id: string): Promise<void> {
  await rpc<void>("admin_delete_row", { p_table: table, p_id: id });
}

export async function adminLogAction(params: {
  action: "view_table" | "view_row" | "export" | "impersonate_view";
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
}): Promise<AdminActionLog[]> {
  return rpc<AdminActionLog[]>("admin_list_action_logs", {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_action: params.action ?? null,
    p_admin_id: params.adminId ?? null,
    p_target_user_id: params.targetUserId ?? null,
    p_impersonation_session_id: params.impersonationSessionId ?? null,
  });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return rpc<AdminOverview>("admin_get_overview");
}

export async function adminListUsers(params: {
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminUserRow[]> {
  return rpc<AdminUserRow[]>("admin_list_users", {
    p_search: params.search || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
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

export async function adminStartImpersonation(targetUserId: string): Promise<string> {
  return rpc<string>("admin_start_impersonation", { p_target_user_id: targetUserId });
}

export async function adminEndImpersonation(sessionId: string): Promise<void> {
  await rpc<void>("admin_end_impersonation", { p_session_id: sessionId });
}

// --- Admin-triggered password reset (service-role Route Handler) ----------

export async function adminResetPassword(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Reset failed (${response.status})`);
  }
}

// User deletion goes through the dedicated service-role Route Handler, not
// a generic RPC — deleting auth.users requires the service role key, which
// must never reach the browser.
export async function adminDeleteUser(userId: string): Promise<void> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Delete failed (${response.status})`);
  }
}
