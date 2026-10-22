"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useSupabaseAuth } from "@/providers/supabase-provider";

export default function DeleteAccountPage() {
  const { user } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Authenticated deletion handler
  const handleAuthenticatedDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmWord !== "DELETE") {
      setStatusMessage({
        type: "error",
        text: 'Please type "DELETE" exactly to confirm account deletion.',
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account.");
      }

      setStatusMessage({
        type: "success",
        text: "Your account and all associated financial records have been permanently deleted.",
      });
      setConfirmWord("");
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Public email request handler (unauthenticated)
  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }

      setStatusMessage({
        type: "success",
        text: data.message || "Your deletion request has been received.",
      });
      setEmail("");
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/privacy"
            className="inline-flex size-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back to Privacy Policy"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Trash2 className="size-4 text-red-500" />
            <span className="text-sm font-bold tracking-tight text-foreground">
              Account Deletion
            </span>
          </div>
          <Link
            href="/auth/sign-in"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400">
              <ShieldAlert className="size-3.5" />
              Google Play User Data Deletion
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              Request Account & Data Deletion
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Under Google Play policies and our core privacy commitments, you have the right to permanently delete your SpentX account and all associated personal and financial data.
            </p>
          </div>

          {/* Feedback banner */}
          {statusMessage && (
            <div
              className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
                statusMessage.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="size-5 shrink-0 text-red-500" />
              )}
              <p className="leading-snug">{statusMessage.text}</p>
            </div>
          )}

          {/* Data Deletion Details */}
          <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-6">
            <h2 className="text-base font-bold text-foreground">
              What happens when your account is deleted?
            </h2>
            <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed text-muted-foreground md:text-sm">
              <li>
                <strong>Financial Records:</strong> All transactions, income entries, expense records, categories, and account balances are permanently deleted.
              </li>
              <li>
                <strong>Planning & Goals:</strong> All savings targets, monthly budgets, and outing splits are permanently erased.
              </li>
              <li>
                <strong>Authentication & Profile:</strong> Your Supabase user account, email address, password hash, and active sessions are permanently deleted.
              </li>
              <li>
                <strong>Device Data:</strong> On your mobile phone, local Hive databases and Keystore entries are wiped.
              </li>
              <li>
                <strong>Legitimate Retention:</strong> Non-personally identifiable administrative audit records (logging that an account deletion occurred) may be retained for up to 90 days to comply with financial and anti-fraud regulations.
              </li>
            </ul>
          </div>

          {/* Deletion Form */}
          {user ? (
            /* Signed-in flow */
            <div className="space-y-5 rounded-2xl border border-red-500/30 bg-card p-6 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  Signed In as {user.email}
                </h2>
                <p className="text-xs text-muted-foreground">
                  To permanently delete this account and all associated cloud data immediately, type{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold text-red-500">
                    DELETE
                  </code>{" "}
                  below.
                </p>
              </div>

              <form onSubmit={handleAuthenticatedDelete} className="space-y-4">
                <div>
                  <label
                    htmlFor="confirm-delete"
                    className="block text-xs font-semibold text-muted-foreground"
                  >
                    Confirmation
                  </label>
                  <input
                    id="confirm-delete"
                    type="text"
                    value={confirmWord}
                    onChange={(e) => setConfirmWord(e.target.value)}
                    placeholder='Type "DELETE"'
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || confirmWord !== "DELETE"}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Deleting Account..." : "Permanently Delete My Account"}
                </button>
              </form>
            </div>
          ) : (
            /* Unauthenticated / Uninstalled App flow */
            <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  Uninstalled the App or Cannot Sign In?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Enter the email address registered with your SpentX account. Our system will record your deletion request and permanently purge all associated data.
                </p>
              </div>

              <form onSubmit={handleEmailRequest} className="space-y-4">
                <div>
                  <label
                    htmlFor="request-email"
                    className="block text-xs font-semibold text-muted-foreground"
                  >
                    Registered Account Email
                  </label>
                  <input
                    id="request-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Submitting Request..." : "Submit Account Deletion Request"}
                </button>
              </form>
            </div>
          )}

          {/* In-App Alternative Reminder */}
          <div className="border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
            Still have the mobile app installed? You can also delete your account directly in the app via{" "}
            <strong>Settings &rarr; Account Actions &rarr; Delete Account</strong>.
          </div>
        </div>
      </main>
    </div>
  );
}
