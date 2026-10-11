"use client";

import { ArrowRight, Loader2, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AdminCard, AdminConfirmDialog, AdminErrorState, AdminPageHeader } from "@/components/admin/admin-ui";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/providers/toast-provider";

// global_settings editor. Writes go through the global_settings_write_admin
// RLS policy; the admin_audit_config_change trigger (20261011_admin_fixes)
// records before/after in the audit log. SMS rules live on /admin/sms-rules.
type Form = {
  app_name: string;
  logo_url: string;
  app_version: string;
  default_safe_spending_percentage: string;
  default_monthly_budget: string;
  max_category_limit: string;
  max_purposes_limit: string;
  max_accounts_limit: string;
  max_contributors_limit: string;
  maintenance_mode: boolean;
};

const NUMBER_FIELDS: Array<{ key: keyof Form; label: string; min: number; max?: number; fallback: number }> = [
  { key: "default_safe_spending_percentage", label: "Default safe-spending %", min: 1, max: 100, fallback: 20 },
  { key: "default_monthly_budget", label: "Default monthly budget (₹)", min: 0, fallback: 0 },
  { key: "max_category_limit", label: "Max categories per user", min: 1, fallback: 50 },
  { key: "max_purposes_limit", label: "Max purposes per user", min: 1, fallback: 10 },
  { key: "max_accounts_limit", label: "Max accounts per user", min: 1, fallback: 8 },
  { key: "max_contributors_limit", label: "Max contributors per user", min: 1, fallback: 10 },
];

async function fetchRawGlobalSettings() {
  const { data, error } = await createClient().from("global_settings").select("*").eq("id", "app").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The global_settings row with id "app" is missing.');
  return data as Record<string, unknown>;
}

function toForm(row: Record<string, unknown>): Form {
  const num = (key: keyof Form, fallback: number) => String(row[key] ?? fallback);
  return {
    app_name: String(row.app_name ?? "SpentX"),
    logo_url: String(row.logo_url ?? ""),
    app_version: String(row.app_version ?? "1.0.0"),
    default_safe_spending_percentage: num("default_safe_spending_percentage", 20),
    default_monthly_budget: num("default_monthly_budget", 0),
    max_category_limit: num("max_category_limit", 50),
    max_purposes_limit: num("max_purposes_limit", 10),
    max_accounts_limit: num("max_accounts_limit", 8),
    max_contributors_limit: num("max_contributors_limit", 10),
    maintenance_mode: Boolean(row.maintenance_mode),
  };
}

function validate(form: Form): string | null {
  for (const field of NUMBER_FIELDS) {
    const raw = String(form[field.key]).trim();
    const value = Number(raw);
    if (raw === "" || Number.isNaN(value)) return `${field.label} must be a number.`;
    if (value < field.min) return `${field.label} must be at least ${field.min}.`;
    if (field.max != null && value > field.max) return `${field.label} must be at most ${field.max}.`;
  }
  if (form.logo_url.trim() && !/^https?:\/\//i.test(form.logo_url.trim())) return "Logo URL must start with http(s)://";
  return null;
}

export function AdminSettingsPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Form | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: row, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-global-settings-raw"],
    queryFn: fetchRawGlobalSettings,
  });

  if (isLoading) {
    return <Skeleton className="h-80 rounded-2xl" />;
  }
  if (error || !row) {
    return <AdminErrorState error={error} onRetry={() => refetch()} />;
  }

  const original = toForm(row);
  const form = draft ?? original;
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setDraft({ ...form, [key]: value });
  const validationError = validate(form);
  const maintenanceChanging = form.maintenance_mode !== original.maintenance_mode;

  const save = async () => {
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        app_name: form.app_name.trim() || "SpentX",
        logo_url: form.logo_url.trim() || null,
        app_version: form.app_version.trim() || "1.0.0",
        maintenance_mode: form.maintenance_mode,
      };
      NUMBER_FIELDS.forEach((field) => {
        payload[field.key] = Number(String(form[field.key]).trim());
      });
      const { data, error: saveError } = await createClient()
        .from("global_settings")
        .update(payload)
        .eq("id", "app")
        .select("id");
      if (saveError) throw new Error(saveError.message);
      if (!data?.length) throw new Error("No row was updated — check the admin RLS policy on global_settings.");
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-global-settings-raw"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["app-config"] }),
        queryClient.invalidateQueries({ queryKey: ["app-config-shell"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() }),
      ]);
      notify({ title: "Settings saved", description: "Changes apply to all users." });
    } catch (saveError) {
      notify({ title: "Save failed", description: saveError instanceof Error ? saveError.message : String(saveError) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="App settings"
        description="Global defaults and limits for every user. Saved changes are audited."
        actions={
          <>
            <Button size="sm" variant="outline" disabled={!dirty || isSaving} onClick={() => setDraft(null)}>
              <RotateCcw className="size-3.5" /> Discard
            </Button>
            <Button size="sm" disabled={!dirty || isSaving || Boolean(validationError)} onClick={() => setConfirmOpen(true)}>
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
            </Button>
          </>
        }
      />

      {validationError && dirty ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{validationError}</p>
      ) : null}

      <AdminCard>
        <h3 className="text-sm font-semibold">Identity</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="App name">
            <Input value={form.app_name} onChange={(event) => set("app_name", event.target.value)} />
          </Field>
          <Field label="Logo URL">
            <Input placeholder="https://…" value={form.logo_url} onChange={(event) => set("logo_url", event.target.value)} />
          </Field>
          <Field label="App version">
            <Input value={form.app_version} onChange={(event) => set("app_version", event.target.value)} />
          </Field>
        </div>
      </AdminCard>

      <AdminCard>
        <h3 className="text-sm font-semibold">Defaults & limits</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBER_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <Input
                type="number"
                inputMode="decimal"
                min={field.min}
                max={field.max}
                value={String(form[field.key])}
                onChange={(event) => set(field.key, event.target.value as never)}
              />
            </Field>
          ))}
        </div>
      </AdminCard>

      <AdminCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Maintenance mode</h3>
            <p className="text-xs text-muted-foreground">Signed-in non-admin website users see a maintenance notice. (Not read by the mobile app yet.)</p>
          </div>
          <Switch checked={form.maintenance_mode} onCheckedChange={(checked) => set("maintenance_mode", checked)} />
        </div>
      </AdminCard>

      <AdminCard>
        <h3 className="text-sm font-semibold">Related</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { href: "/admin/categories", label: "Default categories" },
            { href: "/admin/sms-rules", label: "SMS rules" },
            { href: "/admin/merchant-rules", label: "Merchant rules" },
          ].map((link) => (
            <Link key={link.href} href={link.href} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-medium hover:bg-muted/50">
              {link.label}
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </AdminCard>

      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save global settings?"
        description={
          maintenanceChanging
            ? form.maintenance_mode
              ? "This also turns maintenance mode ON — non-admin users will be locked out of the website."
              : "This also turns maintenance mode OFF."
            : "These defaults apply to every user."
        }
        destructive={maintenanceChanging && form.maintenance_mode}
        confirmLabel="Save"
        onConfirm={save}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
