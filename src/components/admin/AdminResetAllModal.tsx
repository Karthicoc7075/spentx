"use client";

import { AlertTriangle, Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearBootstrapSessionCache } from "@/lib/user-bootstrap";
import { useToast } from "@/providers/toast-provider";

type AdminResetAllModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function AdminResetAllModal({
  open,
  onOpenChange,
  onSuccess,
}: AdminResetAllModalProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("Admin password is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/admin/reset-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(resData.error || "Reset failed. Incorrect password.");
      }

      // Invalidate all query caches
      queryClient.invalidateQueries();

      // The purge emptied this admin's own workspace too (accounts, purposes,
      // categories). bootstrapUserWorkspace re-seeds it on the next data load,
      // but it short-circuits on a sessionStorage "already bootstrapped" flag
      // that survives the reload below — so clear the flag or the admin lands
      // on a dashboard with no default account.
      clearBootstrapSessionCache();

      notify({
        title: "Database Reset Complete",
        description:
          resData.message ||
          "All user accounts and data have been deleted. Admin accounts were preserved.",
      });

      setPassword("");
      onOpenChange(false);
      if (onSuccess) onSuccess();

      // Trigger full UI refresh
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl space-y-5">
        <button
          type="button"
          onClick={() => {
            setPassword("");
            setErrorMsg("");
            onOpenChange(false);
          }}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              Reset All Database Data
            </h3>
            <p className="text-xs text-muted-foreground">
              Permanent system reset
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive leading-relaxed space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" />
            Warning: Irreversible Action
          </p>
          <p>
            This permanently deletes <strong>every non-admin user account</strong> and signs
            those users out immediately, along with all transactions, outings, expenses,
            settlements, accounts, categories and logs — including your own.
          </p>
          <p className="pt-1">
            Admin accounts and the admin audit log are preserved. Nothing else is.
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-reset-password" className="text-xs font-semibold">
              Enter Admin Password to confirm:
            </Label>
            <Input
              id="admin-reset-password"
              type="password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 text-sm"
              autoFocus
            />
            {errorMsg ? (
              <p className="text-xs font-medium text-destructive pt-1">{errorMsg}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPassword("");
                setErrorMsg("");
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting}
              className="gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting System...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Confirm Reset All Data
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
