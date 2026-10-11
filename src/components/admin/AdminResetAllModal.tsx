"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { clearBootstrapSessionCache } from "@/lib/user-bootstrap";
import { useToast } from "@/providers/toast-provider";

const CONFIRM_PHRASE = "RESET ALL DATA";

type AdminResetAllModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

/**
 * Server-checked: the route requires an admin session, this exact phrase and
 * ADMIN_RESET_PASSWORD (no default — the reset is disabled until it is set).
 */
export function AdminResetAllModal({ open, onOpenChange, onSuccess }: AdminResetAllModalProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const close = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) {
      setPassword("");
      setPhrase("");
      setErrorMsg("");
    }
    onOpenChange(next);
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const response = await fetch("/api/admin/reset-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim(), confirm: phrase.trim() }),
      });
      const resData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(resData.error || `Reset failed (${response.status}).`);

      queryClient.invalidateQueries();
      // The purge emptied this admin's own workspace too; clear the
      // "already bootstrapped" flag so it is re-seeded on reload.
      clearBootstrapSessionCache();
      notify({ title: "Database reset complete", description: resData.message });
      setPassword("");
      setPhrase("");
      onOpenChange(false);
      onSuccess?.();
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset all data?</DialogTitle>
          <DialogDescription>
            Permanently deletes every non-admin account (they are signed out immediately) and all
            remaining app data, including your own transactions. Admin accounts, global settings,
            mail templates and the admin audit log are kept.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>This cannot be undone. Take a database backup in Supabase first.</span>
        </div>
        <form onSubmit={handleReset} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-reset-phrase" className="text-xs">
              Type <code className="rounded bg-muted px-1 font-mono">{CONFIRM_PHRASE}</code>
            </Label>
            <Input
              id="admin-reset-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-reset-password" className="text-xs">
              Reset password (server env ADMIN_RESET_PASSWORD)
            </Label>
            <Input
              id="admin-reset-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
            />
          </div>
          {errorMsg ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errorMsg}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || phrase.trim() !== CONFIRM_PHRASE || !password.trim()}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Reset everything
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
