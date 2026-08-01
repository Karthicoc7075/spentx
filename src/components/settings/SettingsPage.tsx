"use client";

import {
  Camera,
  Monitor,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
  User,
  Wallet,
  Layers,
  Settings,
  CreditCard,
  PiggyBank,
  Sparkles,
  Shield,
  Eye,
  RefreshCw,
  Building,
  X,
  AlertTriangle,
  Smartphone,
  Download,
  Upload,
  DatabaseBackup,
  Users,
  RotateCcw,
  SlidersHorizontal,
  Bell,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { ContributorsTab } from "@/components/settings/ContributorsTab";
import { SharingTab } from "@/components/settings/SharingTab";
import { SmsRulesAdminPanel } from "@/components/settings/SmsRulesAdminPanel";
import { useTransactions } from "@/hooks/useTransactions";
import { useDeletedOutings } from "@/hooks/useDeletedOutings";
import { formatOutingDates } from "@/lib/outing-display";
import {
  isFamilyPurposeName,
  isPersonalPurposeRef,
} from "@/lib/purposes";
import { buildOpeningBalanceTransaction, OPENING_BALANCE_CATEGORY } from "@/lib/wealth";
import { useViewerAccess } from "@/providers/viewer-provider";
import { isAdminUser } from "@/lib/admin";
import { runAccountBackup } from "@/lib/backup-actions";
import { syncSettingsCache, mergeCategories } from "@/lib/settings-data";
import { cacheKeys, readQueryCache } from "@/lib/query-cache";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { queryKeys } from "@/lib/query-keys";
import {
  defaultAppConfig,
  defaultCategories,
  defaultPurposes,
  defaultStarterAccounts,
  defaultUserSettings,
  defaultNotificationPreferences,
} from "@/lib/mock-data";
import {
  fetchAccounts,
  fetchAppConfig,
  fetchCustomCategories,
  fetchDefaultCategories,
  fetchPurposes,
  fetchUserProfile,
  fetchUserSettings,
  saveAccount,
  saveAppConfig,
  saveCustomCategory,
  savePurpose,
  saveUserProfile,
  saveUserSettings,
  deleteAccount,
  deleteCustomCategory,
  deletePurpose,
  ensureUserProfile,
  gatherAllUserData,
  isValidBackupFile,
  buildBackupZipBytes,
  parseBackupZipBytes,
  restoreBackupData,
  sendPasswordReset,
  requestMobileAppPinReset,
  type SpentXBackup,
} from "@/lib/supabase-data";
import { getTodayCalendarDate } from "@/lib/date-filters";
import {
  formatCurrency,
  setGlobalPrivateMode,
} from "@/lib/utils";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useTheme } from "@/providers/theme-provider";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/transaction-ui";
import { updateDefaultCategories } from "@/lib/data-rebuild";
import type {
  Account,
  AppConfig,
  Category,
  DefaultCategory,
  Purpose,
  ThemePreference,
  UserProfile,
  UserSettings,
  NotificationPreferences,
} from "@/types";

const sidebarItems = [
  { name: "Profile", icon: User },
  { name: "Preferences", icon: Settings },
  { name: "Purposes", icon: PiggyBank },
  { name: "Sharing", icon: Eye },
  { name: "Contributors", icon: Users },
  { name: "Categories", icon: Layers },
  { name: "Accounts", icon: Wallet },
  { name: "Security", icon: Shield },
  { name: "Data & Backups", icon: DatabaseBackup },
  { name: "Global Settings", icon: Shield, adminOnly: true },
  { name: "SMS Rules", icon: Smartphone, adminOnly: true },
];

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces and crisp contrast.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-light friendly navy interface.",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Match your device appearance.",
    icon: Monitor,
  },
];

export function SettingsPage() {
  const { user, isConfigured, isLoading: authLoading } = useSupabaseAuth();
  const { isReadOnlyViewer } = useViewerAccess();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const {
    transactions,
    isLoading: transactionsLoading,
    addTransaction,
  } = useTransactions();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [activeSection, setActiveSection] = useState(sidebarItems[0].name);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaultCategoryList, setDefaultCategoryList] = useState<Category[]>(defaultCategories);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig>(defaultAppConfig);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profilePhone, setProfilePhone] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResettingAppPin, setIsResettingAppPin] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const { deletedOutings, restore: restoreDeletedOuting } = useDeletedOutings();
  const [restoringOutingId, setRestoringOutingId] = useState<string | null>(null);
  const [pendingRestoreBackup, setPendingRestoreBackup] = useState<SpentXBackup | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("spentx-last-auto-backup"),
  );
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = isAdminUser(user, profile);
  const visibleSidebarItems = sidebarItems.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  // Allow deep-linking a settings section (e.g. /settings?section=Global+Settings
  // from the /admin portal). Runs post-mount to avoid SSR hydration mismatch;
  // admin-only sections stay gated by the isAdmin checks at render time.
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (section && sidebarItems.some((item) => item.name === section)) {
      setActiveSection(section);
    }
  }, []);

  // Popup Modals state hooks
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "bank" as Account["type"],
    last4: "",
    openingBalance: 0,
    openingBalanceDate: getTodayCalendarDate(),
  });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "expense" as Category["type"],
    color: "#10b981",
    isInvestment: false,
  });

  const [purposeModalOpen, setPurposeModalOpen] = useState(false);
  const [purposeForm, setPurposeForm] = useState({ name: "", color: "#10b981" });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; type: "account" | "category" | "purpose" } | null>(null);

  useEffect(() => {
    if (isConfigured && authLoading) return;

    if (isConfigured && !user?.id && !authLoading) {
      setAccounts([
        { id: "acc-cash", name: "Cash", type: "cash", openingBalance: 10000 },
        { id: "acc-bank-1", name: "HDFC Bank", type: "bank", last4: "1234", openingBalance: 50000 }
      ]);
      setDefaultCategoryList(defaultCategories);
      setCustomCategories([]);
      setPurposes(defaultPurposes);
      setSettings(defaultUserSettings);
      setAppConfig(defaultAppConfig);
      setDataLoading(false);
      return;
    }

    let active = true;
    
    // Quick load from cache to prevent blank screens
    const cachedAccounts = readQueryCache<Account[]>(user?.id, cacheKeys.accounts);
    const cachedCategories = readQueryCache<Category[]>(user?.id, cacheKeys.categories);
    const cachedPurposes = readQueryCache<Purpose[]>(user?.id, cacheKeys.purposes);

    if (cachedAccounts && cachedCategories && cachedPurposes) {
      setAccounts(cachedAccounts.filter((account) => account.isActive !== false));
      setDefaultCategoryList(cachedCategories.filter((c) => c.isDefault));
      setCustomCategories(
        cachedCategories.filter((c) => !c.isDefault && c.isActive !== false),
      );
      setPurposes(cachedPurposes);
      setDataLoading(false);
    } else {
      setDataLoading(true);
    }

    Promise.all([
      fetchAccounts(user?.id),
      fetchDefaultCategories(),
      fetchCustomCategories(user?.id),
      fetchPurposes(user?.id),
      fetchUserSettings(user?.id),
      fetchUserProfile(user?.id),
      fetchAppConfig(),
      ensureUserProfile(user?.id, {
        name: user?.name ?? "SpentX User",
        email: user?.email ?? "",
        photoURL: user?.photoUrl,
      }),
    ])
      .then(async ([
        nextAccounts,
        nextDefaults,
        nextCustom,
        nextPurposes,
        nextSettings,
        nextProfile,
        nextAppConfig,
        ensuredProfile,
      ]) => {
        if (!active) return;

        let finalAccounts = nextAccounts;
        let finalPurposes = nextPurposes;
        const resolvedProfile = nextProfile ?? ensuredProfile;

        if (nextAccounts.length === 0 && user?.id) {
          finalAccounts = defaultStarterAccounts;
          await Promise.all(
            defaultStarterAccounts.map((acc) => saveAccount(user.id, acc)),
          );
        }

        if (nextPurposes.length === 0 && user?.id) {
          finalPurposes = defaultPurposes;
          await Promise.all(
            defaultPurposes.map((purp) => savePurpose(user.id, purp)),
          );
        } else if (user?.id) {
          // Mobile parity: ensure Family exists (toggleable). Personal always present.
          const hasFamily = finalPurposes.some((p) =>
            isFamilyPurposeName(p.name),
          );
          if (!hasFamily) {
            const family: Purpose = {
              id: crypto.randomUUID(),
              name: "Family",
              color: "#14B8A6",
              isDefault: false,
              canDelete: false,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            await savePurpose(user.id, family);
            finalPurposes = [...finalPurposes, family];
          }
        }

        const mergedCategories = mergeCategories(nextDefaults, nextCustom);

        setAccounts(finalAccounts.filter((account) => account.isActive !== false));
        setDefaultCategoryList(nextDefaults);
        setCustomCategories(nextCustom.filter((category) => category.isActive !== false));
        setPurposes(finalPurposes);
        setSettings(nextSettings);
        setProfile(resolvedProfile);
        setAppConfig(nextAppConfig);
        if (resolvedProfile) {
          setProfileName(resolvedProfile.name);
          setProfilePhone(resolvedProfile.phone ?? "");
        }
        syncSettingsCache(queryClient, user?.id, {
          accounts: finalAccounts,
          categories: mergedCategories,
          purposes: finalPurposes,
        });
      })
      .catch((err) => {
        console.error("Failed to load settings data", err);
        notify({ title: "Sync Error", description: "Failed to sync settings with database." });
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authLoading, isConfigured, queryClient, user?.id]);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  // One-time backfill: accounts created before opening balances were tracked
  // as ledger transactions get their missing "Opening Balance" entry created
  // here. Runs once per mount — the existence check against `transactions`
  // (not just this ref) is what actually keeps it idempotent across reloads.
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (!user?.id || dataLoading || transactionsLoading || backfillRanRef.current) {
      return;
    }
    backfillRanRef.current = true;

    const missingBackfill = accounts.filter(
      (account) =>
        account.openingBalance > 0 &&
        !transactions.some(
          (transaction) =>
            (transaction.accountName ?? transaction.account) === account.name &&
            transaction.category === OPENING_BALANCE_CATEGORY,
        ),
    );

    if (missingBackfill.length === 0) return;

    Promise.all(
      missingBackfill.map((account) =>
        addTransaction(buildOpeningBalanceTransaction(account)),
      ),
    ).catch((error) => {
      console.error("Failed to backfill opening balance transactions", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dataLoading, transactionsLoading]);

  useEffect(() => {
    setSettings((current) =>
      current.theme === theme ? current : { ...current, theme },
    );
  }, [theme]);

  const totalOpeningBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.openingBalance, 0),
    [accounts],
  );

  async function handleAddAccount() {
    if (!user?.id) {
      notify({
        title: "Sign in required",
        description: "Sign in to save accounts to your workspace.",
        variant: "destructive",
      });
      return;
    }
    if (!accountForm.name.trim()) {
      notify({ title: "Name required", description: "Account name cannot be empty." });
      return;
    }
    const bankCount = accounts.filter((a) => a.type === "bank").length;
    if (bankCount >= (appConfig.maxAccountsLimit ?? 10)) {
      notify({
        title: "Limit reached",
        description: `Maximum of ${appConfig.maxAccountsLimit ?? 10} bank accounts allowed.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const openingBalanceDate =
      accountForm.openingBalanceDate || getTodayCalendarDate();
    const account: Account = {
      id: crypto.randomUUID(),
      name: accountForm.name.trim(),
      type: "bank", // Only Bank accounts can be created
      last4: accountForm.last4.trim() || "0000",
      openingBalance: accountForm.openingBalance,
      openingBalanceDate,
      createdAt: now,
      isActive: true,
    };
    const previousAccounts = accounts;
    const nextAccounts = [...accounts, account];

    try {
      await saveAccount(user.id, account);
      setAccounts(nextAccounts);
      syncSettingsCache(queryClient, user.id, { accounts: nextAccounts });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.accounts(user.id),
      });
      setAccountModalOpen(false);
      setAccountForm({
        name: "",
        type: "bank",
        last4: "",
        openingBalance: 0,
        openingBalanceDate: getTodayCalendarDate(),
      });
      notify({ title: "Account added" });

      if (account.openingBalance > 0) {
        try {
          await addTransaction(buildOpeningBalanceTransaction(account));
        } catch (transactionError) {
          console.error(
            "Failed to record opening balance transaction",
            transactionError,
          );
        }
      }
    } catch (error) {
      setAccounts(previousAccounts);
      notify({
        title: "Couldn't save account",
        description:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  async function handleAddCategory() {
    if (!categoryForm.name.trim()) {
      notify({ title: "Name required", description: "Category name cannot be empty." });
      return;
    }
    setCategoryModalOpen(false);
    const category: Category = {
      id: crypto.randomUUID(),
      name: categoryForm.name.trim(),
      type: categoryForm.type,
      color: categoryForm.color,
      isInvestment: categoryForm.isInvestment,
    };
    const nextCustom = [...customCategories, category];
    setCustomCategories(nextCustom);
    await saveCustomCategory(user?.id, category);
    syncSettingsCache(queryClient, user?.id, {
      categories: mergeCategories(defaultCategoryList, nextCustom),
    });
    notify({ title: "Category added" });
  }

  async function handleAddPurpose() {
    if (!purposeForm.name.trim()) {
      notify({ title: "Name required", description: "Purpose name cannot be empty." });
      return;
    }
    if (purposes.length >= (appConfig.maxPurposesLimit ?? 5)) {
      notify({
        title: "Limit reached",
        description: `Maximum of ${appConfig.maxPurposesLimit ?? 5} purposes allowed.`,
      });
      return;
    }

    setPurposeModalOpen(false);
    const purpose: Purpose = {
      id: crypto.randomUUID(),
      name: purposeForm.name.trim(),
      color: purposeForm.color,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const nextPurposes = [...purposes, purpose];
    setPurposes(nextPurposes);
    await savePurpose(user?.id, purpose);
    syncSettingsCache(queryClient, user?.id, { purposes: nextPurposes });
    notify({ title: "Purpose added" });
  }

  function triggerDeletePrompt(id: string, name: string, type: "account" | "category" | "purpose") {
    if (type === "account") {
      const account = accounts.find((a) => a.id === id);
      if (account) {
        if (account.type === "cash") {
          notify({ title: "Delete blocked", description: "The default Cash account cannot be deleted." });
          return;
        }
        const bankCount = accounts.filter((a) => a.type === "bank").length;
        if (account.type === "bank" && bankCount <= 1) {
          notify({ title: "Delete blocked", description: "You must keep at least one bank account." });
          return;
        }
      }
    } else if (type === "purpose") {
      if (name.toLowerCase() === "personal") {
        notify({ title: "Delete blocked", description: "The default Personal purpose cannot be deleted." });
        return;
      }
      if (isFamilyPurposeName(name)) {
        notify({
          title: "Delete blocked",
          description: "Turn Family off with the switch instead of deleting it.",
        });
        return;
      }
    } else if (type === "category") {
      if (defaultCategoryList.some((category) => category.id === id)) {
        notify({ title: "Delete blocked", description: "Default categories cannot be deleted." });
        return;
      }
    }

    setItemToDelete({ id, name, type });
    setDeleteConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    if (!itemToDelete) return;
    const { id, type } = itemToDelete;

    setDeleteConfirmOpen(false);
    setItemToDelete(null);
    notify({
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully.`,
    });

    if (type === "account") {
      const nextAccounts = accounts.filter((item) => item.id !== id);
      setAccounts(nextAccounts);
      try {
        await deleteAccount(user?.id, id);
        syncSettingsCache(queryClient, user?.id, { accounts: nextAccounts });
        await invalidateFinancialData(queryClient, user?.id);
      } catch (err) {
        console.error("Failed to delete account", err);
      }
    } else if (type === "category") {
      const nextCustom = customCategories.filter((item) => item.id !== id);
      setCustomCategories(nextCustom);
      try {
        await deleteCustomCategory(user?.id, id);
        syncSettingsCache(queryClient, user?.id, {
          categories: mergeCategories(defaultCategoryList, nextCustom),
        });
      } catch (err) {
        console.error("Failed to delete category", err);
      }
    } else if (type === "purpose") {
      const nextPurposes = purposes.map((item) =>
        item.id === id ? { ...item, isActive: false } : item,
      );
      setPurposes(nextPurposes);
      try {
        await deletePurpose(user?.id, id);
        syncSettingsCache(queryClient, user?.id, { purposes: nextPurposes });
      } catch (err) {
        console.error("Failed to delete purpose", err);
      }
    }
  }

  async function persistSettings(nextSettings = settings) {
    await saveUserSettings(user?.id, nextSettings);
    notify({ title: "Settings saved" });
  }

  function updateNotificationPref(key: keyof NotificationPreferences, value: boolean) {
    const currentPrefs = settings.notificationPreferences ?? defaultNotificationPreferences;
    const nextPrefs = { ...currentPrefs, [key]: value };
    const nextSettings = { ...settings, notificationPreferences: nextPrefs };
    setSettings(nextSettings);
    void persistSettings(nextSettings);
  }

  // FIRESTORE_REBUILD_SPEC Step 9 — local download is now the same ZIP that is
  // uploaded to Storage (one JSON per collection + manifest.json + version.json).
  function downloadBackupZip(backup: SpentXBackup) {
    const bytes = buildBackupZipBytes(backup);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spentx-backup-${backup.exportDate.slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleBackupNow() {
    if (!user?.id) return;
    setIsBackingUp(true);
    try {
      const exportDate = await runAccountBackup(user.id);
      setLastBackupAt(exportDate);
      notify({ title: "Backup created", description: "Saved to your device." });
    } catch {
      notify({ title: "Backup failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestoreOuting(outingId: string, outingName: string) {
    setRestoringOutingId(outingId);
    try {
      await restoreDeletedOuting(outingId);
      notify({
        title: "Outing restored",
        description: `${outingName} and its linked transactions are back.`,
      });
    } catch {
      notify({ title: "Couldn't restore outing", variant: "destructive" });
    } finally {
      setRestoringOutingId(null);
    }
  }

  async function handleDownloadLatest() {
    if (!user?.id) return;
    setIsBackingUp(true);
    try {
      const backup = await gatherAllUserData(user.id);
      downloadBackupZip(backup);
    } catch {
      notify({ title: "Couldn't prepare backup", variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  }

  function handleRestoreFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const invalid = () =>
      notify({
        title: "This file is not a valid SpentX backup",
        variant: "destructive",
      });

    // FIRESTORE_REBUILD_SPEC Step 9 — accept the new ZIP format (validate
    // manifest.json + schemaVersion), falling back to legacy JSON files.
    const isZip = file.name.toLowerCase().endsWith(".zip");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let parsed: SpentXBackup | null = null;
        if (isZip) {
          parsed = parseBackupZipBytes(new Uint8Array(reader.result as ArrayBuffer));
        } else {
          const json = JSON.parse(String(reader.result));
          parsed = isValidBackupFile(json) ? json : null;
        }
        if (!parsed) {
          invalid();
          return;
        }
        setPendingRestoreBackup(parsed);
        setRestoreConfirmText("");
        setRestoreConfirmOpen(true);
      } catch {
        invalid();
      }
    };
    if (isZip) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  async function handleConfirmRestore() {
    if (!user?.id || !pendingRestoreBackup) return;
    setIsRestoring(true);
    try {
      const safetyBackup = await gatherAllUserData(user.id);
      downloadBackupZip(safetyBackup);
      await restoreBackupData(user.id, pendingRestoreBackup);
      notify({
        title: "Data restored",
        description: `Restored from your backup dated ${new Date(
          pendingRestoreBackup.exportDate,
        ).toLocaleDateString("en-IN")}.`,
      });
      setRestoreConfirmOpen(false);
      setPendingRestoreBackup(null);
      await queryClient.invalidateQueries();
    } catch {
      notify({
        title: "Restore failed",
        description: "Some records may not have been written. Check your data before continuing.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!user?.email) return;

    setIsSendingReset(true);
    try {
      await sendPasswordReset(user.email);
      notify({
        title: "Reset email sent",
        description: `Check ${user.email} for a link to reset your password.`,
      });
    } catch {
      notify({
        title: "Couldn't send reset email",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleResetMobileAppPin() {
    if (!user?.id || isReadOnlyViewer) return;
    setIsResettingAppPin(true);
    try {
      await requestMobileAppPinReset(user.id);
      notify({
        title: "Mobile PIN reset requested",
        description:
          "Open the SpentX app online (same account). The old PIN is cleared and you’ll set a new 4-digit PIN. The PIN itself is never stored on the server.",
      });
    } catch {
      notify({
        title: "Couldn't reset mobile PIN",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsResettingAppPin(false);
    }
  }

  async function handleSaveProfile() {
    if (!user?.id) {
      notify({ title: "Profile saved" });
      return;
    }

    const nextProfile: UserProfile = {
      uid: user.id,
      name: profileName.trim() || "SpentX User",
      email: user.email,
      photoURL: profile?.photoURL ?? user.photoUrl,
      phone: profilePhone.trim(),
      joinedAt: profile?.joinedAt ?? new Date().toISOString(),
      role: profile?.role ?? "user",
    };

    // FIRESTORE_REBUILD_SPEC Step 8.1 — optimistic save. Update local state and
    // the cached user object immediately so the UI never blocks on the network
    // (or any downstream auth-provider re-sync); fire the Supabase write in the
    // background and toast when it resolves.
    setProfile(nextProfile);
    void saveUserProfile(user.id, nextProfile)
      .then(() => notify({ title: "Profile saved" }))
      .catch(() =>
        notify({ title: "Profile save failed", description: "Please try again." }),
      );
  }

  async function handleSaveAppConfig() {
    await saveAppConfig(appConfig);
    notify({ title: "Global settings saved" });
  }

  function getAccountIcon(type: Account["type"]) {
    switch (type) {
      case "bank":
        return Building;
      case "credit":
        return CreditCard;
      case "cash":
        return PiggyBank;
      default:
        return Wallet;
    }
  }

  if (dataLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-1.5 border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Manage profile details, accounts, categories, and sync preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        
        {/* Navigation Sidebar */}
        <aside className="sx-surface h-fit space-y-1 p-2.5">
          {visibleSidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.name;
            return (
              <button
                key={item.name}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-xl px-3.5 text-left text-xs font-semibold cursor-pointer transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                type="button"
                onClick={() => setActiveSection(item.name)}
              >
                <Icon className="size-4 shrink-0" />
                {item.name}
              </button>
            );
          })}
        </aside>

        {/* Configurations View Area */}
        <div className="grid gap-6 min-w-0">
          
          {/* PROFILE SECTION */}
          {activeSection === "Profile" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Profile Settings</CardTitle>
                <CardDescription className="text-xs">Adjust your personal identity configurations.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-6">
                <div className="flex items-center gap-5">
                  <div className="relative group">
                    <Avatar className="size-16 border-2 border-emerald-500/20 bg-muted">
                      <AvatarFallback className="font-bold text-foreground">SX</AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Camera className="size-4 text-white" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-foreground">Avatar Photograph</p>
                    <p className="text-[10px] text-muted-foreground">PNG or JPG formats up to 5MB.</p>
                  </div>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">
                    <Input
                      className="h-10 border-input bg-background"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <Input 
                      className="h-10 border-input bg-muted/60" 
                      disabled 
                      value={user?.email ?? ""} 
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      className="h-10 border-input bg-background"
                      placeholder="+91 98765 43210"
                      value={profilePhone}
                      onChange={(event) => setProfilePhone(event.target.value)}
                    />
                  </Field>
                  <Field label="Joined">
                    <Input
                      className="h-10 border-input bg-muted/60"
                      disabled
                      value={
                        profile?.joinedAt
                          ? new Date(profile.joinedAt).toLocaleDateString("en-IN")
                          : "—"
                      }
                    />
                  </Field>
                </div>

                <Button 
                  className="w-fit h-10 font-bold bg-foreground text-white hover:bg-muted dark:bg-white dark:text-background dark:hover:bg-muted cursor-pointer"
                  onClick={handleSaveProfile}
                >
                  <Save className="size-4 mr-2" />
                  Save profile
                </Button>

                <Separator className="my-2" />

                {/* 1-Year Session Token Card */}
                <div className="rounded-2xl border border-border/80 bg-muted/20 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-emerald-500" />
                      <h3 className="text-sm font-bold text-foreground">Session Token & 1-Year Validity</h3>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase border border-emerald-500/20">
                      1-Year Persistent Session
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your login session is securely stored in local storage and HTTP cookies with a <strong>1-year (365 days) expiration window</strong>. You remain signed in across restarts until explicit logout.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 text-xs font-mono">
                    <div className="rounded-xl border border-border/60 bg-background p-3">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">
                        Token Persistence Horizon
                      </span>
                      <span className="font-bold text-foreground">365 Days (Auto-Refreshed)</span>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background p-3">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">
                        Local Storage Mechanism
                      </span>
                      <span className="font-bold text-foreground">Browser LocalStorage + Max-Age Cookie</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* ACCOUNT CONFIGURATION */}
          {activeSection === "Accounts" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold">Accounts Registry</CardTitle>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Opening reserves ledger: <span className="font-bold text-emerald-500">{formatCurrency(totalOpeningBalance)}</span>
                  </p>
                </div>
                <Button 
                  onClick={() => {
                    const bankCount = accounts.filter((a) => a.type === "bank").length;
                    if (bankCount >= (appConfig.maxAccountsLimit ?? 10)) {
                      notify({
                        title: "Limit reached",
                        description: `You can only have up to ${appConfig.maxAccountsLimit ?? 10} bank accounts.`,
                      });
                      return;
                    }
                    setAccountForm({
                      name: "",
                      type: "bank",
                      last4: "",
                      openingBalance: 0,
                      openingBalanceDate: getTodayCalendarDate(),
                    });
                    setAccountModalOpen(true);
                  }}
                  className="h-9 font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer text-xs"
                >
                  <Plus className="size-4 mr-1.5" />
                  Add account
                </Button>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="overflow-hidden rounded-2xl border border-border dark:border-border">
                  <Table>
                    <TableHeader className="bg-muted/50 dark:bg-background text-muted-foreground">
                      <TableRow className="border-b border-border dark:border-border">
                        <TableHead className="text-xs font-bold px-4">Account Name</TableHead>
                        <TableHead className="text-xs font-bold px-4">Asset Type</TableHead>
                        <TableHead className="text-xs font-bold px-4">Last 4</TableHead>
                        <TableHead className="text-xs font-bold px-4">Opening balance</TableHead>
                        <TableHead className="text-xs font-bold px-4">Balance from</TableHead>
                        <TableHead className="w-12 px-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border dark:divide-border">
                      {accounts.map((account) => {
                        const TypeIcon = getAccountIcon(account.type);
                        const isCashAccount = account.type === "cash";
                        const isLastBankAccount = account.type === "bank" && accounts.filter((a) => a.type === "bank").length <= 1;
                        const cannotDeleteAccount = isCashAccount || isLastBankAccount;

                        return (
                          <TableRow key={account.id} className="border-b border-border dark:border-border hover:bg-muted/40 dark:hover:bg-white/[0.01]">
                            <TableCell className="px-4 py-3">
                              <Input
                                className="h-9 min-w-[140px] text-xs"
                                value={account.name}
                                disabled={isCashAccount} // Cash account name cannot be edited
                                onChange={(event) =>
                                  setAccounts((current) =>
                                    current.map((item) =>
                                      item.id === account.id
                                        ? { ...item, name: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                onBlur={async () => {
                                  if (account.name.trim()) {
                                    await saveAccount(user?.id, account);
                                    syncSettingsCache(queryClient, user?.id, { accounts });
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <TypeIcon className="size-3.5 text-muted-foreground shrink-0" />
                                <select
                                  className="h-9 w-24 rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground disabled:opacity-75"
                                  value={account.type}
                                  disabled // Existing account types are locked (no wallet and credit, cash stays cash)
                                  onChange={(event) =>
                                    setAccounts((current) =>
                                      current.map((item) =>
                                        item.id === account.id
                                          ? {
                                              ...item,
                                              type: event.target.value as Account["type"],
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value={account.type}>{account.type.toUpperCase()}</option>
                                </select>
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Input
                                className="h-9 w-16 text-center text-xs"
                                maxLength={4}
                                disabled={isCashAccount}
                                value={account.last4 ?? ""}
                                onChange={(event) =>
                                  setAccounts((current) =>
                                    current.map((item) =>
                                      item.id === account.id
                                        ? { ...item, last4: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                onBlur={async () => {
                                  await saveAccount(user?.id, account);
                                  syncSettingsCache(queryClient, user?.id, { accounts });
                                }}
                              />
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {/* Opening balance is only ever asked once, at account
                                  creation — it's now also recorded as a normal ledger
                                  transaction, so it's locked here to avoid re-editing it
                                  out of sync with that transaction. */}
                              <Input
                                className="h-9 w-28 text-xs font-semibold bg-muted/50 text-muted-foreground"
                                inputMode="decimal"
                                value={account.openingBalance}
                                disabled
                              />
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Input
                                className="h-9 w-36 text-xs bg-muted/50 text-muted-foreground"
                                type="date"
                                value={account.openingBalanceDate ?? ""}
                                disabled
                              />
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                                disabled={cannotDeleteAccount}
                                onClick={() => triggerDeletePrompt(account.id, account.name, "account")}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Save accounts button removed as auto-save is enabled on blur */}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "Purposes" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Purposes</CardTitle>
                <CardDescription className="text-xs">
                  Same as mobile: Personal always on, Family can be turned on/off, plus custom purposes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between border-b border-border/60 pb-2 dark:border-border">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Purpose types
                  </h2>
                  <Button
                    disabled={
                      purposes.filter((p) => p.isActive !== false).length >=
                      (appConfig.maxPurposesLimit ?? 5)
                    }
                    onClick={() => {
                      setPurposeForm({ name: "", color: "#10b981" });
                      setPurposeModalOpen(true);
                    }}
                    className="h-8 cursor-pointer text-xs font-bold"
                  >
                    <Plus className="mr-1 size-3.5" /> Add custom
                  </Button>
                </div>
                <div className="grid gap-2">
                  {purposes.map((purpose) => {
                    const isPersonal =
                      purpose.isDefault === true ||
                      isPersonalPurposeRef(purpose.id, purposes) ||
                      purpose.name.trim().toLowerCase() === "personal";
                    const isFamily = isFamilyPurposeName(purpose.name);
                    const isCore = isPersonal || isFamily;
                    const isOn = purpose.isActive !== false;

                    return (
                      <div
                        key={purpose.id}
                        className={cn(
                          "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5",
                          !isOn && "opacity-60",
                        )}
                      >
                        <input
                          className="size-8 cursor-pointer rounded-lg border-0 bg-transparent"
                          type="color"
                          value={purpose.color ?? "#64748b"}
                          onChange={(event) => {
                            const color = event.target.value;
                            setPurposes((current) =>
                              current.map((item) =>
                                item.id === purpose.id
                                  ? { ...item, color }
                                  : item,
                              ),
                            );
                          }}
                          onBlur={async () => {
                            const latest = purposes.find((p) => p.id === purpose.id) ?? purpose;
                            await savePurpose(user?.id, latest);
                            syncSettingsCache(queryClient, user?.id, { purposes });
                          }}
                        />
                        <div className="min-w-0">
                          {isCore ? (
                            <p className="text-sm font-semibold">{purpose.name}</p>
                          ) : (
                            <Input
                              className="h-9 text-xs"
                              value={purpose.name}
                              onChange={(event) =>
                                setPurposes((current) =>
                                  current.map((item) =>
                                    item.id === purpose.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              onBlur={async () => {
                                if (purpose.name.trim()) {
                                  await savePurpose(user?.id, purpose);
                                  syncSettingsCache(queryClient, user?.id, {
                                    purposes,
                                  });
                                }
                              }}
                            />
                          )}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {isPersonal
                              ? "Always on · default"
                              : isFamily
                                ? "Default · turn on/off"
                                : isOn
                                  ? "Custom · active"
                                  : "Custom · off"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isFamily ? (
                            <Switch
                              checked={isOn}
                              onCheckedChange={async (checked) => {
                                const next = {
                                  ...purpose,
                                  isActive: checked,
                                  canDelete: false,
                                  deletedAt: checked
                                    ? undefined
                                    : new Date().toISOString(),
                                  deletedBy: checked ? undefined : user?.id,
                                };
                                const nextPurposes = purposes.map((item) =>
                                  item.id === purpose.id ? next : item,
                                );
                                setPurposes(nextPurposes);
                                await savePurpose(user?.id, next);
                                syncSettingsCache(queryClient, user?.id, {
                                  purposes: nextPurposes,
                                });
                                notify({
                                  title: checked
                                    ? "Family purpose on"
                                    : "Family purpose off",
                                });
                              }}
                            />
                          ) : isPersonal ? (
                            <Badge variant="secondary">On</Badge>
                          ) : (
                            <>
                              <Switch
                                checked={isOn}
                                onCheckedChange={async (checked) => {
                                  const next = {
                                    ...purpose,
                                    isActive: checked,
                                    deletedAt: checked
                                      ? undefined
                                      : new Date().toISOString(),
                                    deletedBy: checked ? undefined : user?.id,
                                  };
                                  const nextPurposes = purposes.map((item) =>
                                    item.id === purpose.id ? next : item,
                                  );
                                  setPurposes(nextPurposes);
                                  await savePurpose(user?.id, next);
                                  syncSettingsCache(queryClient, user?.id, {
                                    purposes: nextPurposes,
                                  });
                                }}
                              />
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="cursor-pointer text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                                onClick={() =>
                                  triggerDeletePrompt(
                                    purpose.id,
                                    purpose.name,
                                    "purpose",
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "Sharing" && !isReadOnlyViewer ? <SharingTab /> : null}

          {activeSection === "Contributors" && !isReadOnlyViewer ? (
            <ContributorsTab />
          ) : null}

          {/* SECURITY */}
          {activeSection === "Security" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Security</CardTitle>
                <CardDescription className="text-xs">
                  Web password and mobile app lock (PIN is never stored on the server).
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-8 p-6">
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <p className="text-xs font-bold text-foreground">Web password</p>
                    <p className="text-[10px] text-muted-foreground">
                      We&apos;ll email a reset link to {user?.email ?? "your account email"}.
                    </p>
                  </div>
                  <Button
                    className="w-fit h-10 font-bold bg-foreground text-white hover:bg-muted dark:bg-white dark:text-background dark:hover:bg-muted cursor-pointer"
                    disabled={!user?.email || isSendingReset}
                    onClick={handleSendPasswordReset}
                  >
                    <RefreshCw className="size-4 mr-2" />
                    {isSendingReset ? "Sending…" : "Send password reset email"}
                  </Button>
                </div>

                <Separator />

                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <p className="text-xs font-bold text-foreground">Mobile app PIN</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      The 4-digit PIN and fingerprint only unlock the app on your phone.
                      The PIN is hashed on the device — it is never saved in the database.
                      If you forgot it, reset here while signed in on the web, then open the
                      app online to set a new PIN.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-fit h-10 font-bold cursor-pointer"
                    disabled={!user?.id || isReadOnlyViewer || isResettingAppPin}
                    onClick={() => void handleResetMobileAppPin()}
                  >
                    <Smartphone className="size-4 mr-2" />
                    {isResettingAppPin ? "Requesting…" : "Reset mobile app PIN"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* DATA & BACKUPS */}
          {activeSection === "Data & Backups" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Data &amp; Backups</CardTitle>
                <CardDescription className="text-xs">
                  Export a full copy of your data, or restore from a previous backup.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-6">
                <div className="grid gap-1 rounded-2xl bg-muted/50 p-4 text-xs">
                  <p className="font-bold text-foreground">Auto backup: Enabled</p>
                  <p className="text-muted-foreground">
                    Last backup:{" "}
                    {lastBackupAt
                      ? new Date(lastBackupAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "Never — runs automatically once a week from the Dashboard."}
                  </p>
                  <p className="text-muted-foreground">Backups kept: last 4 weekly snapshots.</p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Button
                    className="h-10 font-bold bg-foreground text-white hover:bg-muted dark:bg-white dark:text-background dark:hover:bg-muted cursor-pointer"
                    disabled={isBackingUp}
                    onClick={handleBackupNow}
                  >
                    <DatabaseBackup className="size-4 mr-2" />
                    {isBackingUp ? "Backing up…" : "Backup now"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 font-bold cursor-pointer"
                    disabled={isBackingUp}
                    onClick={handleDownloadLatest}
                  >
                    <Download className="size-4 mr-2" />
                    Download latest
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 font-bold cursor-pointer"
                    disabled={isRestoring}
                    onClick={() => restoreFileInputRef.current?.click()}
                  >
                    <Upload className="size-4 mr-2" />
                    Restore
                  </Button>
                  <input
                    ref={restoreFileInputRef}
                    accept="application/zip,.zip,application/json"
                    className="hidden"
                    type="file"
                    onChange={handleRestoreFileSelected}
                  />
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  &ldquo;Backup now&rdquo; saves a JSON copy to your device and to the cloud (once
                  Storage rules are deployed). &ldquo;Restore&rdquo; uploads a backup JSON and
                  writes those records back — your current data is backed up first. This action
                  cannot be undone.
                </p>

                <Separator />

                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">Deleted outings</p>
                    <p className="text-xs text-muted-foreground">
                      Deleting an outing removes it and its linked transactions right away —
                      restore it here anytime.
                    </p>
                  </div>
                  {deletedOutings.length === 0 ? (
                    <p className="rounded-2xl bg-muted/50 p-4 text-xs text-muted-foreground">
                      No deleted outings.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {deletedOutings.map((outing) => (
                        <li
                          key={outing.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {outing.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatOutingDates(outing)}
                              {outing.deletedAt
                                ? ` · Deleted ${new Date(outing.deletedAt).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}`
                                : ""}
                            </p>
                          </div>
                          <Button
                            className="h-9 font-bold"
                            disabled={restoringOutingId === outing.id}
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRestoreOuting(outing.id, outing.name)}
                          >
                            <RotateCcw className="size-4 mr-1.5" />
                            {restoringOutingId === outing.id ? "Restoring…" : "Restore"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* CATEGORIES */}
          {activeSection === "Categories" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Categories</CardTitle>
                <CardDescription className="text-xs">
                  Default categories are shared for all users. Add your own custom categories below.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <h2 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Default Categories
                    </h2>
                    <Badge variant="secondary" className="text-[9px] uppercase">
                      Read only
                    </Badge>
                  </div>
                  <div className="grid gap-2 max-h-[280px] overflow-y-auto pr-1">
                    {defaultCategoryList.map((category) => {
                      const CategoryIcon = getCategoryIcon(category.name);
                      return (
                        <div
                          key={category.id}
                          className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/50/50 px-3 py-2 dark:border-border dark:bg-muted/40"
                        >
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: category.color || "#10b981" }}
                          />
                          <CategoryIcon className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-xs font-medium text-foreground">
                            {category.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[9px] uppercase tracking-wider font-extrabold border-transparent",
                              category.type === "income"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                            )}
                          >
                            {category.type}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="border-border/60" />

                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <h2 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      My Custom Categories
                    </h2>
                    <Button
                      onClick={() => {
                        if (customCategories.length >= appConfig.maxCategoryLimit) {
                          notify({
                            title: "Limit reached",
                            description: `Maximum of ${appConfig.maxCategoryLimit} custom categories allowed.`,
                          });
                          return;
                        }
                        setCategoryForm({
                          name: "",
                          type: "expense",
                          color: "#10b981",
                          isInvestment: false,
                        });
                        setCategoryModalOpen(true);
                      }}
                      className="h-8 text-xs font-bold cursor-pointer"
                    >
                      <Plus className="size-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  {customCategories.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No custom categories yet. Tap Add to create one.
                    </p>
                  ) : (
                    <div className="grid gap-2 max-h-[280px] overflow-y-auto pr-1">
                      {customCategories.map((category) => {
                        const CategoryIcon = getCategoryIcon(category.name);
                        return (
                          <div
                            key={category.id}
                            className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center"
                          >
                            <div className="relative">
                              <span
                                className="absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full"
                                style={{ backgroundColor: category.color || "#10b981" }}
                              />
                              <CategoryIcon className="absolute left-6.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground shrink-0" />
                              <Input
                                className="h-9 pl-12 text-xs"
                                value={category.name}
                                onChange={(event) =>
                                  setCustomCategories((current) =>
                                    current.map((item) =>
                                      item.id === category.id
                                        ? { ...item, name: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                onBlur={async () => {
                                  if (category.name.trim()) {
                                    await saveCustomCategory(user?.id, category);
                                    syncSettingsCache(queryClient, user?.id, {
                                      categories: mergeCategories(defaultCategoryList, customCategories),
                                    });
                                  }
                                }}
                              />
                            </div>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-9 px-2 text-[9px] uppercase tracking-wider font-extrabold flex items-center justify-center w-16 border-transparent",
                                category.type === "income"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                              )}
                            >
                              {category.type}
                            </Badge>
                            {category.type === "expense" ? (
                              <label
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                                title="Mark as Investment (counts toward Wealth's Total Investment)"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 cursor-pointer accent-primary"
                                  checked={category.isInvestment ?? false}
                                  onChange={async (event) => {
                                    const checked = event.target.checked;
                                    const updated = {
                                      ...category,
                                      isInvestment: checked,
                                    };
                                    const nextCustom = customCategories.map((item) =>
                                      item.id === category.id ? updated : item,
                                    );
                                    setCustomCategories(nextCustom);
                                    await saveCustomCategory(user?.id, updated);
                                    syncSettingsCache(queryClient, user?.id, {
                                      categories: mergeCategories(
                                        defaultCategoryList,
                                        nextCustom,
                                      ),
                                    });
                                  }}
                                />
                              </label>
                            ) : (
                              <span className="h-9 w-9" />
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                              onClick={() =>
                                triggerDeletePrompt(category.id, category.name, "category")
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Save custom categories button removed as auto-save is enabled on blur */}
              </CardContent>
            </Card>
          ) : null}

          {/* PREFERENCES */}
          {activeSection === "Preferences" ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Preferences Settings</CardTitle>
                <CardDescription className="text-xs">Adjust configurations for appearance and automation features.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500" />
                    <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Appearance Mode</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = theme === option.value;

                      return (
                        <button
                          key={option.value}
                          className={cn(
                            "rounded-2xl border p-4 text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]",
                            isActive
                              ? "border-emerald-500 bg-emerald-500/[0.04] dark:border-emerald-500/60"
                              : "border-border bg-white hover:bg-muted dark:border-border dark:bg-background dark:hover:bg-foreground/90",
                          )}
                          type="button"
                          onClick={() => {
                            setTheme(option.value);
                            const nextSettings = {
                              ...settings,
                              theme: option.value,
                            };
                            setSettings(nextSettings);
                            persistSettings(nextSettings);
                          }}
                        >
                          <span className={cn(
                            "flex size-8 items-center justify-center rounded-lg mb-3.5",
                            isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                          )}>
                            <Icon className="size-4" />
                          </span>
                          <p className="text-xs font-bold text-foreground">{option.label}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground leading-normal">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator className="border-border/60" />
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Default payment account">
                    <select
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground"
                      value={accounts.find((account) => account.isDefault)?.name ?? ""}
                      onChange={async (event) => {
                        const selectedName = event.target.value;
                        const nextAccounts = accounts.map((account) => ({
                          ...account,
                          isDefault: account.name === selectedName,
                        }));
                        setAccounts(nextAccounts);
                        const selectedAccount = nextAccounts.find(
                          (account) => account.name === selectedName,
                        );
                        if (selectedAccount) {
                          await saveAccount(user?.id, selectedAccount);
                          syncSettingsCache(queryClient, user?.id, { accounts: nextAccounts });
                        }
                      }}
                    >
                      <option value="">Select account</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.name}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Separator className="border-border/60" />

                <PreferenceRow
                  icon={RefreshCw}
                  checked={settings.notifications}
                  description="Receive spending alerts, periodic summaries, and activity reminders."
                  title="Notifications (Master Switch)"
                  onCheckedChange={(checked) => {
                    const nextSettings = { ...settings, notifications: checked };
                    setSettings(nextSettings);
                    void persistSettings(nextSettings);
                  }}
                />

                {settings.notifications ? (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <SlidersHorizontal className="size-4.5" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-foreground flex items-center gap-2">
                          Notification Preferences & Rules
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Active Rules
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Customize summaries, salary alerts, budget thresholds & reminders
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNotifModalOpen(true)}
                      className="gap-2 text-xs font-medium cursor-pointer shrink-0"
                    >
                      <SlidersHorizontal className="size-3.5" />
                      Configure Rules
                    </Button>
                  </div>
                ) : null}

                <Dialog open={notifModalOpen} onOpenChange={setNotifModalOpen}>
                  <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-6">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <Bell className="size-5 text-primary" />
                        Notification Preferences & Rules
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        Customize which periodic summaries, smart budget warnings, and activity reminders you receive.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 grid gap-6">
                      {/* 📊 Periodic Summaries */}
                      <div className="grid gap-3">
                        <p className="text-xs font-bold text-primary uppercase tracking-wider">📊 Periodic Summaries</p>
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.dailySummary !== false}
                          title="Daily Spending Summary"
                          description="Daily overview of expenses, top category, or no-spend milestone."
                          onCheckedChange={(checked) => updateNotificationPref("dailySummary", checked)}
                        />
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.weeklySummary !== false}
                          title="Weekly Spending Summary"
                          description="Sunday evening overview of weekly income, expenses & top category."
                          onCheckedChange={(checked) => updateNotificationPref("weeklySummary", checked)}
                        />
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.monthlySummary !== false}
                          title="Monthly Spending Summary"
                          description="End-of-month financial summary including income, savings & top spending."
                          onCheckedChange={(checked) => updateNotificationPref("monthlySummary", checked)}
                        />
                      </div>

                      <Separator className="border-border/60" />

                      {/* 🚨 Smart Budget & Expense Alerts */}
                      <div className="grid gap-3">
                        <p className="text-xs font-bold text-primary uppercase tracking-wider">🚨 Smart Budget & Expense Alerts</p>
                        <PreferenceRow
                          icon={PiggyBank}
                          checked={settings.notificationPreferences?.salaryAlerts !== false}
                          title="Salary & Income Credited"
                          description="Notify when salary or monthly income is received."
                          onCheckedChange={(checked) => updateNotificationPref("salaryAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={AlertTriangle}
                          checked={settings.notificationPreferences?.budgetAlerts !== false}
                          title="Budget Limit Thresholds (80% / 100%)"
                          description="Alert when category spending crosses 80% or 100% of planned budget."
                          onCheckedChange={(checked) => updateNotificationPref("budgetAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={Shield}
                          checked={settings.notificationPreferences?.dailyLimitAlerts !== false}
                          title="Daily Safe Spending Limit Exceeded"
                          description="Alert when today's safe spending limit is breached."
                          onCheckedChange={(checked) => updateNotificationPref("dailyLimitAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.burnRateAlerts !== false}
                          title="High Burn Rate Warnings"
                          description="Warn when spending velocity projects an early monthly overspend."
                          onCheckedChange={(checked) => updateNotificationPref("burnRateAlerts", checked)}
                        />
                      </div>

                      <Separator className="border-border/60" />

                      {/* 🔔 Activity Reminders */}
                      <div className="grid gap-3">
                        <p className="text-xs font-bold text-primary uppercase tracking-wider">🔔 Activity Reminders</p>
                        <PreferenceRow
                          icon={Users}
                          checked={settings.notificationPreferences?.settlementReminders !== false}
                          title="Friend Settlement Reminders"
                          description="Remind when friend splits or shared expenses remain unsettled."
                          onCheckedChange={(checked) => updateNotificationPref("settlementReminders", checked)}
                        />
                        <PreferenceRow
                          icon={Wallet}
                          checked={settings.notificationPreferences?.snapshotReminders !== false}
                          title="Daily Snapshot Reminders"
                          description="Remind to record daily account balance snapshot for net worth tracking."
                          onCheckedChange={(checked) => updateNotificationPref("snapshotReminders", checked)}
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <Button onClick={() => setNotifModalOpen(false)} size="sm" className="cursor-pointer">
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Separator className="border-border/60" />

                <PreferenceRow
                  icon={Shield}
                  checked={settings.monthlySafeSpendingAlert}
                  description="Alert when monthly spending exceeds your safe limit."
                  title="Monthly safe spending alert"
                  onCheckedChange={(checked) => {
                    const nextSettings = { ...settings, monthlySafeSpendingAlert: checked };
                    setSettings(nextSettings);
                    persistSettings(nextSettings);
                  }}
                />

                <Separator className="border-border/60" />
                
                <PreferenceRow
                  icon={Eye}
                  checked={settings.privateMode}
                  description="Mask amounts and balance indicators globally across dashboards."
                  title="Private Hiding Mode"
                  onCheckedChange={(checked) => {
                    const nextSettings = { ...settings, privateMode: checked };
                    setSettings(nextSettings);
                    setGlobalPrivateMode(checked);
                    persistSettings(nextSettings);
                  }}
                />

              </CardContent>
            </Card>
          ) : null}

          {/* GLOBAL SETTINGS (ADMIN) */}
          {activeSection === "SMS Rules" && isAdmin ? (
            <SmsRulesAdminPanel
              adminId={user?.id}
              onNotify={notify}
            />
          ) : null}

          {activeSection === "Global Settings" && isAdmin ? (
            <Card>
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Global App Settings</CardTitle>
                <CardDescription className="text-xs">
                  Changes here affect all users across the app.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Default safe spending %">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-10 text-xs"
                      value={appConfig.defaultSafeSpendingPercentage}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          defaultSafeSpendingPercentage: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Default monthly budget (₹)">
                    <Input
                      type="number"
                      min={0}
                      className="h-10 text-xs"
                      value={appConfig.defaultMonthlyBudget}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          defaultMonthlyBudget: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Max custom category limit">
                    <Input
                      type="number"
                      min={1}
                      className="h-10 text-xs"
                      value={appConfig.maxCategoryLimit}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          maxCategoryLimit: Number(event.target.value) || 1,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Max purposes limit">
                    <Input
                      type="number"
                      min={1}
                      className="h-10 text-xs"
                      value={appConfig.maxPurposesLimit ?? 5}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          maxPurposesLimit: Number(event.target.value) || 5,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Max bank accounts limit">
                    <Input
                      type="number"
                      min={1}
                      className="h-10 text-xs"
                      value={appConfig.maxAccountsLimit ?? 10}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          maxAccountsLimit: Number(event.target.value) || 10,
                        }))
                      }
                    />
                  </Field>
                  <Field label="App version">
                    <Input
                      className="h-10 text-xs"
                      value={appConfig.appVersion}
                      onChange={(event) =>
                        setAppConfig((current) => ({
                          ...current,
                          appVersion: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <PreferenceRow
                  icon={AlertTriangle}
                  checked={appConfig.maintenanceMode}
                  description="When enabled, users see a maintenance notice."
                  title="Maintenance mode"
                  onCheckedChange={(checked) =>
                    setAppConfig((current) => ({ ...current, maintenanceMode: checked }))
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="h-10 font-bold bg-foreground text-white hover:bg-muted dark:bg-white dark:text-background dark:hover:bg-muted cursor-pointer"
                    onClick={handleSaveAppConfig}
                  >
                    <Save className="size-4 mr-2" />
                    Save global settings
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 font-bold cursor-pointer"
                    onClick={async () => {
                      // FIRESTORE_REBUILD_SPEC §2.19 / Step 8.7 — the shared
                      // default category list lives on globalSettings.app and is
                      // written admin-only via updateDefaultCategories. This
                      // seeds it once from the bundled list; edits propagate to
                      // every signed-in user live (useCategories subscribes).
                      if (!user?.id) return;
                      const seedList: DefaultCategory[] = defaultCategories.map(
                        (c, index) => ({
                          id: c.id,
                          name: c.name,
                          type: c.type,
                          color: c.color,
                          icon: c.icon ?? "",
                          order: index,
                          isInvestment: c.isInvestment ?? false,
                        }),
                      );
                      await updateDefaultCategories(user.id, seedList);
                      const seeded = defaultCategories.map((c) => ({
                        ...c,
                        isDefault: true,
                        source: "global" as const,
                      }));
                      setDefaultCategoryList(seeded);
                      syncSettingsCache(queryClient, user?.id, {
                        categories: mergeCategories(seeded, customCategories),
                      });
                      notify({ title: "Default categories saved to Global Settings" });
                    }}
                  >
                    <Layers className="size-4 mr-2" />
                    Seed default categories
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* POPUP MODAL 1: ADD ACCOUNT */}
      {accountModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="sx-surface w-full max-w-md space-y-4 p-6 scale-in duration-200">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Wallet className="size-4 text-emerald-500" /> Add New Bank Account
              </h3>
              <button 
                onClick={() => setAccountModalOpen(false)}
                className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <Label htmlFor="modal-acc-name" className="text-[10px] font-bold text-muted-foreground uppercase">Account Name</Label>
                <Input
                  id="modal-acc-name"
                  placeholder="e.g. HDFC Bank, SBI Account"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="modal-acc-type" className="text-[10px] font-bold text-muted-foreground uppercase">Asset Type</Label>
                <Input
                  id="modal-acc-type"
                  disabled
                  value="Bank Account (No Wallet / Credit allowed)"
                  className="h-10 text-xs bg-muted/50 text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="modal-acc-last4" className="text-[10px] font-bold text-muted-foreground uppercase">Last 4 Digits</Label>
                  <Input
                    id="modal-acc-last4"
                    maxLength={4}
                    placeholder="e.g. 5621"
                    value={accountForm.last4}
                    onChange={(e) => setAccountForm({ ...accountForm, last4: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modal-acc-bal" className="text-[10px] font-bold text-muted-foreground uppercase">Opening Balance</Label>
                  <Input
                    id="modal-acc-bal"
                    inputMode="decimal"
                    type="number"
                    value={accountForm.openingBalance || ""}
                    placeholder="0"
                    onChange={(e) => setAccountForm({ ...accountForm, openingBalance: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="modal-acc-bal-date" className="text-[10px] font-bold text-muted-foreground uppercase">Opening balance date</Label>
                <Input
                  id="modal-acc-bal-date"
                  type="date"
                  value={accountForm.openingBalanceDate}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, openingBalanceDate: e.target.value })
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  Opening balance applies from this date onward — not on earlier dates.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold cursor-pointer"
                onClick={() => setAccountModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                onClick={handleAddAccount}
              >
                Create Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 2: ADD CATEGORY */}
      {categoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="sx-surface w-full max-w-md space-y-4 p-6 scale-in duration-200">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="size-4 text-emerald-500" /> Add New Category
              </h3>
              <button 
                onClick={() => setCategoryModalOpen(false)}
                className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <Label htmlFor="modal-cat-name" className="text-[10px] font-bold text-muted-foreground uppercase">Category Name</Label>
                <Input
                  id="modal-cat-name"
                  placeholder="e.g. Rent, Grocery"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="modal-cat-type" className="text-[10px] font-bold text-muted-foreground uppercase">Taxonomy Type</Label>
                <select
                  id="modal-cat-type"
                  className="h-10 w-full rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground"
                  value={categoryForm.type}
                  onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value as Category["type"] })}
                >
                  <option value="expense">Expense Allocation</option>
                  <option value="income">Income Source</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="modal-cat-color" className="text-[10px] font-bold text-muted-foreground uppercase">Category Visual Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="modal-cat-color"
                    type="color"
                    className="h-10 w-16 p-1 cursor-pointer shrink-0"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                  />
                  <Input
                    type="text"
                    className="h-10 text-xs font-mono"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                  />
                </div>
              </div>

              {categoryForm.type === "expense" ? (
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary"
                    checked={categoryForm.isInvestment}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, isInvestment: e.target.checked })
                    }
                  />
                  Mark as Investment
                  <span className="font-normal text-muted-foreground">
                    (counts toward Wealth&apos;s Total Investment)
                  </span>
                </label>
              ) : null}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold cursor-pointer"
                onClick={() => setCategoryModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                onClick={handleAddCategory}
              >
                Create Category
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 3: ADD PURPOSE */}
      {purposeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="sx-surface w-full max-w-md space-y-4 p-6 scale-in duration-200">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Plus className="size-4 text-emerald-500" /> Add New Purpose Target
              </h3>
              <button 
                onClick={() => setPurposeModalOpen(false)}
                className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <Label htmlFor="modal-purp-name" className="text-[10px] font-bold text-muted-foreground uppercase">Purpose Name</Label>
                <Input
                  id="modal-purp-name"
                  placeholder="e.g. Travel, Family Medicals"
                  value={purposeForm.name}
                  onChange={(e) => setPurposeForm({ ...purposeForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-purp-color" className="text-[10px] font-bold text-muted-foreground uppercase">Color</Label>
                <Input
                  id="modal-purp-color"
                  type="color"
                  className="h-10 w-full"
                  value={purposeForm.color}
                  onChange={(e) => setPurposeForm({ ...purposeForm, color: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold cursor-pointer"
                onClick={() => setPurposeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                onClick={handleAddPurpose}
              >
                Create Purpose
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 4: DELETE CONFIRMATION */}
      <ConfirmDeleteDialog
        open={deleteConfirmOpen && Boolean(itemToDelete)}
        itemLabel={
          itemToDelete
            ? itemToDelete.type.charAt(0).toUpperCase() + itemToDelete.type.slice(1)
            : "Item"
        }
        detail={itemToDelete?.name}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmOpen(false);
            setItemToDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* POPUP MODAL 5: RESTORE CONFIRMATION */}
      {restoreConfirmOpen && pendingRestoreBackup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="sx-surface w-full max-w-sm space-y-4 p-6 text-center scale-in duration-200">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertTriangle className="size-6" />
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Restore from backup?</h3>
              <p className="text-xs text-muted-foreground leading-normal">
                This will overwrite matching records with the backup from{" "}
                <span className="font-extrabold text-foreground">
                  {new Date(pendingRestoreBackup.exportDate).toLocaleDateString("en-IN")}
                </span>
                . Your current data will be backed up to your device first.
              </p>
              <p className="text-xs text-muted-foreground leading-normal">
                Type <span className="font-extrabold text-foreground">RESTORE</span> to confirm.
              </p>
            </div>

            <Input
              autoFocus
              className="text-center"
              placeholder="RESTORE"
              value={restoreConfirmText}
              onChange={(event) => setRestoreConfirmText(event.target.value)}
            />

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold cursor-pointer"
                disabled={isRestoring}
                onClick={() => {
                  setRestoreConfirmOpen(false);
                  setPendingRestoreBackup(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white cursor-pointer"
                disabled={isRestoring || restoreConfirmText.trim() !== "RESTORE"}
                onClick={handleConfirmRestore}
              >
                {isRestoring ? "Restoring…" : "Restore"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PreferenceRow({
  icon: Icon,
  checked,
  description,
  onCheckedChange,
  title,
}: {
  icon: any;
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground dark:bg-background dark:text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-foreground">{title}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground leading-normal">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
