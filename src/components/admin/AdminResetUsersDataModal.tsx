"use client";

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
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
import { adminResetAllUsersData } from "@/lib/admin-api";
import { clearBootstrapSessionCache } from "@/lib/user-bootstrap";
import { useToast } from "@/providers/toast-provider";

const CONFIRM_PHRASE = "RESET ALL USERS DATA";

type AdminResetUsersDataModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function AdminResetUsersDataModal({
  open,
  onOpenChange,
  onSuccess,
}: AdminResetUsersDataModalProps) {
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
      await adminResetAllUsersData(password.trim());

      queryClient.invalidateQueries();
      clearBootstrapSessionCache();
      notify({
        title: "User data reset complete",
        description: "All non-admin users had their data cleared and were reset to the onboarding screen. Credentials were kept.",
      });
      setPassword("");
      setPhrase("");
      onOpenChange(false);
      onSuccess?.();
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
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-amber-500" />
            Reset all users to onboarding?
          </DialogTitle>
          <DialogDescription>
            Clears all transaction and account data for all regular (non-admin) users and resets their state to the first-time onboarding screen.
            <br className="mt-1" />
            <strong className="text-foreground">Their login credentials (email & password) are preserved.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>All existing user ledger data will be deleted. Make sure you have a database backup first.</span>
        </div>

        <form onSubmit={handleReset} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-reset-users-phrase" className="text-xs">
              Type <code className="rounded bg-muted px-1 font-mono">{CONFIRM_PHRASE}</code>
            </Label>
            <Input
              id="admin-reset-users-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="admin-reset-users-password" className="text-xs">
              Admin confirmation password
            </Label>
            <Input
              id="admin-reset-users-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter ADMIN_RESET_PASSWORD"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>

          {errorMsg ? (
            <p className="text-xs font-medium text-destructive">{errorMsg}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || phrase.trim() !== CONFIRM_PHRASE || !password.trim()}
              className="gap-1.5"
            >
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Reset All Users to Onboarding
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
