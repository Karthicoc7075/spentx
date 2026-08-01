"use client";

import {
  AlertTriangle,
  Banknote,
  Bot,
  ChevronLeft,
  ChevronRight,
  Database,
  DatabaseBackup,
  Eye,
  FileText,
  Landmark,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  PiggyBank,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  Share2,
  Smartphone,
  Trash2,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminBackupsPage } from "@/components/admin/AdminBackupsPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminCountTable,
  adminDeleteRow,
  adminListTable,
  adminListUsers,
  adminLogAction,
  adminUpdateRow,
  fetchAdminTableMeta,
  type AdminRow,
  type AdminTableMeta,
} from "@/lib/admin-api";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { AdminResetAllModal } from "@/components/admin/AdminResetAllModal";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;

// Sidebar grouping — every table in the RPC allow-list appears exactly once.
const tableGroups: Array<{ label: string; tables: string[] }> = [
  { label: "Core", tables: ["users", "accounts", "purposes", "categories", "contributors"] },
  { label: "Transactions", tables: ["transactions", "transaction_splits"] },
  { label: "Planning", tables: ["monthly_plans", "budget_templates", "smart_views"] },
  { label: "Social", tables: ["friends", "outings", "outing_expenses", "settlements"] },
  { label: "Sharing", tables: ["purpose_shares", "share_links", "share_access_logs"] },
  {
    label: "Wealth & Growth",
    tables: [
      "income_streams",
      "income_targets",
      "savings_goals",
      "projector_settings",
      "reflections",
      "smart_alerts",
    ],
  },
  { label: "AI", tables: ["ai_chat_messages", "ai_insights"] },
  { label: "SMS Rules", tables: ["sms_template_rules", "sms_detection_rules", "sms_block_rules"] },
  {
    label: "Logs",
    tables: [
      "audit_logs",
      "activity_logs",
      "backup_history",
      "account_balance_history",
      "admin_action_logs",
    ],
  },
  { label: "Config", tables: ["global_settings", "mail_templates"] },
];

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Card presentation config. Curated field subsets per table (same principle
// as the Transactions list: scannable summary on the card, full detail on
// View); every uncurated table gets a sensible generic fallback. This is
// presentation only — data still comes from admin_list_table unchanged.
// ---------------------------------------------------------------------------

type BadgeTone = "success" | "danger" | "amber" | "info" | "muted";

const badgeToneClass: Record<BadgeTone, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

type CardBadge = { label: string; tone: BadgeTone };

type CardConfig = {
  icon: LucideIcon;
  /** Ordered candidates for the card title; first present+non-empty wins. */
  titleKeys: string[];
  subtitleKeys: string[];
  /** Curated key/value fields (only rendered when present on the row). */
  fields: string[];
  badges?: (row: AdminRow) => CardBadge[];
};

const AMOUNT_KEYS = new Set([
  "amount",
  "total_amount",
  "opening_balance",
  "total_spent",
  "target_amount",
  "current_amount",
  "monthly_amount",
  "default_monthly_budget",
]);

function isDateKey(key: string) {
  return /(_at|_date|date)$/.test(key);
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (AMOUNT_KEYS.has(key) && !Number.isNaN(Number(value))) {
    return formatCurrency(Number(value));
  }
  if (isDateKey(key)) {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  return String(value);
}

function statusBadge(row: AdminRow): CardBadge[] {
  const status = row.status;
  if (typeof status !== "string" || !status) return [];
  const tone: BadgeTone = ["success", "completed", "active", "settled"].includes(status)
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "pending"
        ? "amber"
        : "muted";
  return [{ label: status, tone }];
}

const cardConfigs: Record<string, CardConfig> = {
  users: {
    icon: User,
    titleKeys: ["name"],
    subtitleKeys: ["email"],
    fields: ["role", "joined_at", "phone", "theme"],
    badges: (row) => [
      row.role === "admin"
        ? { label: "admin", tone: "amber" }
        : { label: "user", tone: "muted" },
    ],
  },
  accounts: {
    icon: Landmark,
    titleKeys: ["name"],
    subtitleKeys: ["type"],
    fields: ["opening_balance", "last4", "is_active", "created_at"],
    badges: (row) =>
      row.is_default ? [{ label: "default", tone: "info" }] : [],
  },
  transactions: {
    icon: ReceiptText,
    titleKeys: ["merchant"],
    subtitleKeys: ["description", "note"],
    fields: ["total_amount", "transaction_date", "payment_method", "account_id"],
    badges: (row) => [
      row.type === "income"
        ? { label: `+ ${formatFieldValue("total_amount", row.total_amount)}`, tone: "success" }
        : { label: `− ${formatFieldValue("total_amount", row.total_amount)}`, tone: "danger" },
      ...statusBadge(row),
    ],
  },
  transaction_splits: {
    icon: Layers,
    titleKeys: ["category_id"],
    subtitleKeys: ["transaction_id"],
    fields: ["amount", "purpose_id", "contributor_id"],
  },
  outings: {
    icon: MapPin,
    titleKeys: ["title", "name"],
    subtitleKeys: ["location"],
    fields: ["start_date", "end_date", "total_spent", "created_at"],
    badges: statusBadge,
  },
  friends: {
    icon: Users,
    titleKeys: ["name"],
    subtitleKeys: ["email"],
    fields: ["phone", "created_at"],
  },
  purpose_shares: {
    icon: Share2,
    titleKeys: ["viewer_email", "invited_email"],
    subtitleKeys: ["purpose_id"],
    fields: ["role", "last_viewed_at", "created_at"],
    badges: statusBadge,
  },
  backup_history: {
    icon: DatabaseBackup,
    titleKeys: ["type"],
    subtitleKeys: ["user_id"],
    fields: ["created_at", "frequency", "size_bytes", "error_message"],
    badges: statusBadge,
  },
  purposes: {
    icon: PiggyBank,
    titleKeys: ["name"],
    subtitleKeys: [],
    fields: ["color", "is_active", "is_default", "created_at"],
  },
  categories: {
    icon: Layers,
    titleKeys: ["name"],
    subtitleKeys: ["type"],
    fields: ["color", "is_investment", "created_at"],
  },
  contributors: {
    icon: Users,
    titleKeys: ["name"],
    subtitleKeys: ["email"],
    fields: ["created_at"],
  },
  monthly_plans: {
    icon: FileText,
    titleKeys: ["title", "month_key"],
    subtitleKeys: ["user_id"],
    fields: ["month_key", "created_at", "updated_at"],
  },
  share_links: {
    icon: Share2,
    titleKeys: ["token"],
    subtitleKeys: ["owner_id"],
    fields: ["purpose_id", "expires_at", "total_views", "last_viewed_at"],
  },
  admin_action_logs: {
    icon: ScrollText,
    titleKeys: ["action"],
    subtitleKeys: ["table_name"],
    fields: ["record_id", "admin_id", "target_user_id", "created_at"],
  },
  ai_chat_messages: {
    icon: Bot,
    titleKeys: ["role"],
    subtitleKeys: ["user_id"],
    fields: ["content", "created_at"],
  },
  sms_template_rules: {
    icon: Smartphone,
    titleKeys: ["bank_name"],
    subtitleKeys: ["type"],
    fields: ["mode", "template_pattern", "created_at"],
  },
  global_settings: {
    icon: Settings,
    titleKeys: ["app_name"],
    subtitleKeys: ["id"],
    fields: ["app_version", "maintenance_mode", "default_monthly_budget", "max_category_limit"],
  },
  mail_templates: {
    icon: FileText,
    titleKeys: ["id"],
    subtitleKeys: ["subject"],
    fields: ["updated_at"],
  },
};

// Icon fallback per sidebar group, so uncurated tables still get a
// sensible glyph rather than a generic database icon everywhere.
const groupIconFallback: Record<string, LucideIcon> = {
  Core: User,
  Transactions: ReceiptText,
  Planning: FileText,
  Social: Users,
  Sharing: Share2,
  "Wealth & Growth": Banknote,
  AI: Bot,
  "SMS Rules": Smartphone,
  Logs: ScrollText,
  Config: Settings,
};

const HIDDEN_GENERIC_KEYS = /(^id$|_id$|^token$|^schema_version$|^updated_at$)/;
const TITLE_CANDIDATES = ["name", "title", "merchant", "email", "label", "subject", "action", "type"];

function getCardConfig(table: string): CardConfig {
  const curated = cardConfigs[table];
  if (curated) return curated;
  const group = tableGroups.find((g) => g.tables.includes(table));
  return {
    icon: (group && groupIconFallback[group.label]) ?? Database,
    titleKeys: TITLE_CANDIDATES,
    subtitleKeys: ["user_id", "owner_id"],
    // Generic fallback: first 4-6 useful-looking columns, resolved per row
    // at render time (empty list = derive from row).
    fields: [],
  };
}

function resolveTitle(config: CardConfig, row: AdminRow, pk: string): string {
  for (const key of config.titleKeys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return String(row[pk] ?? "row");
}

function resolveSubtitle(config: CardConfig, row: AdminRow): string | null {
  for (const key of config.subtitleKeys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function resolveFields(config: CardConfig, row: AdminRow, pk: string): string[] {
  if (config.fields.length) {
    return config.fields.filter((key) => key in row);
  }
  return Object.keys(row)
    .filter(
      (key) =>
        key !== pk &&
        !HIDDEN_GENERIC_KEYS.test(key) &&
        !config.titleKeys.includes(key),
    )
    .slice(0, 6);
}

export function AdminDatabasePage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [dbMode, setDbMode] = useState<"explorer" | "backups">("explorer");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [filterInput, setFilterInput] = useState("");
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<AdminRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string | boolean>>({});
  const [pendingUpdate, setPendingUpdate] = useState<Record<string, unknown> | null>(null);
  const [updateConfirmText, setUpdateConfirmText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  // One view_table log per table-open in this session — the log records the
  // intent to browse a table, not every pagination click within it.
  const loggedTablesRef = useRef<Set<string>>(new Set());

  const { data: tableMeta } = useQuery({
    queryKey: ["admin-table-meta"],
    queryFn: fetchAdminTableMeta,
  });

  const metaByTable = useMemo(() => {
    const map = new Map<string, AdminTableMeta>();
    (tableMeta ?? []).forEach((meta) => map.set(meta.table, meta));
    return map;
  }, [tableMeta]);

  const selectedMeta = selectedTable ? metaByTable.get(selectedTable) : undefined;

  const { data: rows, isLoading: rowsLoading } = useQuery({
    queryKey: ["admin-table-rows", selectedTable, page, orderDir, filterUser],
    queryFn: () =>
      adminListTable({
        table: selectedTable!,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderDir,
        filterUser,
      }),
    enabled: Boolean(selectedTable),
  });

  const { data: totalCount } = useQuery({
    queryKey: ["admin-table-count", selectedTable, filterUser],
    queryFn: () => adminCountTable(selectedTable!, filterUser),
    enabled: Boolean(selectedTable),
  });

  useEffect(() => {
    if (!selectedTable) return;
    if (loggedTablesRef.current.has(selectedTable)) return;
    loggedTablesRef.current.add(selectedTable);
    adminLogAction({ action: "view_table", table: selectedTable }).catch(() => {
      // Logging failures shouldn't break browsing, but shouldn't go silent
      // in dev either.
      console.error(`Failed to log view_table for ${selectedTable}`);
    });
  }, [selectedTable]);

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    setPage(0);
    setViewRow(null);
    setFilterInput("");
    setFilterUser(null);
  };

  const handleApplyFilter = async () => {
    const value = filterInput.trim();
    if (!value) {
      setFilterUser(null);
      setPage(0);
      return;
    }
    if (value.includes("@")) {
      // Email → user id lookup, so "show me everything for this user" works
      // without hunting for the uuid first.
      try {
        const matches = await adminListUsers({ search: value, limit: 1 });
        if (!matches.length) {
          notify({ title: "No user found", description: `No user matches "${value}".` });
          return;
        }
        setFilterUser(matches[0].id);
      } catch (error) {
        notify({
          title: "Lookup failed",
          description: error instanceof Error ? error.message : "Could not look up user.",
        });
        return;
      }
    } else {
      setFilterUser(value);
    }
    setPage(0);
  };

  const rowId = (row: AdminRow): string => {
    const pk = selectedMeta?.pk ?? "id";
    return String(row[pk] ?? "");
  };

  // "users" is updatable (fix a name/role) even though it isn't deletable
  // through the generic RPC — deletion goes through the service-role route.
  const isUpdatable = Boolean(
    selectedMeta && (selectedMeta.deletable || selectedMeta.table === "users"),
  );

  const closePanel = () => {
    setViewRow(null);
    setEditMode(false);
    setEditValues({});
  };

  const beginEdit = (row?: AdminRow) => {
    const target = row ?? viewRow;
    if (!target) return;
    if (row) setViewRow(row);
    const pk = selectedMeta?.pk ?? "id";
    const initial: Record<string, string | boolean> = {};
    Object.entries(target).forEach(([key, value]) => {
      if (key === pk) return;
      if (typeof value === "boolean") initial[key] = value;
      else if (value !== null && typeof value === "object")
        initial[key] = JSON.stringify(value, null, 2);
      else initial[key] = value === null || value === undefined ? "" : String(value);
    });
    setEditValues(initial);
    setEditMode(true);
  };

  // Diff-only: send just the changed fields, so both the update and its
  // audit entry stay minimal and readable.
  const buildDiff = (): Record<string, unknown> | null => {
    if (!viewRow) return null;
    const diff: Record<string, unknown> = {};
    for (const [key, edited] of Object.entries(editValues)) {
      const original = viewRow[key];
      if (typeof edited === "boolean") {
        if (edited !== Boolean(original)) diff[key] = edited;
        continue;
      }
      if (original !== null && typeof original === "object") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(edited);
        } catch {
          throw new Error(`"${key}" is not valid JSON.`);
        }
        if (JSON.stringify(parsed) !== JSON.stringify(original)) diff[key] = parsed;
        continue;
      }
      const originalText = original === null || original === undefined ? "" : String(original);
      if (edited !== originalText) diff[key] = edited === "" ? null : edited;
    }
    return diff;
  };

  const handleSaveEdit = () => {
    try {
      const diff = buildDiff();
      if (!diff || !Object.keys(diff).length) {
        notify({ title: "No changes", description: "Nothing was modified." });
        return;
      }
      setPendingUpdate(diff);
      setUpdateConfirmText("");
    } catch (error) {
      notify({
        title: "Invalid value",
        description: error instanceof Error ? error.message : "Check your input.",
      });
    }
  };

  const handleConfirmUpdate = async () => {
    if (!pendingUpdate || !viewRow || !selectedTable) return;
    setIsUpdating(true);
    try {
      await adminUpdateRow(selectedTable, rowId(viewRow), pendingUpdate);
      notify({
        title: "Row updated",
        description: `Updated ${Object.keys(pendingUpdate).join(", ")} on ${selectedTable}. Logged with a before-image.`,
      });
      setPendingUpdate(null);
      closePanel();
      queryClient.invalidateQueries({ queryKey: ["admin-table-rows"] });
    } catch (error) {
      notify({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Could not update the row.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !selectedTable) return;
    setIsDeleting(true);
    try {
      await adminDeleteRow(selectedTable, rowId(pendingDelete));
      notify({
        title: "Row deleted",
        description: `Removed row ${rowId(pendingDelete)} from ${selectedTable}. Logged to the admin action log.`,
      });
      setPendingDelete(null);
      setDeleteConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["admin-table-rows"] });
      queryClient.invalidateQueries({ queryKey: ["admin-table-count"] });
    } catch (error) {
      notify({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete the row.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Mode Sub-Tabs */}
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card/40 p-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setDbMode("explorer")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
            dbMode === "explorer"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <Database className="size-3.5" />
          <span>Live Table Explorer</span>
        </button>
        <button
          type="button"
          onClick={() => setDbMode("backups")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
            dbMode === "backups"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <DatabaseBackup className="size-3.5" />
          <span>Backup Oversights & Archives</span>
        </button>
      </div>

      {dbMode === "backups" ? (
        <AdminBackupsPage />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* Table list sidebar */}
          <aside className="w-full shrink-0 space-y-4 lg:w-56">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setResetModalOpen(true)}
          className="w-full gap-2 text-xs font-semibold"
        >
          <Trash2 className="size-3.5" />
          Reset All Data
        </Button>

        <div className="grid gap-4">
          {tableGroups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="grid gap-0.5">
                {group.tables.map((table) => {
                  const meta = metaByTable.get(table);
                  return (
                    <button
                      key={table}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        selectedTable === table &&
                          "bg-muted font-semibold text-foreground",
                      )}
                      type="button"
                      onClick={() => handleSelectTable(table)}
                    >
                      <span className="truncate">{table}</span>
                      {meta && !meta.deletable ? (
                        <Lock className="ml-auto size-3 shrink-0 opacity-60" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <div className="min-w-0">
        {!selectedTable ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            Select a table to browse its rows.
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">{selectedTable}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {totalCount ?? "…"} rows
              </span>
              {selectedMeta && !selectedMeta.deletable ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <Lock className="size-3" /> read-only (append-only or protected)
                </span>
              ) : null}
              <Button
                className="ml-auto h-8 text-xs"
                size="sm"
                variant="outline"
                onClick={() => setOrderDir((d) => (d === "desc" ? "asc" : "desc"))}
              >
                {orderDir === "desc" ? "Newest first" : "Oldest first"}
              </Button>
            </div>

            {selectedMeta?.userCol ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 text-xs"
                    placeholder="Filter by user id or email…"
                    value={filterInput}
                    onChange={(event) => setFilterInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleApplyFilter();
                    }}
                  />
                </div>
                <Button className="h-9 text-xs" variant="outline" onClick={handleApplyFilter}>
                  Apply
                </Button>
                {filterUser ? (
                  <Button
                    className="h-9 text-xs"
                    variant="ghost"
                    onClick={() => {
                      setFilterUser(null);
                      setFilterInput("");
                      setPage(0);
                    }}
                  >
                    <X className="size-3.5" /> Clear
                  </Button>
                ) : null}
              </div>
            ) : null}

            {rowsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-2xl" />
                ))}
              </div>
            ) : !rows?.length ? (
              <EmptyState
                description={
                  filterUser
                    ? "No rows match this user filter. Clear it to browse the whole table."
                    : "Rows will appear here as users generate data."
                }
                icon={Database}
                title="No rows in this table yet"
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((row, index) => {
                  const config = getCardConfig(selectedTable);
                  const pk = selectedMeta?.pk ?? "id";
                  const CardIcon = config.icon;
                  const title = resolveTitle(config, row, pk);
                  const subtitle = resolveSubtitle(config, row);
                  const fields = resolveFields(config, row, pk);
                  const badges = config.badges?.(row) ?? statusBadge(row);
                  return (
                    <div
                      key={rowId(row) || index}
                      className="group flex flex-col rounded-2xl border border-border/80 bg-card/60 p-4 shadow-xs transition-all hover:border-primary/50 hover:shadow-md dark:bg-card/40 backdrop-blur-sm"
                    >
                      {/* Header: table-type icon + title/subtitle */}
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold ring-1 ring-primary/20 shadow-2xs group-hover:scale-105 transition-transform">
                          <CardIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground" title={title}>
                            {title}
                          </p>
                          {subtitle ? (
                            <p
                              className="truncate text-[11px] font-mono text-muted-foreground mt-0.5"
                              title={subtitle}
                            >
                              {subtitle}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Curated key/value grid */}
                      {fields.length ? (
                        <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
                          {fields.map((key) => (
                            <div key={key} className="min-w-0">
                              <dt className="truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                                {key.replaceAll("_", " ")}
                              </dt>
                              <dd
                                className="truncate text-xs font-mono font-semibold text-foreground mt-0.5"
                                title={formatCell(row[key])}
                              >
                                {formatFieldValue(key, row[key])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                      {/* Badges */}
                      {badges.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {badges.map((badge, badgeIndex) => (
                            <span
                              key={badgeIndex}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-[10px] font-bold border shadow-2xs",
                                badgeToneClass[badge.tone],
                              )}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="mt-auto pt-3">
                        <div className="flex items-center gap-1.5 border-t border-border/60 pt-3">
                          <Button
                            aria-label="View row"
                            className="h-8 text-xs font-semibold rounded-xl"
                            size="sm"
                            variant="outline"
                            onClick={() => setViewRow(row)}
                          >
                            <Eye className="mr-1 size-3.5" /> View
                          </Button>
                          {isUpdatable ? (
                            <Button
                              aria-label="Edit row"
                              className="h-8 text-xs font-semibold rounded-xl"
                              size="sm"
                              variant="outline"
                              onClick={() => beginEdit(row)}
                            >
                              <Pencil className="mr-1 size-3.5" /> Edit
                            </Button>
                          ) : null}
                          {selectedMeta?.deletable ? (
                            <Button
                              aria-label="Delete row"
                              className="ml-auto h-8 text-xs font-bold rounded-xl text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 border border-transparent hover:border-rose-500/20"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPendingDelete(row);
                                setDeleteConfirmText("");
                              }}
                            >
                              <Trash2 className="mr-1 size-3.5" /> Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  disabled={page === 0}
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  disabled={page + 1 >= totalPages}
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row side panel: JSON view + audited edit mode */}
      {viewRow ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={closePanel}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-background p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="min-w-0 truncate text-sm font-bold">
                {selectedTable} · {rowId(viewRow)}
              </h3>
              <div className="flex shrink-0 gap-1">
                {isUpdatable && !editMode ? (
                  <Button className="h-8 text-xs" size="sm" variant="outline" onClick={() => beginEdit()}>
                    <Pencil className="mr-1 size-3.5" /> Edit
                  </Button>
                ) : null}
                <Button size="icon-sm" variant="ghost" onClick={closePanel}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {!editMode ? (
              <pre className="overflow-x-auto rounded-xl bg-muted p-4 text-[11px] leading-relaxed">
                {JSON.stringify(viewRow, null, 2)}
              </pre>
            ) : (
              <div className="grid gap-3">
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  You are editing a real user&apos;s data. Only changed fields
                  are saved, and the change is logged with a before-image.
                </p>
                {Object.entries(editValues).map(([key, value]) => {
                  const original = viewRow[key];
                  const isJson = original !== null && typeof original === "object";
                  return (
                    <div key={key} className="grid gap-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        {key}
                      </label>
                      {typeof value === "boolean" ? (
                        <Switch
                          checked={value}
                          onCheckedChange={(checked) =>
                            setEditValues((current) => ({ ...current, [key]: checked }))
                          }
                        />
                      ) : isJson ? (
                        <Textarea
                          className="min-h-24 font-mono text-[11px]"
                          value={value}
                          onChange={(event) =>
                            setEditValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <Input
                          className="h-9 text-xs"
                          value={value}
                          onChange={(event) =>
                            setEditValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button
                    className="h-9 flex-1 text-xs font-bold"
                    variant="outline"
                    onClick={() => {
                      setEditMode(false);
                      setEditValues({});
                    }}
                  >
                    Cancel
                  </Button>
                  <Button className="h-9 flex-1 text-xs font-bold" onClick={handleSaveEdit}>
                    Save changes…
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Update confirm — same strong pattern as delete */}
      {pendingUpdate && viewRow && selectedTable ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="sx-surface w-full max-w-sm space-y-4 p-6 text-center">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <AlertTriangle className="size-6" />
              </span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">
                Update a real user&apos;s data?
              </h3>
              <p className="text-xs leading-normal text-muted-foreground">
                You are changing{" "}
                <span className="font-extrabold text-foreground">
                  {Object.keys(pendingUpdate).join(", ")}
                </span>{" "}
                on row{" "}
                <span className="font-extrabold text-foreground">{rowId(viewRow)}</span> of{" "}
                <span className="font-extrabold text-foreground">{selectedTable}</span>.
                This is NOT your own data. The previous values are preserved in
                the admin action log.
              </p>
              <p className="text-xs leading-normal text-muted-foreground">
                Type <span className="font-extrabold text-foreground">UPDATE</span> to confirm.
              </p>
            </div>
            <Input
              autoFocus
              className="text-center"
              placeholder="UPDATE"
              value={updateConfirmText}
              onChange={(event) => setUpdateConfirmText(event.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <Button
                className="h-10 flex-1 text-xs font-bold"
                disabled={isUpdating}
                variant="outline"
                onClick={() => setPendingUpdate(null)}
              >
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 bg-amber-500 text-xs font-bold text-white hover:bg-amber-600"
                disabled={updateConfirmText !== "UPDATE" || isUpdating}
                onClick={handleConfirmUpdate}
              >
                {isUpdating ? <Loader2 className="size-4 animate-spin" /> : "Apply update"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Destructive confirm — mirrors the existing typed-confirm pattern */}
      {pendingDelete && selectedTable ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="sx-surface w-full max-w-sm space-y-4 p-6 text-center">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertTriangle className="size-6" />
              </span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">
                Delete a real user&apos;s data?
              </h3>
              <p className="text-xs leading-normal text-muted-foreground">
                You are about to permanently delete row{" "}
                <span className="font-extrabold text-foreground">{rowId(pendingDelete)}</span>{" "}
                from <span className="font-extrabold text-foreground">{selectedTable}</span>.
                This is NOT your own data — it belongs to a real user, and this
                cannot be undone. A before-image will be written to the admin
                action log.
              </p>
              <p className="text-xs leading-normal text-muted-foreground">
                Type <span className="font-extrabold text-foreground">DELETE</span> to confirm.
              </p>
            </div>
            <Input
              autoFocus
              className="text-center"
              placeholder="DELETE"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <Button
                className="h-10 flex-1 text-xs font-bold"
                disabled={isDeleting}
                variant="outline"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 bg-rose-500 text-xs font-bold text-white hover:bg-rose-600"
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminResetAllModal
        open={resetModalOpen}
        onOpenChange={setResetModalOpen}
      />
        </div>
      )}
    </div>
  );
}
