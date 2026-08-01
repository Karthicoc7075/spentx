"use client";

import { ArrowRight, Loader2, Save, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SmsRulesAdminPanel } from "@/components/settings/SmsRulesAdminPanel";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useToast } from "@/providers/toast-provider";

// Full global_settings editor, relocated into the admin portal. Writes go
// directly through the global_settings table under the existing
// global_settings_write_admin RLS policy — no new backend. Default
// categories have their own dedicated CRUD at /admin/categories; mail
// templates are editable via Database -> mail_templates.
type GlobalSettingsForm = {
  app_name: string;
  logo_url: string;
  default_safe_spending_percentage: string;
  default_monthly_budget: string;
  max_category_limit: string;
  max_purposes_limit: string;
  max_accounts_limit: string;
  max_contributors_limit: string;
  app_version: string;
  maintenance_mode: boolean;
};

async function fetchRawGlobalSettings() {
  const { data, error } = await createClient()
    .from("global_settings")
    .select("*")
    .eq("id", "app")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export function AdminSettingsPage() {
  const { notify } = useToast();
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GlobalSettingsForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: row, isLoading } = useQuery({
    queryKey: ["admin-global-settings-raw"],
    queryFn: fetchRawGlobalSettings,
  });

  useEffect(() => {
    if (!row || form) return;
    setForm({
      app_name: String(row.app_name ?? "SpentX"),
      logo_url: String(row.logo_url ?? ""),
      default_safe_spending_percentage: String(row.default_safe_spending_percentage ?? 20),
      default_monthly_budget: String(row.default_monthly_budget ?? 0),
      max_category_limit: String(row.max_category_limit ?? 50),
      max_purposes_limit: String(row.max_purposes_limit ?? 10),
      max_accounts_limit: String(row.max_accounts_limit ?? 10),
      max_contributors_limit: String(row.max_contributors_limit ?? 10),
      app_version: String(row.app_version ?? "1.0.0"),
      maintenance_mode: Boolean(row.maintenance_mode),
    });
  }, [row, form]);

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      const { error } = await createClient()
        .from("global_settings")
        .update({
          app_name: form.app_name.trim() || "SpentX",
          logo_url: form.logo_url.trim() || null,
          default_safe_spending_percentage:
            Number(form.default_safe_spending_percentage) || 20,
          default_monthly_budget: Number(form.default_monthly_budget) || 0,
          max_category_limit: Number(form.max_category_limit) || 50,
          max_purposes_limit: Number(form.max_purposes_limit) || 10,
          max_accounts_limit: Number(form.max_accounts_limit) || 10,
          max_contributors_limit: Number(form.max_contributors_limit) || 10,
          app_version: form.app_version.trim() || "1.0.0",
          maintenance_mode: form.maintenance_mode,
        })
        .eq("id", "app");
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ["admin-global-settings-raw"] });
      queryClient.invalidateQueries({ queryKey: ["admin-app-config"] });
      queryClient.invalidateQueries({ queryKey: ["app-config-shell"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() });
      notify({ title: "Global settings saved", description: "Changes apply to all users." });
    } catch (error) {
      notify({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !form) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const numberField = (
    label: string,
    key: keyof GlobalSettingsForm,
    props?: { min?: number; max?: number },
  ) => (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        className="h-10 text-xs"
        min={props?.min}
        max={props?.max}
        type="number"
        value={String(form[key])}
        onChange={(event) =>
          setForm((current) =>
            current ? { ...current, [key]: event.target.value } : current,
          )
        }
      />
    </div>
  );

  const textField = (label: string, key: keyof GlobalSettingsForm, placeholder?: string) => (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        className="h-10 text-xs"
        placeholder={placeholder}
        value={String(form[key])}
        onChange={(event) =>
          setForm((current) =>
            current ? { ...current, [key]: event.target.value } : current,
          )
        }
      />
    </div>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">App identity & limits</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {textField("App name", "app_name")}
            {textField("Logo URL", "logo_url", "https://…")}
            {textField("App version", "app_version")}
            {numberField("Default safe spending %", "default_safe_spending_percentage", { min: 1, max: 100 })}
            {numberField("Default monthly budget", "default_monthly_budget", { min: 0 })}
            {numberField("Max categories per user", "max_category_limit", { min: 1 })}
            {numberField("Max purposes per user", "max_purposes_limit", { min: 1 })}
            {numberField("Max bank accounts per user", "max_accounts_limit", { min: 1 })}
            {numberField("Max contributors per user", "max_contributors_limit", { min: 1 })}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/40 px-4 py-3">
            <div>
              <p className="text-xs font-semibold">Maintenance mode</p>
              <p className="text-[11px] text-muted-foreground">
                Locks every non-admin user out of the app immediately.
              </p>
            </div>
            <Switch
              checked={form.maintenance_mode}
              onCheckedChange={(checked) =>
                setForm((current) =>
                  current ? { ...current, maintenance_mode: checked } : current,
                )
              }
            />
          </div>

          <Button
            className="mt-4 h-10 text-xs font-bold"
            disabled={isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save global settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">Related editors</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted/50"
              href="/admin/categories"
            >
              Default categories (add / edit / delete)
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
            </Link>
            <Link
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted/50"
              href="/admin/database"
            >
              Mail templates (Database → mail_templates)
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">SMS Rules</h2>
            </div>
            <Link
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              href="/admin/sms-rules"
            >
              Full page
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <SmsRulesAdminPanel adminId={user?.id} onNotify={notify} />
        </CardContent>
      </Card>
    </div>
  );
}
