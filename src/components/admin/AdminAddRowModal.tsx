"use client";

import { useState } from "react";
import { Plus, Loader2, Code2, FormInput } from "lucide-react";
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
import { adminInsertRow } from "@/lib/admin-api";
import { useToast } from "@/providers/toast-provider";

export function AdminAddRowModal({
  open,
  onOpenChange,
  table,
  sampleRow,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: string;
  sampleRow?: Record<string, unknown> | null;
  onSuccess: () => void;
}) {
  const { notify } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Initialize template when modal opens
  const handleOpen = (nextOpen: boolean) => {
    if (nextOpen && sampleRow) {
      const initial: Record<string, string> = {};
      const initialJson: Record<string, unknown> = {};

      Object.entries(sampleRow).forEach(([key, val]) => {
        if (key === "id" || key === "created_at" || key === "updated_at") return;
        if (typeof val === "boolean") {
          initial[key] = String(val);
          initialJson[key] = val;
        } else if (typeof val === "number") {
          initial[key] = String(val);
          initialJson[key] = val;
        } else if (typeof val === "object" && val !== null) {
          initial[key] = JSON.stringify(val);
          initialJson[key] = val;
        } else {
          initial[key] = typeof val === "string" ? "" : "";
          initialJson[key] = typeof val === "string" ? "" : null;
        }
      });

      setFieldValues(initial);
      setJsonText(JSON.stringify(initialJson, null, 2));
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let recordToInsert: Record<string, unknown> = {};

      if (jsonMode) {
        try {
          recordToInsert = JSON.parse(jsonText);
        } catch {
          throw new Error("Invalid JSON format. Please verify your JSON payload.");
        }
      } else {
        Object.entries(fieldValues).forEach(([k, v]) => {
          if (v === "" || v === undefined) return;
          // Parse boolean or numbers if applicable
          if (v.toLowerCase() === "true") recordToInsert[k] = true;
          else if (v.toLowerCase() === "false") recordToInsert[k] = false;
          else if (!Number.isNaN(Number(v)) && !v.includes("-") && v.trim() !== "") {
            recordToInsert[k] = Number(v);
          } else if (v.startsWith("{") || v.startsWith("[")) {
            try {
              recordToInsert[k] = JSON.parse(v);
            } catch {
              recordToInsert[k] = v;
            }
          } else {
            recordToInsert[k] = v;
          }
        });
      }

      if (Object.keys(recordToInsert).length === 0) {
        throw new Error("Record cannot be empty. Please provide field values.");
      }

      await adminInsertRow(table, recordToInsert);
      notify({
        title: "Record added successfully",
        description: `New row inserted into '${table}' table.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      notify({
        title: "Insert failed",
        description: error instanceof Error ? error.message : "Failed to add record.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fields = sampleRow
    ? Object.keys(sampleRow).filter(
        (k) => k !== "id" && k !== "created_at" && k !== "updated_at",
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Plus className="size-4 text-primary" />
              Add Record to <span className="font-mono text-primary">{table}</span>
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setJsonMode(!jsonMode)}
            >
              {jsonMode ? (
                <>
                  <FormInput className="size-3.5" />
                  <span>Form Mode</span>
                </>
              ) : (
                <>
                  <Code2 className="size-3.5" />
                  <span>JSON Mode</span>
                </>
              )}
            </Button>
          </div>
          <DialogDescription className="text-xs">
            Insert a new row into the database. System will auto-generate primary
            keys and timestamps.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {jsonMode ? (
            <div className="space-y-1.5">
              <Label htmlFor="json-input" className="text-xs font-semibold">
                JSON Record Payload
              </Label>
              <Textarea
                id="json-input"
                className="font-mono text-xs h-64 resize-y"
                placeholder='{\n  "name": "Example",\n  "is_active": true\n}'
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            </div>
          ) : fields.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 max-h-[50vh] overflow-y-auto px-1">
              {fields.map((field) => (
                <div key={field} className="space-y-1">
                  <Label htmlFor={`field-${field}`} className="text-xs font-mono">
                    {field}
                  </Label>
                  <Input
                    id={`field-${field}`}
                    className="h-8 text-xs font-mono"
                    placeholder={`Enter ${field}…`}
                    value={fieldValues[field] ?? ""}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No column schema detected. Please input JSON fields for this table.
              </p>
              <Textarea
                className="font-mono text-xs h-48"
                placeholder='{\n  "key": "value"\n}'
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  <span>Adding…</span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5 mr-1" />
                  <span>Insert Record</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
