"use client";

import { Lock, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminAddRowModal } from "@/components/admin/AdminAddRowModal";
import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
  useDebouncedValue,
} from "@/components/admin/admin-ui";
import {
  adminCountTable,
  adminDeleteRow,
  adminFindUser,
  adminListTable,
  adminLogAction,
  adminRestoreRow,
  adminUpdateRow,
  fetchAdminTableMeta,
  type AdminRow,
  type AdminTableMeta,
} from "@/lib/admin-api";
import { formatIST } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;

// Sidebar grouping. Tables not listed here (or added later to the RPC
// allow-list) land in "Other" automatically; tables missing from the
// database are simply not shown (admin_table_meta skips them).
const GROUPS: Array<{ label: string; tables: string[] }> = [
  { label: "Core", tables: ["users", "accounts", "account_purposes", "purposes", "categories", "contributors"] },
  { label: "Transactions", tables: ["transactions", "transaction_splits", "transaction_items", "recurring_bills", "user_merchants"] },
  { label: "Planning", tables: ["monthly_plans", "budget_templates", "smart_views"] },
  { label: "Social", tables: ["friends", "friend_splits", "friend_settlements", "outings", "outing_expenses", "outing_categories", "settlements"] },
  { label: "Sharing", tables: ["purpose_shares", "share_links", "share_access_logs", "share_invite_deliveries"] },
  { label: "Wealth & growth", tables: ["savings_goals", "goal_contributions", "investments", "net_worth_history", "income_streams", "income_targets", "projector_settings", "reflections", "smart_alerts"] },
  { label: "AI", tables: ["ai_chat_messages", "ai_insights"] },
  { label: "SMS rules", tables: ["sms_template_rules", "sms_detection_rules", "sms_block_rules"] },
  { label: "Devices & logs", tables: ["user_devices", "login_history", "audit_logs", "activity_logs", "backup_history", "account_balance_history", "user_api_logs", "admin_action_logs", "admin_impersonation_sessions"] },
  { label: "Config", tables: ["global_settings", "mail_templates"] },
];

const PREFERRED_COLUMNS = ["name", "title", "merchant", "email", "type", "status", "amount", "total_amount", "role", "action", "created_at"];

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return formatIST(text);
  return text;
}

function pickColumns(meta: AdminTableMeta): string[] {
  const names = (meta.columns ?? []).map((column) => column.name);
  const preferred = PREFERRED_COLUMNS.filter((name) => names.includes(name));
  const rest = names.filter((name) => name !== meta.pk && !preferred.includes(name) && !/_id$|^token$|^updated_at$/.test(name));
  return [meta.pk, ...preferred, ...rest].filter((name, index, all) => names.includes(name) && all.indexOf(name) === index).slice(0, 7);
}

export function AdminDatabasePage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [table, setTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [search, setSearch] = useState("");
  const [userInput, setUserInput] = useState("");
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [viewRow, setViewRow] = useState<AdminRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string | boolean> | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<Record<string, unknown> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminRow | null>(null);
  const [pendingRestore, setPendingRestore] = useState<AdminRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const loggedTables = useRef<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(search.trim());

  const metaQuery = useQuery({ queryKey: ["admin-table-meta"], queryFn: fetchAdminTableMeta, staleTime: 5 * 60_000 });
  const metaByTable = useMemo(() => new Map((metaQuery.data ?? []).map((meta) => [meta.table, meta])), [metaQuery.data]);
  const meta = table ? metaByTable.get(table) : undefined;

  const groups = useMemo(() => {
    const known = new Set(GROUPS.flatMap((group) => group.tables));
    const result = GROUPS.map((group) => ({ ...group, tables: group.tables.filter((name) => metaByTable.has(name)) }));
    const other = [...metaByTable.keys()].filter((name) => !known.has(name));
    if (other.length) result.push({ label: "Other", tables: other });
    const needle = tableFilter.trim().toLowerCase();
    return result
      .map((group) => ({ ...group, tables: needle ? group.tables.filter((name) => name.includes(needle)) : group.tables }))
      .filter((group) => group.tables.length);
  }, [metaByTable, tableFilter]);

  const listKey = ["admin-table-rows", table, page, sort, filterUser, debouncedSearch];
  const rowsQuery = useQuery({
    queryKey: listKey,
    queryFn: () =>
      adminListTable({
        table: table!,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderBy: sort?.key ?? null,
        orderDir: sort?.dir ?? "desc",
        filterUser,
        search: debouncedSearch || null,
      }),
    enabled: Boolean(table),
    placeholderData: keepPreviousData,
  });
  const countQuery = useQuery({
    queryKey: ["admin-table-count", table, filterUser, debouncedSearch],
    queryFn: () => adminCountTable(table!, filterUser, debouncedSearch || null),
    enabled: Boolean(table),
  });

  useEffect(() => {
    if (!table || loggedTables.current.has(table)) return;
    loggedTables.current.add(table);
    adminLogAction({ action: "view_table", table }).catch(() => console.error(`Failed to log view_table for ${table}`));
  }, [table]);

  const selectTable = (name: string) => {
    setTable(name);
    setPage(0);
    setSort(null);
    setSearch("");
    setUserInput("");
    setFilterUser(null);
    setViewRow(null);
    setEditValues(null);
  };

  const refreshRows = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-table-rows", table] }),
      queryClient.invalidateQueries({ queryKey: ["admin-table-count", table] }),
    ]);
    if (table === "category_catalog") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-category-catalog-defaults"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-category-catalog-entries"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categoryCatalog() }),
      ]);
    } else if (table === "merchant_brands" || table === "merchant_keyword_rules") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-keyword-rules"] }),
      ]);
    } else if (table === "sms_template_rules" || table === "sms_block_rules" || table === "sms_detection_rules") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-template-requests"] }),
      ]);
    } else if (table === "global_settings") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-global-settings-raw"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["app-config"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() }),
      ]);
    }
  };

  const applyUserFilter = async () => {
    const value = userInput.trim();
    if (!value) {
      setFilterUser(null);
      setPage(0);
      return;
    }
    try {
      const id = await adminFindUser(value);
      if (!id) {
        notify({ title: "No user found", description: `Nothing matches "${value}".` });
        return;
      }
      setFilterUser(id);
      setPage(0);
    } catch (error) {
      notify({ title: "Lookup failed", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const rowId = (row: AdminRow) => String(row[meta?.pk ?? "id"] ?? "");
  const columns = meta ? pickColumns(meta) : [];
  const rows = rowsQuery.data ?? [];

  const beginEdit = () => {
    if (!viewRow || !meta) return;
    const initial: Record<string, string | boolean> = {};
    Object.entries(viewRow).forEach(([key, value]) => {
      if (key === meta.pk) return;
      if (typeof value === "boolean") initial[key] = value;
      else if (value !== null && typeof value === "object") initial[key] = JSON.stringify(value, null, 2);
      else initial[key] = value == null ? "" : String(value);
    });
    setEditValues(initial);
  };

  const buildDiff = (): Record<string, unknown> => {
    if (!viewRow || !editValues) return {};
    const diff: Record<string, unknown> = {};
    const colMap = new Map(meta?.columns?.map((c) => [c.name, c]));

    for (const [key, edited] of Object.entries(editValues)) {
      const original = viewRow[key];
      const col = colMap.get(key);
      const isNumber =
        typeof original === "number" ||
        Boolean(col && ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(col.udt));
      const isJson =
        (original !== null && typeof original === "object") ||
        Boolean(col && (col.udt === "jsonb" || col.udt === "json" || col.type === "ARRAY"));

      if (typeof edited === "boolean") {
        if (edited !== Boolean(original)) diff[key] = edited;
        continue;
      }
      if (isJson) {
        if (edited === "") {
          if (original !== null && original !== undefined) diff[key] = null;
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(edited);
        } catch {
          throw new Error(`"${key}" is not valid JSON.`);
        }
        if (JSON.stringify(parsed) !== JSON.stringify(original)) diff[key] = parsed;
        continue;
      }
      if (isNumber) {
        if (edited === "") {
          if (original !== null && original !== undefined) diff[key] = null;
          continue;
        }
        const numVal = Number(edited);
        if (Number.isNaN(numVal)) {
          throw new Error(`"${key}" must be a valid number.`);
        }
        if (original == null || numVal !== Number(original)) {
          diff[key] = numVal;
        }
        continue;
      }
      const originalText = original == null ? "" : String(original);
      if (edited !== originalText) {
        diff[key] = edited === "" ? null : edited;
      }
    }
    return diff;
  };

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Database"
        description="Browse allow-listed tables. Deletes are soft (restorable) on tables with deleted_at and hard otherwise; every change is audited."
      />

      {metaQuery.error ? (
        <AdminErrorState error={metaQuery.error} onRetry={() => metaQuery.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            <Input className="h-8 text-xs" placeholder="Find table…" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} />
            {/* Mobile: one select instead of a long list */}
            <select
              className="h-9 rounded-lg border border-border bg-card px-2 text-sm lg:hidden"
              value={table ?? ""}
              onChange={(event) => event.target.value && selectTable(event.target.value)}
              aria-label="Table"
            >
              <option value="">Select a table…</option>
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.tables.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="hidden max-h-[70vh] gap-3 overflow-y-auto pr-1 lg:grid">
              {metaQuery.isLoading ? <Skeleton className="h-64 rounded-xl" /> : null}
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                  {group.tables.map((name) => {
                    const tableMeta = metaByTable.get(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => selectTable(name)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                          table === name && "bg-muted font-medium text-foreground",
                        )}
                      >
                        <span className="truncate">{name}</span>
                        {tableMeta && !tableMeta.deletable && !tableMeta.updatable ? <Lock className="ml-auto size-3 shrink-0 opacity-60" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          <section className="grid min-w-0 content-start gap-3">
            {!table || !meta ? (
              <AdminEmptyState title="Pick a table" description="Choose a table to browse its rows." />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-sm font-semibold">{table}</h3>
                  <StatusPill>{countQuery.data != null ? `${countQuery.data.toLocaleString("en-IN")} rows` : "…"}</StatusPill>
                  {meta.softDelete ? <StatusPill tone="info">soft delete</StatusPill> : meta.deletable ? <StatusPill tone="warning">hard delete</StatusPill> : null}
                  {!meta.deletable && !meta.updatable ? (
                    <StatusPill>
                      <Lock className="size-3" /> read-only
                    </StatusPill>
                  ) : null}
                  {meta.insertable ? (
                    <Button className="ml-auto" size="sm" onClick={() => setAddOpen(true)}>
                      <Plus className="size-3.5" /> Add row
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-9 text-sm" placeholder="Search any value in this table…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
                  </div>
                  {meta.userCol ? (
                    <div className="flex gap-2">
                      <Input
                        className="h-9 text-sm sm:w-64"
                        placeholder="User email or id…"
                        value={userInput}
                        onChange={(event) => setUserInput(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && applyUserFilter()}
                      />
                      <Button size="sm" variant="outline" className="h-9" onClick={applyUserFilter}>
                        Filter
                      </Button>
                      {filterUser ? (
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFilterUser(null); setUserInput(""); setPage(0); }}>
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {rowsQuery.isLoading ? (
                  <Skeleton className="h-72 rounded-2xl" />
                ) : rowsQuery.error ? (
                  <AdminErrorState error={rowsQuery.error} onRetry={() => rowsQuery.refetch()} />
                ) : !rows.length ? (
                  <AdminEmptyState title="No rows" description={debouncedSearch || filterUser ? "Nothing matches the current filters." : "This table is empty."} />
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          {columns.map((column) => {
                            const active = sort?.key === column;
                            return (
                              <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 font-mono hover:text-primary"
                                  onClick={() => {
                                    setSort((prev) => (prev?.key === column ? { key: column, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: column, dir: "desc" }));
                                    setPage(0);
                                  }}
                                >
                                  {column}
                                  <span className="text-[10px] text-muted-foreground">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                                </button>
                              </th>
                            );
                          })}
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const deleted = Boolean(row.deleted_at);
                          return (
                            <tr
                              key={rowId(row)}
                              className={cn("cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30", deleted && "opacity-60")}
                              onClick={() => { setViewRow(row); setEditValues(null); }}
                            >
                              {columns.map((column) => (
                                <td key={column} className="max-w-[220px] truncate px-3 py-2 font-mono" title={formatCell(row[column])}>
                                  {formatCell(row[column])}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right">{deleted ? <StatusPill tone="danger">deleted</StatusPill> : null}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <AdminPagination page={page} pageSize={PAGE_SIZE} total={countQuery.data} onPageChange={setPage} loading={rowsQuery.isFetching} />
              </>
            )}
          </section>
        </div>
      )}

      {/* Row detail / edit */}
      <Sheet open={Boolean(viewRow)} onOpenChange={(open) => { if (!open) { setViewRow(null); setEditValues(null); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{table} · {viewRow ? rowId(viewRow) : ""}</SheetTitle>
          </SheetHeader>
          {viewRow && meta ? (
            <div className="grid gap-3 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                {meta.updatable && !editValues ? (
                  <Button size="sm" variant="outline" onClick={beginEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                ) : null}
                {meta.softDelete && viewRow.deleted_at ? (
                  <Button size="sm" variant="outline" onClick={() => setPendingRestore(viewRow)}>
                    <RotateCcw className="size-3.5" /> Restore
                  </Button>
                ) : meta.deletable ? (
                  <Button size="sm" variant="destructive" onClick={() => setPendingDelete(viewRow)}>
                    <Trash2 className="size-3.5" /> {meta.softDelete ? "Delete (soft)" : "Delete permanently"}
                  </Button>
                ) : null}
              </div>

              {editValues ? (
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      const diff = buildDiff();
                      if (!Object.keys(diff).length) {
                        notify({ title: "No changes" });
                        return;
                      }
                      setPendingUpdate(diff);
                    } catch (error) {
                      notify({ title: "Invalid value", description: error instanceof Error ? error.message : String(error) });
                    }
                  }}
                >
                  {Object.entries(editValues).map(([key, value]) => (
                    <label key={key} className="grid gap-1 text-xs">
                      <span className="font-mono text-muted-foreground">{key}</span>
                      {typeof value === "boolean" ? (
                        <Switch checked={value} onCheckedChange={(checked) => setEditValues((prev) => ({ ...prev!, [key]: checked }))} />
                      ) : value.includes("\n") || value.length > 80 ? (
                        <Textarea className="font-mono text-xs" rows={4} value={value} onChange={(event) => setEditValues((prev) => ({ ...prev!, [key]: event.target.value }))} />
                      ) : (
                        <Input className="font-mono text-xs" value={value} onChange={(event) => setEditValues((prev) => ({ ...prev!, [key]: event.target.value }))} />
                      )}
                    </label>
                  ))}
                  <div className="sticky bottom-0 flex justify-end gap-2 bg-background py-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditValues(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm">
                      Review changes
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-1.5 text-xs">
                  {Object.entries(viewRow).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[140px_1fr] gap-2 border-b border-border/50 py-1">
                      <dt className="break-all font-mono text-muted-foreground">{key}</dt>
                      <dd className="whitespace-pre-wrap break-all font-mono">
                        {value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : formatCell(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AdminConfirmDialog
        open={Boolean(pendingUpdate)}
        onOpenChange={(open) => !open && setPendingUpdate(null)}
        title="Save these changes?"
        description={pendingUpdate ? `Fields: ${Object.keys(pendingUpdate).join(", ")}. The before/after values are written to the audit log.` : undefined}
        confirmLabel="Save"
        onConfirm={async () => {
          if (!pendingUpdate || !viewRow || !table) return;
          await adminUpdateRow(table, rowId(viewRow), pendingUpdate);
          notify({ title: "Row updated" });
          setViewRow(null);
          setEditValues(null);
          await refreshRows();
        }}
      >
        {pendingUpdate ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-2 text-[11px]">{JSON.stringify(pendingUpdate, null, 2)}</pre>
        ) : null}
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={meta?.softDelete ? "Soft-delete this row?" : "Permanently delete this row?"}
        description={
          meta?.softDelete
            ? "Sets deleted_at, so the user stops seeing it. You can restore it later from this page."
            : "This table has no deleted_at column, so the row is removed for good (a before-image is kept in the audit log)."
        }
        confirmLabel="Delete"
        destructive
        requirePhrase={meta?.softDelete ? undefined : "DELETE"}
        onConfirm={async () => {
          if (!pendingDelete || !table) return;
          await adminDeleteRow(table, rowId(pendingDelete));
          notify({ title: meta?.softDelete ? "Row soft-deleted" : "Row deleted" });
          setViewRow(null);
          await refreshRows();
        }}
      />

      <AdminConfirmDialog
        open={Boolean(pendingRestore)}
        onOpenChange={(open) => !open && setPendingRestore(null)}
        title="Restore this row?"
        description="Clears deleted_at so it shows up for the user again."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!pendingRestore || !table) return;
          await adminRestoreRow(table, rowId(pendingRestore));
          notify({ title: "Row restored" });
          setViewRow(null);
          await refreshRows();
        }}
      />

      {table && meta && addOpen ? (
        <AdminAddRowModal key={table} open={addOpen} onOpenChange={setAddOpen} table={table} columns={meta.columns ?? []} onSuccess={() => void refreshRows()} />
      ) : null}
    </div>
  );
}
