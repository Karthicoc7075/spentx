"use client";

import { Plus, Save, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteSmsBlockRule,
  deleteSmsDetectionRule,
  deleteSmsTemplateRule,
  fetchSmsBlockRules,
  fetchSmsDetectionRules,
  fetchSmsTemplateRules,
  saveSmsBlockRule,
  saveSmsDetectionRule,
  saveSmsTemplateRule,
} from "@/lib/firebase";
import { cn } from "@/lib/utils";
import type {
  SmsBlockRule,
  SmsDetectionRule,
  SmsRuleMode,
  SmsTemplateRule,
  SmsTemplateRuleType,
} from "@/types";

type RuleTab = "template" | "detection" | "block";

type SmsRulesAdminPanelProps = {
  adminId?: string;
  onNotify: (payload: { title: string; description?: string }) => void;
};

function parseKeywordList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatKeywordList(values: string[]) {
  return values.join(", ");
}

const tabLabels: Record<RuleTab, string> = {
  template: "Template Rules",
  detection: "Detection Rules",
  block: "Block Rules",
};

export function SmsRulesAdminPanel({ adminId, onNotify }: SmsRulesAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<RuleTab>("template");
  const [loading, setLoading] = useState(true);
  const [templateRules, setTemplateRules] = useState<SmsTemplateRule[]>([]);
  const [detectionRules, setDetectionRules] = useState<SmsDetectionRule[]>([]);
  const [blockRules, setBlockRules] = useState<SmsBlockRule[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplateRule | null>(null);
  const [editingDetection, setEditingDetection] = useState<SmsDetectionRule | null>(null);
  const [editingBlock, setEditingBlock] = useState<SmsBlockRule | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [templates, detections, blocks] = await Promise.all([
        fetchSmsTemplateRules(),
        fetchSmsDetectionRules(),
        fetchSmsBlockRules(),
      ]);
      setTemplateRules(templates);
      setDetectionRules(detections);
      setBlockRules(blocks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  async function handleSaveTemplate() {
    if (!editingTemplate) return;
    setSaving(true);
    try {
      const saved = await saveSmsTemplateRule(editingTemplate, adminId);
      setTemplateRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setEditingTemplate(null);
      onNotify({ title: "Template rule saved" });
    } catch {
      onNotify({
        title: "Failed to save template rule",
        description: "Check your Firestore permissions.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDetection() {
    if (!editingDetection) return;
    setSaving(true);
    try {
      const saved = await saveSmsDetectionRule(editingDetection, adminId);
      setDetectionRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setEditingDetection(null);
      onNotify({ title: "Detection rule saved" });
    } catch {
      onNotify({
        title: "Failed to save detection rule",
        description: "Check your Firestore permissions.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBlock() {
    if (!editingBlock) return;
    setSaving(true);
    try {
      const saved = await saveSmsBlockRule(editingBlock, adminId);
      setBlockRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setEditingBlock(null);
      onNotify({ title: "Block rule saved" });
    } catch {
      onNotify({
        title: "Failed to save block rule",
        description: "Check your Firestore permissions.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm dark:border-border dark:bg-card">
      <CardHeader className="border-b border-border/60 p-5 dark:border-border">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Smartphone className="size-5" />
          </span>
          <div>
            <CardTitle className="text-sm font-semibold">SMS Parsing Rules</CardTitle>
            <CardDescription className="text-xs">
              Admin-managed rules synced to the mobile app. Raw detected SMS stays
              on-device only.
            </CardDescription>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(tabLabels) as RuleTab[]).map((tab) => (
            <Button
              key={tab}
              className={cn(
                "h-8 text-xs font-semibold",
                activeTab === tab
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {!loading && activeTab === "template" ? (
          <>
            <div className="flex justify-end">
              <Button
                className="h-9 text-xs font-semibold"
                type="button"
                variant="outline"
                onClick={() =>
                  setEditingTemplate({
                    id: crypto.randomUUID(),
                    bankName: "",
                    type: "debit",
                    mode: "upi",
                    templatePattern: "",
                    keywords: [],
                    isActive: true,
                  })
                }
              >
                <Plus className="mr-1.5 size-3.5" />
                Add template rule
              </Button>
            </div>

            {editingTemplate ? (
              <RuleEditor
                title={editingTemplate.bankName ? "Edit template rule" : "New template rule"}
                onCancel={() => setEditingTemplate(null)}
                onSave={() => void handleSaveTemplate()}
                saving={saving}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bank name">
                    <Input
                      value={editingTemplate.bankName}
                      onChange={(event) =>
                        setEditingTemplate((current) =>
                          current ? { ...current, bankName: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      value={editingTemplate.type}
                      onChange={(event) =>
                        setEditingTemplate((current) =>
                          current
                            ? {
                                ...current,
                                type: event.target.value as SmsTemplateRuleType,
                              }
                            : current,
                        )
                      }
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </Field>
                  <Field label="Mode">
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      value={editingTemplate.mode}
                      onChange={(event) =>
                        setEditingTemplate((current) =>
                          current
                            ? { ...current, mode: event.target.value as SmsRuleMode }
                            : current,
                        )
                      }
                    >
                      <option value="upi">UPI</option>
                      <option value="atm">ATM</option>
                      <option value="card">Card</option>
                    </select>
                  </Field>
                  <Field label="Keywords (comma-separated)">
                    <Input
                      value={formatKeywordList(editingTemplate.keywords)}
                      onChange={(event) =>
                        setEditingTemplate((current) =>
                          current
                            ? {
                                ...current,
                                keywords: parseKeywordList(event.target.value),
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                </div>
                <Field label="Template pattern">
                  <Input
                    value={editingTemplate.templatePattern}
                    onChange={(event) =>
                      setEditingTemplate((current) =>
                        current
                          ? { ...current, templatePattern: event.target.value }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Extraction map (JSON)">
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono"
                    value={JSON.stringify(editingTemplate.extractionMap ?? {}, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed = JSON.parse(event.target.value) as Record<
                          string,
                          string
                        >;
                        setEditingTemplate((current) =>
                          current ? { ...current, extractionMap: parsed } : current,
                        );
                      } catch {
                        // Allow invalid JSON while typing
                      }
                    }}
                  />
                </Field>
                <ActiveToggle
                  checked={editingTemplate.isActive}
                  onCheckedChange={(checked) =>
                    setEditingTemplate((current) =>
                      current ? { ...current, isActive: checked } : current,
                    )
                  }
                />
              </RuleEditor>
            ) : null}

            <RulesTable
              emptyLabel="No template rules yet."
              headers={["Bank", "Type", "Mode", "Keywords", "Status", ""]}
              rows={templateRules.map((rule) => ({
                id: rule.id,
                cells: [
                  rule.bankName,
                  rule.type,
                  rule.mode,
                  rule.keywords.join(", ") || "—",
                  <StatusBadge key={`${rule.id}-status`} active={rule.isActive} />,
                ],
                onEdit: () => setEditingTemplate(rule),
                onDelete: async () => {
                  await deleteSmsTemplateRule(rule.id);
                  setTemplateRules((current) =>
                    current.filter((item) => item.id !== rule.id),
                  );
                  onNotify({ title: "Template rule deleted" });
                },
              }))}
            />
          </>
        ) : null}

        {!loading && activeTab === "detection" ? (
          <>
            <div className="flex justify-end">
              <Button
                className="h-9 text-xs font-semibold"
                type="button"
                variant="outline"
                onClick={() =>
                  setEditingDetection({
                    id: crypto.randomUUID(),
                    matchPattern: "",
                    containsKeywords: [],
                    excludeKeywords: [],
                    type: "Debit",
                    mode: "UPI",
                    bankName: "",
                    isActive: true,
                  })
                }
              >
                <Plus className="mr-1.5 size-3.5" />
                Add detection rule
              </Button>
            </div>

            {editingDetection ? (
              <RuleEditor
                title={
                  editingDetection.bankName
                    ? "Edit detection rule"
                    : "New detection rule"
                }
                onCancel={() => setEditingDetection(null)}
                onSave={() => void handleSaveDetection()}
                saving={saving}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bank name">
                    <Input
                      value={editingDetection.bankName}
                      onChange={(event) =>
                        setEditingDetection((current) =>
                          current ? { ...current, bankName: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Type">
                    <Input
                      value={editingDetection.type}
                      onChange={(event) =>
                        setEditingDetection((current) =>
                          current ? { ...current, type: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Mode">
                    <Input
                      value={editingDetection.mode}
                      onChange={(event) =>
                        setEditingDetection((current) =>
                          current ? { ...current, mode: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Amount pattern">
                    <Input
                      value={editingDetection.amountPattern ?? ""}
                      onChange={(event) =>
                        setEditingDetection((current) =>
                          current
                            ? { ...current, amountPattern: event.target.value }
                            : current,
                        )
                      }
                    />
                  </Field>
                </div>
                <Field label="Match pattern">
                  <Input
                    value={editingDetection.matchPattern}
                    onChange={(event) =>
                      setEditingDetection((current) =>
                        current
                          ? { ...current, matchPattern: event.target.value }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Contains keywords">
                  <Input
                    value={formatKeywordList(editingDetection.containsKeywords)}
                    onChange={(event) =>
                      setEditingDetection((current) =>
                        current
                          ? {
                              ...current,
                              containsKeywords: parseKeywordList(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Exclude keywords">
                  <Input
                    value={formatKeywordList(editingDetection.excludeKeywords)}
                    onChange={(event) =>
                      setEditingDetection((current) =>
                        current
                          ? {
                              ...current,
                              excludeKeywords: parseKeywordList(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </Field>
                <ActiveToggle
                  checked={editingDetection.isActive}
                  onCheckedChange={(checked) =>
                    setEditingDetection((current) =>
                      current ? { ...current, isActive: checked } : current,
                    )
                  }
                />
              </RuleEditor>
            ) : null}

            <RulesTable
              emptyLabel="No detection rules yet."
              headers={["Bank", "Type", "Mode", "Match", "Status", ""]}
              rows={detectionRules.map((rule) => ({
                id: rule.id,
                cells: [
                  rule.bankName,
                  rule.type,
                  rule.mode,
                  rule.matchPattern || "—",
                  <StatusBadge key={`${rule.id}-status`} active={rule.isActive} />,
                ],
                onEdit: () => setEditingDetection(rule),
                onDelete: async () => {
                  await deleteSmsDetectionRule(rule.id);
                  setDetectionRules((current) =>
                    current.filter((item) => item.id !== rule.id),
                  );
                  onNotify({ title: "Detection rule deleted" });
                },
              }))}
            />
          </>
        ) : null}

        {!loading && activeTab === "block" ? (
          <>
            <div className="flex justify-end">
              <Button
                className="h-9 text-xs font-semibold"
                type="button"
                variant="outline"
                onClick={() =>
                  setEditingBlock({
                    id: crypto.randomUUID(),
                    name: "",
                    keywords: [],
                    similarityThreshold: 0.6,
                    isActive: true,
                  })
                }
              >
                <Plus className="mr-1.5 size-3.5" />
                Add block rule
              </Button>
            </div>

            {editingBlock ? (
              <RuleEditor
                title={editingBlock.name ? "Edit block rule" : "New block rule"}
                onCancel={() => setEditingBlock(null)}
                onSave={() => void handleSaveBlock()}
                saving={saving}
              >
                <Field label="Rule name">
                  <Input
                    value={editingBlock.name}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </Field>
                <Field label="Keywords (comma-separated)">
                  <Input
                    value={formatKeywordList(editingBlock.keywords)}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current
                          ? {
                              ...current,
                              keywords: parseKeywordList(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </Field>
                <Field label="Pattern">
                  <Input
                    value={editingBlock.pattern ?? ""}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current ? { ...current, pattern: event.target.value } : current,
                      )
                    }
                  />
                </Field>
                <Field label="Similarity threshold (0–1)">
                  <Input
                    inputMode="decimal"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={editingBlock.similarityThreshold}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current
                          ? {
                              ...current,
                              similarityThreshold: Number(event.target.value) || 0,
                            }
                          : current,
                      )
                    }
                  />
                </Field>
                <ActiveToggle
                  checked={editingBlock.isActive}
                  onCheckedChange={(checked) =>
                    setEditingBlock((current) =>
                      current ? { ...current, isActive: checked } : current,
                    )
                  }
                />
              </RuleEditor>
            ) : null}

            <RulesTable
              emptyLabel="No block rules yet."
              headers={["Name", "Keywords", "Threshold", "Status", ""]}
              rows={blockRules.map((rule) => ({
                id: rule.id,
                cells: [
                  rule.name,
                  rule.keywords.join(", ") || "—",
                  String(rule.similarityThreshold),
                  <StatusBadge key={`${rule.id}-status`} active={rule.isActive} />,
                ],
                onEdit: () => setEditingBlock(rule),
                onDelete: async () => {
                  await deleteSmsBlockRule(rule.id);
                  setBlockRules((current) =>
                    current.filter((item) => item.id !== rule.id),
                  );
                  onNotify({ title: "Block rule deleted" });
                },
              }))}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ActiveToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium">Active</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      className={cn(
        "text-[10px] uppercase",
        active
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

function RuleEditor({
  title,
  children,
  onCancel,
  onSave,
  saving,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="space-y-3">{children}</div>
      <div className="flex gap-2">
        <Button
          className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={saving}
          type="button"
          onClick={onSave}
        >
          <Save className="mr-1.5 size-3.5" />
          Save rule
        </Button>
        <Button className="h-9" type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RulesTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: Array<{
    id: string;
    cells: ReactNode[];
    onEdit: () => void;
    onDelete: () => Promise<void>;
  }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} className="text-[10px] uppercase">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.cells.map((cell, index) => (
                <TableCell key={`${row.id}-${index}`} className="text-xs">
                  {cell}
                </TableCell>
              ))}
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    className=""
                    type="button"
                    variant="outline"
                    onClick={row.onEdit}
                  >
                    Edit
                  </Button>
                  <Button
                    className="text-rose-600"
                    type="button"
                    variant="ghost"
                    onClick={() => void row.onDelete()}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}