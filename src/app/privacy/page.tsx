import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Smartphone, Database, Trash2, Key } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — SpentX",
  description:
    "Public Privacy Policy for SpentX. Learn how your data is accessed, processed locally, protected via hardware-backed encryption, and permanently deleted.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-emerald-500/20 selection:text-emerald-500">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/auth/sign-in"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Back to Sign In"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="size-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-foreground">SpentX Privacy</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/delete-account"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-red-500"
            >
              Account Deletion
            </Link>
            <Link
              href="/auth/sign-in"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open App
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <article className="space-y-12">
          {/* Hero Section */}
          <section className="space-y-4">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3.5" />
              Google Play Verified Data Safety
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              Public Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: October 30, 2026 &middot; Effective date: October 30, 2026
            </p>
            <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
              SpentX provides a modern personal finance application built to help you track spending, manage accounts, and grow your wealth. We believe your financial data belongs exclusively to you. This policy outlines our exact data practices, on-device parsing architecture, and deletion rights.
            </p>
          </section>

          {/* Core Principles Grid */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <Smartphone className="size-5" />
              </div>
              <h2 className="text-sm font-bold text-foreground">On-Device Parsing</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                SMS messages are processed on your phone. Your real SMS is never uploaded automatically; only a masked copy with fake values is shared to improve detection, and you can turn it off.
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <Lock className="size-5" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Hardware Encryption</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Device storage is encrypted using AES with hardware-backed keys in the Android Keystore.
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <Trash2 className="size-5" />
              </div>
              <h2 className="text-sm font-bold text-foreground">User Deletion Rights</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Permanently purge your account, financial records, and credentials at any time in-app or on the web.
              </p>
            </div>
          </section>

          {/* Section 1: Information Collected */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              1. Information We Collect and Process
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong>Account Credentials:</strong> Your email address and authenticated user ID via Supabase Auth for login, password recovery, and secure synchronization.
              </p>
              <p>
                <strong>Financial Ledger Data:</strong> Transaction entries (amounts, categories, merchants, payment channels like UPI or card, masked account numbers like <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">*1234</code>, and transaction dates) created manually or detected on-device.
              </p>
              <p>
                <strong>Planning & Wealth:</strong> Account nicknames, opening balances, monthly budget caps, savings targets, and outing split logs.
              </p>
              <p>
                <strong>Masked SMS Formats & Device ID:</strong> Masked template requests (fake values only) and a one-way hash of a random app-generated device ID, used only to improve SMS detection and apply daily limits. See section 2.
              </p>
            </div>
          </section>

          {/* Section 2: SMS & Notification Access */}
          <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-6 md:p-8">
            <div className="flex items-center gap-2.5">
              <Smartphone className="size-5 text-emerald-500" />
              <h2 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                2. SMS and Notification Access (Android)
              </h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                SpentX utilizes <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">RECEIVE_SMS</code> and <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">READ_SMS</code> exclusively under the <strong>Google Play Money Management Exception</strong>.
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong>Financial Messages Only:</strong> Only incoming transactional alerts from registered financial institutions (banks, credit card issuers, UPI apps) are read to update your ledger balances.
                </li>
                <li>
                  <strong>OTPs & Personal SMS Discarded:</strong> One-Time Passwords (OTPs), 2-factor authentication codes, personal chats, and non-financial messages are discarded immediately. They are never written to any database, never cached, and never logged.
                </li>
                <li>
                  <strong>Zero Raw SMS on Completed Transactions:</strong> Once a transaction is parsed or confirmed, raw message text is permanently stripped. Only structured financial metadata and a one-way cryptographic SHA-256 hash (used solely for duplicate prevention) are retained.
                </li>
                <li>
                  <strong>Ephemeral Review Retention:</strong> Unverified or ignored review items retain locally encrypted text for up to 30 days before being automatically purged by automated retention jobs.
                </li>
                <li>
                  <strong>Template Requests (On by Default):</strong> When SpentX finds a bank SMS format it doesn&apos;t recognise yet, it sends us a masked copy where every personal value (amounts, account numbers, references, UPI IDs, names, balances, dates) is replaced with a fake value of the same shape. Bank name, sender ID and wording are kept. Your real SMS is never sent automatically. This works offline too, uses a hashed random device ID to apply daily limits, and can be turned off anytime in Settings. Reviewed requests are deleted after 30 days without new activity.
                </li>
                <li>
                  <strong>Send to Support (Only When You Tap):</strong> If you tap <em>Send this SMS to SpentX support</em>, that SMS is sent to our support team only to fix its detection. It is visible only to SpentX admins and deleted automatically after 30 days.
                </li>
                <li>
                  <strong>Notification Listener:</strong> Optional. SpentX strictly filters notifications to process only user-selected payment or banking apps (e.g., Google Pay, PhonePe, Paytm). Notifications from all other applications are ignored immediately.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 3: Data Security */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              3. Data Storage & Security Safeguards
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Key className="size-4 text-emerald-500" />
                  PIN & Brute-Force Lockout
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  PIN authentication uses salted PBKDF2-SHA256 (100k+ iterations). Failed attempts trigger escalating delays after 5 attempts and lockout after 10.
                </p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Database className="size-4 text-emerald-500" />
                  Postgres Row-Level Security
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Database queries are protected by Row-Level Security (RLS). Every read and write is scoped strictly to your authenticated session ID.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Deletion Rights */}
          <section className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              4. Account & Data Deletion
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You maintain complete ownership of your data and can permanently delete your account and all records at any time:
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1 rounded-xl border border-border/60 bg-background/80 p-4">
                <h3 className="text-sm font-bold text-foreground">In-App Deletion</h3>
                <p className="text-xs text-muted-foreground">
                  Open SpentX &rarr; Settings &rarr; Account Actions &rarr; Tap <strong>Delete Account</strong>. Confirm your PIN or biometrics to immediately wipe cloud records and local storage.
                </p>
              </div>
              <div className="space-y-1 rounded-xl border border-border/60 bg-background/80 p-4">
                <h3 className="text-sm font-bold text-foreground">Web Deletion Portal</h3>
                <p className="text-xs text-muted-foreground">
                  If you have uninstalled the app, visit{" "}
                  <Link href="/delete-account" className="font-semibold text-primary underline">
                    spentx.app/delete-account
                  </Link>{" "}
                  to execute or request complete deletion of your account and records.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Contact */}
          <section className="space-y-3 border-t border-border/40 pt-8">
            <h2 className="text-lg font-bold text-foreground">5. Privacy Contact</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              For questions regarding this policy or data safety requests, email{" "}
              <a href="mailto:privacy@spentx.app" className="font-semibold text-primary">
                privacy@spentx.app
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
