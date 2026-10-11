"use client";

import { useState } from "react";
import { Code2, FormInput, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminInsertRow, type AdminColumnMeta } from "@/lib/admin-api";
import { useToast } from "@/providers/toast-provider";

const SKIP = new Set(["created_at", "updated_at", "deleted_at"]);

function isJsonType(column: AdminColumnMeta) {
  return column.udt === "jsonb" || column.udt === "json" || column.type === "ARRAY";
}
function isNumberType(column: AdminColumnMeta) {
  return ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(column.udt);
}

/** Converts a form string to the column's type; "" = omit (use DB default / null). */
function coerce(column: AdminColumnMeta, raw: string): unknown {
  if (raw === "") return undefined;
  if (column.udt === "bool") return raw === "true";
  if (isNumberType(column)) {
    const value = Number(raw);
    if (Number.isNaN(value)) throw new Error(`"${column.name}" must be a number.`);
    return value;
  }
  if (isJsonType(column)) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`"${column.name}" must be valid JSON.`);
    }
  }
  return raw;
}

/**
 * Insert form generated from the table's real columns (admin_table_meta),
 * so it works for empty tables too. The RPC re-validates the allow-list and
 * columns and writes the audit entry.
 */
export function AdminAddRowModal({
  open,
  onOpenChange,
  table,
  columns,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: string;
  columns: AdminColumnMeta[];
  onSuccess: () => void;
}) {
  const { notify } = useToast();
  // The parent mounts this only while open (keyed by table), so state is
  // fresh for every open without a reset effect.
  const editable = columns.filter((column) => !SKIP.has(column.name));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => {
    const template: Record<string, unknown> = {};
    editable.forEach((column) => {
      if (!column.hasDefault && !column.nullable) template[column.name] = null;
    });
    return JSON.stringify(template, null, 2);
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      let record: Record<string, unknown> = {};
      if (jsonMode) {
        try {
          record = JSON.parse(jsonText);
        } catch {
          throw new Error("The JSON is not valid.");
        }
        if (!record || typeof record !== "object" || Array.isArray(record)) {
          throw new Error("The JSON must be an object of column: value.");
        }
      } else {
        for (const column of editable) {
          const value = coerce(column, values[column.name] ?? "");
          if (value !== undefined) record[column.name] = value;
        }
      }
      if (!Object.keys(record).length) throw new Error("Fill in at least one field.");
      await adminInsertRow(table, record);
      notify({ title: "Row added", description: `Inserted into ${table} (audited).` });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add row to {table}</DialogTitle>
          <DialogDescription>
            Leave a field empty to use its database default. Required fields are marked *.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
          <Button type="button" size="xs" variant={jsonMode ? "ghost" : "default"} onClick={() => setJsonMode(false)}>
            <FormInput className="size-3" /> Form
          </Button>
          <Button type="button" size="xs" variant={jsonMode ? "default" : "ghost"} onClick={() => setJsonMode(true)}>
            <Code2 className="size-3" /> JSON
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3">
          {jsonMode ? (
            <Textarea
              className="min-h-56 font-mono text-xs"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
            />
          ) : (
            editable.map((column) => {
              const required = !column.nullable && !column.hasDefault;
              const id = `add-${table}-${column.name}`;
              return (
                <div key={column.name} className="grid gap-1">
                  <Label htmlFor={id} className="flex items-center gap-1 text-xs">
                    <span className="font-mono">{column.name}</span>
                    {required ? <span className="text-destructive">*</span> : null}
                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">{column.udt}</span>
                  </Label>
                  {column.udt === "bool" ? (
                    <select
                      id={id}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                      value={values[column.name] ?? ""}
                      onChange={(event) => setValues((prev) => ({ ...prev, [column.name]: event.target.value }))}
                    >
                      <option value="">(default)</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : isJsonType(column) ? (
                    <Textarea
                      id={id}
                      className="font-mono text-xs"
                      rows={3}
                      placeholder={column.type === "ARRAY" ? "[]" : "{}"}
                      value={values[column.name] ?? ""}
                      onChange={(event) => setValues((prev) => ({ ...prev, [column.name]: event.target.value }))}
                    />
                  ) : (
                    <Input
                      id={id}
                      inputMode={isNumberType(column) ? "decimal" : undefined}
                      placeholder={column.hasDefault ? "(default)" : ""}
                      value={values[column.name] ?? ""}
                      onChange={(event) => setValues((prev) => ({ ...prev, [column.name]: event.target.value }))}
                    />
                  )}
                </div>
              );
            })
          )}
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Insert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
