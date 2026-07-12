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
} from "lucide-react";
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
import { useViewerAccess } from "@/providers/viewer-provider";
import { isAdminUser } from "@/lib/admin";
import { syncSettingsCache, mergeCategories } from "@/lib/settings-data";
import { cacheKeys, readQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import {
  defaultAppConfig,
  defaultCategories,
  defaultPurposes,
  defaultStarterAccounts,
  defaultUserSettings,
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
  seedDefaultCategories,
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
  restoreBackupData,
  sendPasswordReset,
  uploadBackupToStorage,
  type SpentXBackup,
} from "@/lib/firebase";
import { getTodayCalendarDate } from "@/lib/date-filters";
import {
  formatCurrency,
  setActiveCurrency,
  setGlobalPrivateMode,
} from "@/lib/utils";
import { useFirebase } from "@/providers/firebase-provider";
import { useTheme } from "@/providers/theme-provider";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/transaction-ui";
import type {
  Account,
  AppConfig,
  Category,
  Purpose,
  ThemePreference,
  UserProfile,
  UserSettings,
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
  const { user, isConfigured, isLoading: authLoading } = useFirebase();
  const { isReadOnlyViewer } = useViewerAccess();
  const { notify } = useToast();
  const queryClient = useQueryClient();
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
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
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
  const [categoryForm, setCategoryForm] = useState({ name: "", type: "expense" as Category["type"], color: "#10b981" });

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
      setAccounts(cachedAccounts.filter((account) => account.is_active !== false));
      setDefaultCategoryList(cachedCategories.filter((c) => c.isDefault));
      setCustomCategories(
        cachedCategories.filter((c) => !c.isDefault && c.is_active !== false),
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
        }

        const mergedCategories = mergeCategories(nextDefaults, nextCustom);

        setAccounts(finalAccounts.filter((account) => account.is_active !== false));
        setDefaultCategoryList(nextDefaults);
        setCustomCategories(nextCustom.filter((category) => category.is_active !== false));
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
      is_active: true,
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
      is_active: true,
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
    notify({ title: `${type.toUpperCase()} deleted successfully.` });

    if (type === "account") {
      const nextAccounts = accounts.filter((item) => item.id !== id);
      setAccounts(nextAccounts);
      try {
        await deleteAccount(user?.id, id);
        syncSettingsCache(queryClient, user?.id, { accounts: nextAccounts });
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
        item.id === id ? { ...item, is_active: false } : item,
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

  function downloadBackupJson(backup: SpentXBackup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spentx-backup-${backup.exportDate.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleBackupNow() {
    if (!user?.id) return;
    setIsBackingUp(true);
    try {
      const backup = await gatherAllUserData(user.id);
      downloadBackupJson(backup);
      try {
        await uploadBackupToStorage(user.id, backup);
      } catch {
        // Cloud upload is best-effort — the local download already succeeded.
      }
      window.localStorage.setItem("spentx-last-auto-backup", backup.exportDate);
      setLastBackupAt(backup.exportDate);
      notify({ title: "Backup created", description: "Saved to your device." });
    } catch {
      notify({ title: "Backup failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleDownloadLatest() {
    if (!user?.id) return;
    setIsBackingUp(true);
    try {
      const backup = await gatherAllUserData(user.id);
      downloadBackupJson(backup);
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

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidBackupFile(parsed)) {
          notify({
            title: "This file is not a valid SpentX backup",
            variant: "destructive",
          });
          return;
        }
        setPendingRestoreBackup(parsed);
        setRestoreConfirmText("");
        setRestoreConfirmOpen(true);
      } catch {
        notify({
          title: "This file is not a valid SpentX backup",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmRestore() {
    if (!user?.id || !pendingRestoreBackup) return;
    setIsRestoring(true);
    try {
      const safetyBackup = await gatherAllUserData(user.id);
      downloadBackupJson(safetyBackup);
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

    await saveUserProfile(user.id, nextProfile);
    setProfile(nextProfile);
    notify({ title: "Profile saved" });
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
        <aside className="h-fit rounded-3xl border border-border bg-white p-2.5 dark:border-border dark:bg-card shadow-sm space-y-1">
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
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
              </CardContent>
            </Card>
          ) : null}

          {/* ACCOUNT CONFIGURATION */}
          {activeSection === "Accounts" ? (
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
                              <Input
                                className="h-9 w-28 text-xs font-semibold"
                                inputMode="decimal"
                                value={account.openingBalance}
                                onChange={(event) =>
                                  setAccounts((current) =>
                                    current.map((item) =>
                                      item.id === account.id
                                        ? {
                                            ...item,
                                            openingBalance: Number(event.target.value) || 0,
                                          }
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
                              <Input
                                className="h-9 w-36 text-xs"
                                type="date"
                                value={account.openingBalanceDate ?? ""}
                                onChange={(event) =>
                                  setAccounts((current) =>
                                    current.map((item) =>
                                      item.id === account.id
                                        ? {
                                            ...item,
                                            openingBalanceDate:
                                              event.target.value || undefined,
                                          }
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
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Purposes</CardTitle>
                <CardDescription className="text-xs">
                  Separate ledgers for Personal, Home/Family, and custom contexts. Archived purposes stay visible in old history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between border-b border-border/60 pb-2 dark:border-border">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Active Purposes
                  </h2>
                  <Button
                    disabled={purposes.filter((p) => p.is_active !== false).length >= (appConfig.maxPurposesLimit ?? 5)}
                    onClick={() => {
                      setPurposeForm({ name: "", color: "#10b981" });
                      setPurposeModalOpen(true);
                    }}
                    className="h-8 cursor-pointer text-xs font-bold"
                  >
                    <Plus className="mr-1 size-3.5" /> Add
                  </Button>
                </div>
                <div className="grid gap-2">
                  {purposes.map((purpose) => {
                    const isDefaultPurpose = purpose.id === "personal";
                    const isArchived = purpose.is_active === false;
                    return (
                      <div
                        key={purpose.id}
                        className={cn(
                          "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl border px-3 py-2",
                          isArchived && "opacity-50",
                        )}
                      >
                        <input
                          className="size-8 cursor-pointer rounded-lg border-0 bg-transparent"
                          type="color"
                          value={purpose.color ?? "#64748b"}
                          onChange={(event) =>
                            setPurposes((current) =>
                              current.map((item) =>
                                item.id === purpose.id
                                  ? { ...item, color: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          onBlur={async () => {
                            await savePurpose(user?.id, purpose);
                            syncSettingsCache(queryClient, user?.id, { purposes });
                          }}
                        />
                        <Input
                          className="h-9 text-xs"
                          value={purpose.name}
                          disabled={isDefaultPurpose}
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
                              syncSettingsCache(queryClient, user?.id, { purposes });
                            }
                          }}
                        />
                        <Badge variant={isArchived ? "secondary" : "default"}>
                          {isArchived ? "Archived" : "Active"}
                        </Badge>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="cursor-pointer text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 disabled:pointer-events-none disabled:opacity-20"
                          disabled={isDefaultPurpose || isArchived}
                          onClick={() => triggerDeletePrompt(purpose.id, purpose.name, "purpose")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
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
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-sm font-semibold">Security</CardTitle>
                <CardDescription className="text-xs">
                  Manage how you sign in to SpentX.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-6">
                <div className="grid gap-1.5">
                  <p className="text-xs font-bold text-foreground">Password</p>
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
              </CardContent>
            </Card>
          ) : null}

          {/* DATA & BACKUPS */}
          {activeSection === "Data & Backups" ? (
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
                    accept="application/json"
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
              </CardContent>
            </Card>
          ) : null}

          {/* CATEGORIES */}
          {activeSection === "Categories" ? (
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
                        setCategoryForm({ name: "", type: "expense", color: "#10b981" });
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
                            className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center"
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
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
                  <Field label="Currency">
                    <select
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground"
                      value={settings.currency}
                      onChange={(event) => {
                        const nextSettings = { ...settings, currency: event.target.value };
                        setSettings(nextSettings);
                        setActiveCurrency(event.target.value);
                        persistSettings(nextSettings);
                      }}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </Field>
                  <Field label="Default payment account">
                    <select
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-xs text-foreground outline-none dark:border-border dark:bg-background dark:text-foreground"
                      value={settings.defaultAccount}
                      onChange={(event) => {
                        const nextSettings = { ...settings, defaultAccount: event.target.value };
                        setSettings(nextSettings);
                        persistSettings(nextSettings);
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
                  icon={Moon}
                  checked={resolvedTheme === "dark"}
                  description="Enable dynamic low-light optimized display mode."
                  title="Dark Mode Aspect Override"
                  onCheckedChange={(checked) => {
                    const nextTheme: ThemePreference = checked ? "dark" : "light";
                    setTheme(nextTheme);
                    const nextSettings = { ...settings, theme: nextTheme };
                    setSettings(nextSettings);
                    persistSettings(nextSettings);
                  }}
                />

                <Separator className="border-border/60" />

                <PreferenceRow
                  icon={RefreshCw}
                  checked={settings.notifications}
                  description="Receive spending alerts and budget reminders."
                  title="Notifications"
                  onCheckedChange={(checked) => {
                    const nextSettings = { ...settings, notifications: checked };
                    setSettings(nextSettings);
                    persistSettings(nextSettings);
                  }}
                />

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

                <Separator className="border-border/60" />
                
                <PreferenceRow
                  icon={RefreshCw}
                  checked={settings.autoSync}
                  description="Listen for incoming mobile sync notifications in real time."
                  title="Auto Sync Mobile Detection"
                  onCheckedChange={(checked) => {
                    const nextSettings = { ...settings, autoSync: checked };
                    setSettings(nextSettings);
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
            <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
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
                      const seeded = await seedDefaultCategories();
                      setDefaultCategoryList(seeded);
                      syncSettingsCache(queryClient, user?.id, {
                        categories: mergeCategories(seeded, customCategories),
                      });
                      notify({ title: "Default categories seeded to Firestore" });
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
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 scale-in duration-200">
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
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 scale-in duration-200">
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
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 scale-in duration-200">
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
      {deleteConfirmOpen && itemToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 scale-in duration-200 text-center">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 animate-bounce">
                <AlertTriangle className="size-6" />
              </span>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Confirm Deletion</h3>
              <p className="text-xs text-muted-foreground leading-normal">
                Are you sure you want to delete <span className="font-extrabold text-foreground">&ldquo;{itemToDelete.name}&rdquo;</span>? This change will be permanently written.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-bold cursor-pointer"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setItemToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white cursor-pointer"
                onClick={handleConfirmDelete}
              >
                Delete permanently
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 5: RESTORE CONFIRMATION */}
      {restoreConfirmOpen && pendingRestoreBackup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 scale-in duration-200 text-center">
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
