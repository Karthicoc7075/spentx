"use client";

import {
  Camera,
  Monitor,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
  Pencil,
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
  Compass,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useRoleMode } from "@/hooks/useRoleMode";
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
import { getCategoryIcon, getPurposeIcon } from "@/lib/transaction-ui";
import { IconPicker, ColorPicker, InlineIconPicker, InlineColorPicker, saveCustomPaletteColor } from "@/components/shared/IconPicker";
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
  const [profilePhoto, setProfilePhoto] = useState<string>("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
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

  const { isAdminView } = useRoleMode();
  const visibleSidebarItems = sidebarItems.filter(
    (item) => !item.adminOnly || isAdminView,
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

  const [categoryModal, setCategoryModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    id?: string;
    name: string;
    type: Category["type"];
    color: string;
    icon: string;
    isInvestment: boolean;
  }>({
    open: false,
    mode: "create",
    name: "",
    type: "expense",
    color: "#10b981",
    icon: "ShoppingBag",
    isInvestment: false,
  });

  const [purposeModal, setPurposeModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    id?: string;
    name: string;
    color: string;
    icon: string;
    isCore?: boolean;
  }>({
    open: false,
    mode: "create",
    name: "",
    color: "#10b981",
    icon: "Target",
    isCore: false,
  });

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
          if (resolvedProfile.photoURL) {
            setProfilePhoto(resolvedProfile.photoURL);
          }
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

  useEffect(() => {
    if (user?.photoUrl && !profilePhoto) {
      setProfilePhoto(user.photoUrl);
    }
  }, [user?.photoUrl, profilePhoto]);

  const profileInitials = useMemo(() => {
    const raw = (profileName || user?.name || "SX").trim();
    return (
      raw
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "SX"
    );
  }, [profileName, user?.name]);

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify({
        title: "Invalid file type",
        description: "Please choose an image file (PNG, JPG, WebP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notify({
        title: "File too large",
        description: "Image size must be 5MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 320;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.88);
          setProfilePhoto(resizedDataUrl);
          notify({
            title: "Avatar selected",
            description: "Click 'Save profile' to persist your changes.",
          });
        } else {
          setProfilePhoto(loadEvent.target?.result as string);
        }
      };
      img.src = loadEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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

  async function handleSaveCategory() {
    if (!categoryModal.name.trim()) {
      notify({ title: "Name required", description: "Category name cannot be empty." });
      return;
    }
    const name = categoryModal.name.trim();

    if (categoryModal.mode === "create") {
      const newCat: Category = {
        id: crypto.randomUUID(),
        name,
        type: categoryModal.type,
        color: categoryModal.color,
        icon: categoryModal.icon,
        isInvestment: categoryModal.isInvestment,
      };
      const nextCustom = [...customCategories, newCat];
      setCustomCategories(nextCustom);
      setCategoryModal((c) => ({ ...c, open: false }));
      saveCustomPaletteColor(newCat.color);
      await saveCustomCategory(user?.id, newCat);
      syncSettingsCache(queryClient, user?.id, {
        categories: mergeCategories(defaultCategoryList, nextCustom),
      });
      notify({ title: "Category added", description: `Added "${name}"` });
    } else {
      const updatedCat: Category = {
        id: categoryModal.id!,
        name,
        type: categoryModal.type,
        color: categoryModal.color,
        icon: categoryModal.icon,
        isInvestment: categoryModal.isInvestment,
      };
      const nextCustom = customCategories.map((c) => (c.id === updatedCat.id ? updatedCat : c));
      setCustomCategories(nextCustom);
      setCategoryModal((c) => ({ ...c, open: false }));
      saveCustomPaletteColor(updatedCat.color);
      await saveCustomCategory(user?.id, updatedCat);
      syncSettingsCache(queryClient, user?.id, {
        categories: mergeCategories(defaultCategoryList, nextCustom),
      });
      notify({ title: "Category updated", description: `Updated "${name}"` });
    }
  }

  async function handleSavePurpose() {
    if (!purposeModal.name.trim()) {
      notify({ title: "Name required", description: "Purpose name cannot be empty." });
      return;
    }
    const name = purposeModal.name.trim();

    if (purposeModal.mode === "create") {
      if (purposes.filter((p) => p.isActive !== false).length >= (appConfig.maxPurposesLimit ?? 5)) {
        notify({
          title: "Limit reached",
          description: `Maximum of ${appConfig.maxPurposesLimit ?? 5} purposes allowed.`,
        });
        return;
      }

      const newPurpose: Purpose = {
        id: crypto.randomUUID(),
        name,
        color: purposeModal.color,
        icon: purposeModal.icon,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      const nextPurposes = [...purposes, newPurpose];
      setPurposes(nextPurposes);
      setPurposeModal((p) => ({ ...p, open: false }));
      saveCustomPaletteColor(newPurpose.color);
      await savePurpose(user?.id, newPurpose);
      syncSettingsCache(queryClient, user?.id, { purposes: nextPurposes });
      notify({ title: "Purpose added", description: `Added "${name}"` });
    } else {
      const existing = purposes.find((p) => p.id === purposeModal.id);
      if (!existing) return;
      const updated: Purpose = {
        ...existing,
        name: purposeModal.isCore ? existing.name : name,
        color: purposeModal.color,
        icon: purposeModal.icon,
      };
      const nextPurposes = purposes.map((p) => (p.id === updated.id ? updated : p));
      setPurposes(nextPurposes);
      setPurposeModal((p) => ({ ...p, open: false }));
      saveCustomPaletteColor(updated.color);
      await savePurpose(user?.id, updated);
      syncSettingsCache(queryClient, user?.id, { purposes: nextPurposes });
      notify({ title: "Purpose updated", description: `Updated "${updated.name}"` });
    }
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
      photoURL: profilePhoto || undefined,
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  <div
                    className="relative group size-20 shrink-0 cursor-pointer rounded-full"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Click to change avatar photograph"
                  >
                    <Avatar className="size-20 border-2 border-emerald-500/20 bg-muted shadow-sm">
                      {profilePhoto || profile?.photoURL || user?.photoUrl ? (
                        <AvatarImage
                          src={profilePhoto || profile?.photoURL || user?.photoUrl}
                          alt={profileName || "User avatar"}
                          className="object-cover"
                        />
                      ) : null}
                      <AvatarFallback className="font-bold text-base text-foreground bg-primary/10">
                        {profileInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/45 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="size-5 text-white" />
                      <span className="text-[9px] font-semibold text-white/90 mt-0.5">Change</span>
                    </div>
                  </div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />

                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-foreground">Avatar Photograph</p>
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPG or WebP up to 5MB. Automatically optimized for fast loading.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium cursor-pointer"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Upload className="size-3.5 mr-1.5" />
                        Upload photograph
                      </Button>
                      {profilePhoto || profile?.photoURL || user?.photoUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          onClick={() => {
                            setProfilePhoto("");
                            if (avatarInputRef.current) avatarInputRef.current.value = "";
                            notify({
                              title: "Avatar removed",
                              description: "Click 'Save profile' to persist your changes.",
                            });
                          }}
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
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
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Purpose types
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Target budgets for tracking and sharing ({purposes.length})
                    </p>
                  </div>
                  <Button
                    disabled={
                      purposes.filter((p) => p.isActive !== false).length >=
                      (appConfig.maxPurposesLimit ?? 5)
                    }
                    onClick={() => {
                      setPurposeModal({
                        open: true,
                        mode: "create",
                        name: "",
                        color: "#10b981",
                        icon: "Target",
                        isCore: false,
                      });
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
                    const PurposeIcon = getPurposeIcon(
                      purpose.icon || (isPersonal ? "User" : isFamily ? "Users" : "Target"),
                    );

                    return (
                      <div
                        key={purpose.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:bg-muted/40",
                          !isOn && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="flex size-9 items-center justify-center rounded-xl font-bold shadow-2xs shrink-0"
                            style={{
                              backgroundColor: `${purpose.color || "#64748b"}20`,
                              color: purpose.color || "#64748b",
                            }}
                          >
                            <PurposeIcon className="size-4.5" />
                          </span>

                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {purpose.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0 border-transparent shrink-0",
                                isPersonal || isFamily
                                  ? "bg-primary/10 text-primary"
                                  : isOn
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {isPersonal
                                ? "Permanent"
                                : isFamily
                                  ? "Family"
                                  : isOn
                                    ? "Active"
                                    : "Off"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isFamily ? (
                            <Switch
                              checked={isOn}
                              onCheckedChange={async (checked) => {
                                const next = {
                                  ...purpose,
                                  isActive: checked,
                                  canDelete: false,
                                  deletedAt: checked ? undefined : new Date().toISOString(),
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
                                  title: checked ? "Family purpose on" : "Family purpose off",
                                });
                              }}
                            />
                          ) : isPersonal ? (
                            <Badge variant="secondary" className="text-[10px]">On</Badge>
                          ) : (
                            <Switch
                              checked={isOn}
                              onCheckedChange={async (checked) => {
                                const next = {
                                  ...purpose,
                                  isActive: checked,
                                  deletedAt: checked ? undefined : new Date().toISOString(),
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
                          )}

                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="rounded-lg hover:bg-muted cursor-pointer"
                            title="Edit Purpose"
                            onClick={() => {
                              setPurposeModal({
                                open: true,
                                mode: "edit",
                                id: purpose.id,
                                name: purpose.name,
                                color: purpose.color || "#10b981",
                                icon:
                                  purpose.icon ||
                                  (isPersonal ? "User" : isFamily ? "Users" : "Target"),
                                isCore,
                              });
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          {!isCore && purpose.canDelete !== false ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                              title="Delete Purpose"
                              onClick={() =>
                                triggerDeletePrompt(purpose.id, purpose.name, "purpose")
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
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
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {defaultCategoryList.map((category) => {
                      const CategoryIcon = getCategoryIcon(category.icon || category.name);
                      return (
                        <div
                          key={category.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="flex size-9 items-center justify-center rounded-xl font-bold shadow-2xs shrink-0"
                              style={{
                                backgroundColor: `${category.color || "#10b981"}20`,
                                color: category.color || "#10b981",
                              }}
                            >
                              <CategoryIcon className="size-4.5" />
                            </span>
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {category.name}
                              </span>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0 border-transparent shrink-0",
                                  category.type === "income"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                                )}
                              >
                                {category.type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="border-border/60" />

                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div>
                      <h2 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                        My Custom Categories
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Categories created by you ({customCategories.length})
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        if (customCategories.length >= appConfig.maxCategoryLimit) {
                          notify({
                            title: "Limit reached",
                            description: `Maximum of ${appConfig.maxCategoryLimit} custom categories allowed.`,
                          });
                          return;
                        }
                        setCategoryModal({
                          open: true,
                          mode: "create",
                          name: "",
                          type: "expense",
                          color: "#10b981",
                          icon: "ShoppingBag",
                          isInvestment: false,
                        });
                      }}
                      className="h-8 text-xs font-bold cursor-pointer"
                    >
                      <Plus className="size-3.5 mr-1" /> Add Category
                    </Button>
                  </div>

                  {customCategories.length === 0 ? (
                    <div className="text-center py-8 rounded-xl border border-dashed border-border/70 bg-muted/20">
                      <p className="text-xs font-medium text-foreground">No custom categories yet</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Tap Add Category to create one.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2 max-h-[380px] overflow-y-auto pr-1">
                      {customCategories.map((category) => {
                        const CategoryIcon = getCategoryIcon(category.icon || category.name);
                        return (
                          <div
                            key={category.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:bg-muted/40 hover:border-border"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="flex size-9 items-center justify-center rounded-xl font-bold shadow-2xs shrink-0"
                                style={{
                                  backgroundColor: `${category.color || "#10b981"}20`,
                                  color: category.color || "#10b981",
                                }}
                              >
                                <CategoryIcon className="size-4.5" />
                              </span>
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="truncate text-sm font-semibold text-foreground">
                                  {category.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0 border-transparent shrink-0",
                                    category.type === "income"
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                                  )}
                                >
                                  {category.type}
                                </Badge>
                                {category.isInvestment ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium shrink-0"
                                  >
                                    Investment
                                  </Badge>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="rounded-lg hover:bg-muted cursor-pointer"
                                title="Edit Category"
                                onClick={() => {
                                  setCategoryModal({
                                    open: true,
                                    mode: "edit",
                                    id: category.id,
                                    name: category.name,
                                    type: category.type,
                                    color: category.color || "#10b981",
                                    icon: category.icon || "ShoppingBag",
                                    isInvestment: category.isInvestment ?? false,
                                  });
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                                title="Delete Category"
                                onClick={() =>
                                  triggerDeletePrompt(category.id, category.name, "category")
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
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

                  <Field label="Default purpose">
                    <select
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground"
                      value={
                        purposes.find((p) => p.isDefault)?.id ??
                        purposes.find((p) => p.name.toLowerCase() === "personal")?.id ??
                        ""
                      }
                      onChange={async (event) => {
                        const selectedId = event.target.value;
                        const nextPurposes = purposes.map((p) => ({
                          ...p,
                          isDefault: p.id === selectedId,
                        }));
                        setPurposes(nextPurposes);
                        const savePromises = nextPurposes.map((p) => savePurpose(user?.id, p));
                        await Promise.allSettled(savePromises);
                        syncSettingsCache(queryClient, user?.id, { purposes: nextPurposes });
                        notify({ title: "Default purpose updated" });
                      }}
                    >
                      <option value="">Select purpose</option>
                      {purposes
                        .filter((p) => p.isActive !== false)
                        .map((purpose) => (
                          <option key={purpose.id} value={purpose.id}>
                            {purpose.name}
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
                      {/* Smart Budget & Expense Alerts */}
                      <div className="grid gap-3">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Smart Budget & Limits</p>
                        <PreferenceRow
                          icon={Shield}
                          checked={settings.notificationPreferences?.dailyLimitAlerts !== false}
                          title="Daily Safe Spending Limit Exceeded"
                          description="Alert when today's safe spending limit is breached so you can adjust."
                          onCheckedChange={(checked) => updateNotificationPref("dailyLimitAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={AlertTriangle}
                          checked={settings.notificationPreferences?.budgetAlerts !== false}
                          title="Budget Limit Thresholds (80% / 100%)"
                          description="Alert when category spending crosses 80% or 100% of planned monthly budget."
                          onCheckedChange={(checked) => updateNotificationPref("budgetAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.burnRateAlerts !== false}
                          title="High Burn Rate Warnings"
                          description="Warn early in the month if spending velocity projects a monthly overspend."
                          onCheckedChange={(checked) => updateNotificationPref("burnRateAlerts", checked)}
                        />
                      </div>

                      <Separator className="border-border/60" />

                      {/* Activity & Settlement Reminders */}
                      <div className="grid gap-3">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Activity & Settlements</p>
                        <PreferenceRow
                          icon={Users}
                          checked={settings.notificationPreferences?.settlementReminders !== false}
                          title="Friend Settlement Reminders"
                          description="Remind when friend splits or shared balances remain unsettled."
                          onCheckedChange={(checked) => updateNotificationPref("settlementReminders", checked)}
                        />
                        <PreferenceRow
                          icon={Compass}
                          checked={settings.notificationPreferences?.outingAlerts !== false}
                          title="Outing Completion & Settle Splits"
                          description="Notify when a trip or outing finishes so you can review final expenses and settle balances."
                          onCheckedChange={(checked) => updateNotificationPref("outingAlerts", checked)}
                        />
                        <PreferenceRow
                          icon={PiggyBank}
                          checked={settings.notificationPreferences?.salaryAlerts !== false}
                          title="Salary & Major Income Credited"
                          description="Notify when salary or monthly income is received to begin your plan."
                          onCheckedChange={(checked) => updateNotificationPref("salaryAlerts", checked)}
                        />
                      </div>

                      <Separator className="border-border/60" />

                      {/* Periodic Digest */}
                      <div className="grid gap-3">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Periodic Digest</p>
                        <PreferenceRow
                          icon={Sparkles}
                          checked={settings.notificationPreferences?.weeklySummary !== false}
                          title="Weekly Spending Digest"
                          description="Sunday evening overview of your weekly expenses, income, and top spending."
                          onCheckedChange={(checked) => updateNotificationPref("weeklySummary", checked)}
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
          {activeSection === "SMS Rules" && isAdminView ? (
            <SmsRulesAdminPanel
              adminId={user?.id}
              onNotify={notify}
            />
          ) : null}

          {activeSection === "Global Settings" && isAdminView ? (
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
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setAccountModalOpen(false)}
        >
          <div
            className="sx-surface w-full max-w-md space-y-4 p-6 scale-in duration-200 shadow-2xl border border-border/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Wallet className="size-4 text-emerald-500" /> Add New Bank Account
              </h3>
              <button 
                type="button"
                onClick={() => setAccountModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-md hover:bg-muted"
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

            <div className="flex gap-2 pt-2 border-t border-border/60">
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

      {/* POPUP MODAL 2: CATEGORY (CREATE / EDIT) */}
      {categoryModal.open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setCategoryModal((c) => ({ ...c, open: false }))}
        >
          <div
            className="sx-surface w-full max-w-md space-y-4 p-5 sm:p-6 scale-in duration-200 shadow-2xl border border-border/80 rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground">
                {categoryModal.mode === "create" ? "Create Category" : "Edit Category"}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModal((c) => ({ ...c, open: false }))}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Hero Input Section */}
            <div className="flex items-start gap-3">
              {/* Live Preview Avatar */}
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors"
                style={{
                  backgroundColor: `${categoryModal.color}20`,
                  color: categoryModal.color,
                }}
              >
                {(() => {
                  const CatIcon = getCategoryIcon(categoryModal.icon || categoryModal.name);
                  return <CatIcon className="size-6" />;
                })()}
              </div>

              {/* Name & Type switch */}
              <div className="flex-1 space-y-2">
                <Input
                  id="modal-cat-name"
                  placeholder="Category name"
                  value={categoryModal.name}
                  onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })}
                  className="h-10 text-sm font-semibold rounded-xl bg-muted/20 border-border/70"
                  autoFocus
                />

                {/* Segmented Type Toggle */}
                <div className="grid grid-cols-2 rounded-xl bg-muted/50 p-1 border border-border/50 gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryModal((c) => ({ ...c, type: "expense" }))}
                    className={cn(
                      "py-1 text-xs font-bold rounded-lg transition-all cursor-pointer",
                      categoryModal.type === "expense"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModal((c) => ({ ...c, type: "income" }))}
                    className={cn(
                      "py-1 text-xs font-bold rounded-lg transition-all cursor-pointer",
                      categoryModal.type === "income"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Income
                  </button>
                </div>
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Color
              </span>
              <InlineColorPicker
                value={categoryModal.color}
                onChange={(color) => setCategoryModal({ ...categoryModal, color })}
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Icon
              </span>
              <InlineIconPicker
                value={categoryModal.icon}
                onChange={(icon) => setCategoryModal({ ...categoryModal, icon })}
                color={categoryModal.color}
              />
            </div>

            {/* Investment Option (for expenses) */}
            {categoryModal.type === "expense" ? (
              <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary rounded"
                  checked={categoryModal.isInvestment}
                  onChange={(e) =>
                    setCategoryModal({ ...categoryModal, isInvestment: e.target.checked })
                  }
                />
                <span>Mark as Investment</span>
              </label>
            ) : null}

            {/* Modal Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold rounded-xl cursor-pointer"
                onClick={() => setCategoryModal((c) => ({ ...c, open: false }))}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl cursor-pointer"
                onClick={handleSaveCategory}
              >
                {categoryModal.mode === "create" ? "Create Category" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 3: PURPOSE (CREATE / EDIT) */}
      {purposeModal.open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPurposeModal((p) => ({ ...p, open: false }))}
        >
          <div
            className="sx-surface w-full max-w-md space-y-4 p-5 sm:p-6 scale-in duration-200 shadow-2xl border border-border/80 rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground">
                {purposeModal.mode === "create" ? "Add Purpose Target" : "Edit Purpose Target"}
              </h3>
              <button
                type="button"
                onClick={() => setPurposeModal((p) => ({ ...p, open: false }))}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Hero Input Section */}
            <div className="flex items-center gap-3">
              {/* Live Preview Avatar */}
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors"
                style={{
                  backgroundColor: `${purposeModal.color}20`,
                  color: purposeModal.color,
                }}
              >
                {(() => {
                  const PurpIcon = getPurposeIcon(purposeModal.icon || purposeModal.name);
                  return <PurpIcon className="size-6" />;
                })()}
              </div>

              {/* Name input */}
              <div className="flex-1 space-y-1">
                <Input
                  id="modal-purp-name"
                  placeholder="Purpose name"
                  value={purposeModal.name}
                  disabled={purposeModal.isCore}
                  onChange={(e) => setPurposeModal({ ...purposeModal, name: e.target.value })}
                  className="h-10 text-sm font-semibold rounded-xl bg-muted/20 border-border/70"
                  autoFocus={!purposeModal.isCore}
                />
                {purposeModal.isCore ? (
                  <p className="text-[10px] text-muted-foreground">
                    Core system purpose
                  </p>
                ) : null}
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Color
              </span>
              <InlineColorPicker
                value={purposeModal.color}
                onChange={(color) => setPurposeModal({ ...purposeModal, color })}
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Icon
              </span>
              <InlineIconPicker
                value={purposeModal.icon}
                onChange={(icon) => setPurposeModal({ ...purposeModal, icon })}
                color={purposeModal.color}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold rounded-xl cursor-pointer"
                onClick={() => setPurposeModal((p) => ({ ...p, open: false }))}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl cursor-pointer"
                onClick={handleSavePurpose}
              >
                {purposeModal.mode === "create" ? "Create Purpose" : "Save Changes"}
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
