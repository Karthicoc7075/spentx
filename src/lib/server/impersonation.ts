// Server-side impersonation support for the transparent proxy.
//
// Principle (same as the no-login share RPCs and the admin allow-lists):
// the caller NEVER supplies the effective scope. The proxy validates the
// impersonation session, then forces the session's target_user_id into
// every query it forwards — reads get an injected owner filter, writes get
// their owner column overwritten server-side. The admin's own identity is
// never the effective identity of an impersonated call.
import { createAdminClient } from "@/lib/supabase/admin";

export type ImpersonationSession = {
  id: string;
  adminId: string;
  targetUserId: string;
  /** 'read' (default) blocks every write; 'write' was started with a reason. */
  mode: "read" | "write";
};

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
// Short, so a session ended from another server instance stops working fast.
const CACHE_TTL_MS = 5 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

type CachedSession = {
  session: ImpersonationSession | null;
  cachedAt: number;
  lastTouchedAt: number;
};

const sessionCache = new Map<string, CachedSession>();

// Validates that the session exists, belongs to the calling admin, hasn't
// been ended, and hasn't gone inactive for 30+ minutes (a never-ended
// session must not allow action forever — stale tabs get rejected).
export async function validateImpersonationSession(
  sessionId: string,
  adminId: string,
): Promise<ImpersonationSession | null> {
  const cacheKey = `${sessionId}:${adminId}`;
  const cached = sessionCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    if (cached.session && now - cached.lastTouchedAt > TOUCH_INTERVAL_MS) {
      cached.lastTouchedAt = now;
      void touchSession(sessionId);
    }
    return cached.session;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_impersonation_sessions")
      .select("id, admin_id, target_user_id, ended_at, last_active_at, mode")
      .eq("id", sessionId)
      .maybeSingle();

    let session: ImpersonationSession | null = null;
    if (
      data &&
      data.admin_id === adminId &&
      data.ended_at === null &&
      data.target_user_id !== null &&
      now - new Date(data.last_active_at as string).getTime() < INACTIVITY_LIMIT_MS
    ) {
      session = {
        id: data.id as string,
        adminId: data.admin_id as string,
        targetUserId: data.target_user_id as string,
        mode: data.mode === "write" ? "write" : "read",
      };
    } else if (
      data &&
      data.admin_id === adminId &&
      data.ended_at === null
    ) {
      // Either inactive too long, or the target user was deleted mid-session
      // (target_user_id goes null via the FK's ON DELETE SET NULL) — either
      // way, end it server-side so it can't be revived or used with a null
      // target injected into a service-role-backed query.
      void admin
        .from("admin_impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(() => undefined);
    }

    sessionCache.set(cacheKey, { session, cachedAt: now, lastTouchedAt: now });
    if (session) void touchSession(sessionId);
    return session;
  } catch {
    return null;
  }
}

async function touchSession(sessionId: string): Promise<void> {
  try {
    await createAdminClient()
      .from("admin_impersonation_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("ended_at", null);
  } catch {
    // best-effort
  }
}

export function invalidateSessionCache(sessionId: string): void {
  for (const key of sessionCache.keys()) {
    if (key.startsWith(`${sessionId}:`)) sessionCache.delete(key);
  }
}

// --- Table scope classification -------------------------------------------

// Per-user tables and the column that owns the row.
const OWNER_COLUMNS: Record<string, string> = {
  users: "id",
  accounts: "user_id",
  purposes: "user_id",
  categories: "user_id",
  contributors: "user_id",
  transactions: "user_id",
  transaction_splits: "user_id",
  monthly_plans: "user_id",
  budget_templates: "user_id",
  smart_views: "user_id",
  friends: "user_id",
  outings: "user_id",
  outing_expenses: "user_id",
  settlements: "user_id",
  purpose_shares: "owner_id",
  share_links: "owner_id",
  backup_history: "user_id",
  account_balance_history: "user_id",
  reflections: "user_id",
  smart_alerts: "user_id",
  income_streams: "user_id",
  income_targets: "user_id",
  savings_goals: "user_id",
  projector_settings: "user_id",
  ai_chat_messages: "user_id",
  ai_insights: "user_id",
  // Newer per-user tables used by Friends / Outings / Wealth / Transactions.
  account_purposes: "user_id",
  transaction_items: "user_id",
  friend_splits: "user_id",
  friend_settlements: "user_id",
  outing_categories: "user_id",
  investments: "user_id",
  goal_contributions: "user_id",
  net_worth_history: "user_id",
  recurring_bills: "user_id",
  user_merchants: "user_id",
  user_merchant_category: "user_id",
  user_devices: "user_id",
  login_history: "user_id",
  share_invite_deliveries: "owner_id",
};

// Shared config: readable during impersonation, never writable through it.
const GLOBAL_READ_ONLY = new Set([
  "global_settings",
  "mail_templates",
  "sms_template_rules",
  "sms_detection_rules",
  "sms_block_rules",
  // Merchant/category rules (20261011_merchant_category_rules.sql)
  "category_catalog",
  "merchant_brands",
  "merchant_brand_keys",
  "merchant_keyword_rules",
  "mcc_category_map",
  "rules_version",
]);

// Per-user but append-only history — readable (scoped), not writable
// through an impersonation session.
const SCOPED_READ_ONLY = new Set([
  "audit_logs",
  "activity_logs",
  "share_access_logs",
  "backup_history",
  "account_balance_history",
  "login_history",
  "user_devices",
  "share_invite_deliveries",
  // Writes go through add_goal_contribution (direct DML is revoked).
  "goal_contributions",
]);

// Never reachable during impersonation, in any direction.
const BLOCKED = new Set([
  "admin_action_logs",
  "user_api_logs",
  "admin_impersonation_sessions",
]);

export type TableScopeDecision =
  | { kind: "blocked"; reason: string }
  | { kind: "global_read_only" }
  | { kind: "scoped"; ownerColumn: string; readOnly: boolean };

export function classifyImpersonatedTable(table: string): TableScopeDecision {
  if (BLOCKED.has(table)) {
    return { kind: "blocked", reason: `table ${table} is not accessible during impersonation` };
  }
  if (GLOBAL_READ_ONLY.has(table)) return { kind: "global_read_only" };
  const ownerColumn = OWNER_COLUMNS[table] ?? (SCOPED_READ_ONLY.has(table) ? "user_id" : null);
  if (!ownerColumn) {
    return { kind: "blocked", reason: `table ${table} has no impersonation scope mapping` };
  }
  return { kind: "scoped", ownerColumn, readOnly: SCOPED_READ_ONLY.has(table) };
}

// --- Audit trail for impersonated mutations --------------------------------

/**
 * Names of tables embedded in a PostgREST `select` (e.g.
 * `*,transaction_splits(*),owner:users!fk(name)`), so the proxy can refuse
 * embeds of tables that are blocked or unscoped during impersonation.
 */
export function embeddedTables(select: string | null): string[] {
  if (!select) return [];
  const names: string[] = [];
  const pattern = /([A-Za-z0-9_]+)(?:![A-Za-z0-9_]+)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(select)) !== null) {
    names.push(match[1]);
  }
  return names;
}

export function isEmbeddableDuringImpersonation(table: string): boolean {
  return !BLOCKED.has(table);
}

export async function logImpersonatedMutation(params: {
  session: ImpersonationSession;
  action: "create" | "update" | "delete";
  table: string;
  before: unknown | null;
}): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from("admin_action_logs").insert({
      admin_id: params.session.adminId,
      action: params.action,
      table_name: params.table,
      record_id: null,
      before: params.before ?? null,
      target_user_id: params.session.targetUserId,
      impersonation_session_id: params.session.id,
    });
    if (error) {
      console.error("impersonation mutation log failed:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("impersonation mutation log failed:", error);
    return false;
  }
}
