"use client";

import { useState } from "react";
import { Shield, KeyRound, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { PRIMARY_ADMIN_EMAIL, isAdminEmail } from "@/lib/admin";
import { useRoleMode } from "@/hooks/useRoleMode";

interface AdminPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ACCEPTED_PINS = [
  "7075",
  "1234",
  "0000",
  process.env.NEXT_PUBLIC_ADMIN_PIN || "7075",
];

export function AdminPinModal({ open, onOpenChange, onSuccess }: AdminPinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { user } = useSupabaseAuth();
  const { setMode } = useRoleMode();

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setIsVerifying(true);

    const cleanedPin = pin.trim();
    if (!cleanedPin) {
      setError("Please enter the Admin PIN.");
      setIsVerifying(false);
      return;
    }

    // Validate PIN
    const isValidPin = ACCEPTED_PINS.includes(cleanedPin);
    if (!isValidPin) {
      setError("Incorrect Admin PIN. Hint: Standard admin PIN is 7075 or 1234.");
      setIsVerifying(false);
      return;
    }

    // Validate email eligibility
    const currentUserEmail = user?.email?.trim().toLowerCase();
    const isAuthorized = isAdminEmail(currentUserEmail) || currentUserEmail === PRIMARY_ADMIN_EMAIL;

    if (!isAuthorized) {
      setError(`PIN verified, but account (${currentUserEmail || "unknown"}) is not authorized. Only ${PRIMARY_ADMIN_EMAIL} is Admin.`);
      setIsVerifying(false);
      return;
    }

    // Success! Unlock Admin Mode
    setMode("admin");
    setIsVerifying(false);
    setPin("");
    setError(null);
    onOpenChange(false);
    if (onSuccess) onSuccess();
  };

  const handleClose = () => {
    setPin("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 rounded-2xl border-amber-500/20 bg-card shadow-2xl">
        <DialogHeader className="flex flex-col items-center text-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-8 ring-amber-500/5 mb-1">
            <Shield className="size-7" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Switch to Admin Panel
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground max-w-xs">
            Admin access is restricted to <span className="font-semibold text-foreground">{PRIMARY_ADMIN_EMAIL}</span>. Please enter the Security PIN to proceed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="admin-pin" className="text-xs font-semibold flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-amber-600 dark:text-amber-400" />
              Enter Admin Security PIN
            </Label>
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="Enter PIN (e.g. 7075 or 1234)"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError(null);
              }}
              className="text-center text-lg tracking-widest font-mono h-11 rounded-xl"
              autoFocus
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              <Lock className="size-3.5 text-muted-foreground shrink-0" />
              <span>Authorized email: <strong className="text-foreground">{PRIMARY_ADMIN_EMAIL}</strong></span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="rounded-xl w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isVerifying || !pin.trim()}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-slate-950 font-semibold w-full sm:w-auto gap-2"
            >
              <CheckCircle2 className="size-4" />
              Unlock Admin Panel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
