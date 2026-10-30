"use client";

/**
 * Admin SMS rules — two tabs:
 *  1. Templates — bank SMS parse rules (synced defaults for mobile)
 *  2. Block SMS — OTP / promo / spam ignored on every device
 *
 * Enhanced with:
 *  - Advanced filtering (Bank/Wallet, Type, Payment Mode, Status, Search)
 *  - Active filter badges with one-click dismiss and "Clear all"
 *  - Sort options (Bank/Wallet A-Z, Created Date, Type, Mode, Status)
 *  - Clickable table header sorting
 *  - Page size selection (20, 30, 50, 100, All — defaults to 30)
 *  - Smart pagination controls (First, Prev, Page numbers, Next, Last)
 *  - Top KPI summary cards
 *  - Inline instant status toggle
 *  - One-click template pattern copy
 */

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Filter,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SmsTemplateTagger } from "@/components/admin/SmsTemplateTagger";
import {
  deleteSmsBlockRule,
  deleteSmsTemplateRule,
  fetchSmsBlockRules,
  fetchSmsTemplateRules,
  saveSmsBlockRule,
  saveSmsTemplateRule,
} from "@/lib/supabase-data";
import { cn } from "@/lib/utils";
import type { SmsBlockRule, SmsTemplateRule } from "@/types";

type RuleTab = "template" | "block";

type TemplateSortOption =
  | "bank-asc"
  | "bank-desc"
  | "date-desc"
  | "date-asc"
  | "type-asc"
  | "type-desc"
  | "mode-asc"
  | "mode-desc"
  | "status-asc"
  | "status-desc";

type BlockSortOption =
  | "name-asc"
  | "name-desc"
  | "date-desc"
  | "date-asc"
  | "status-asc"
  | "status-desc";

type PageSizeOption = "20" | "30" | "50" | "100" | "all";

type SmsRulesAdminPanelProps = {
  adminId?: string;
  onNotify: (payload: { title: string; description?: string }) => void;
};

export const KNOWN_DIGITAL_WALLETS = [
  "Paytm Wallet",
  "Amazon Pay",
  "PhonePe Wallet",
  "PayZapp Wallet",
  "MobiKwik",
  "Freecharge",
  "Airtel Money",
  "Ola Money",
  "JioMoney",
];

const DIGITAL_WALLETS = new Set(KNOWN_DIGITAL_WALLETS);

function isWalletProvider(name?: string, mode?: string) {
  if (!name) return false;
  if (DIGITAL_WALLETS.has(name.trim())) return true;
  if (mode === "wallet" || mode === "wallet_topup" || mode === "wallet_transfer") return true;
  return /wallet|payzapp|amazon pay|mobikwik|freecharge|ola money|airtel money|jiomoney/i.test(name);
}

const MODE_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Card / POS",
  wallet: "Wallet",
  wallet_topup: "Wallet Top-up",
  wallet_transfer: "Wallet Transfer",
  atm: "ATM Withdrawal",
  netbanking: "NetBanking",
  neft: "NEFT",
  imps: "IMPS",
  rtgs: "RTGS",
  autopay: "Autopay",
  cheque: "Cheque",
  other: "Other",
};

function formatMode(mode?: string) {
  if (!mode) return "—";
  return MODE_LABELS[mode.toLowerCase()] || mode.toUpperCase();
}

function parseKeywordList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatKeywordList(values: string[]) {
  return values.join(", ");
}

function extractKeywordsFromSample(sample: string): string[] {
  const lower = sample.toLowerCase();
  const candidates = [
    "debited",
    "credited",
    "withdrawn",
    "upi",
    "neft",
    "imps",
    "atm",
    "a/c",
    "rs.",
    "inr",
    "otp",
    "one time password",
    "do not share",
    "verification code",
    "claim now",
    "unsubscribe",
  ];
  return candidates.filter((k) => lower.includes(k));
}

function formatDateSafe(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return format(d, "dd MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

const selectFilterClass =
  "h-9 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground font-medium shadow-2xs focus:outline-none focus:ring-1 focus:ring-primary";

const tabLabels: Record<RuleTab, string> = {
  template: "Templates",
  block: "Block SMS",
};

const tabHints: Record<RuleTab, string> = {
  template:
    "Bank SMS parse templates (AMOUNT / TITLE tokens). Defaults for every phone after refresh.",
  block:
    "OTP, promo, spam — matching SMS never become transactions on any device.",
};

export function SmsRulesAdminPanel({ adminId, onNotify }: SmsRulesAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<RuleTab>("template");
  const [loading, setLoading] = useState(true);

  // Filter states - Templates
  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [templateSort, setTemplateSort] = useState<TemplateSortOption>("bank-asc");
  const [pageSize, setPageSize] = useState<PageSizeOption>("30");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter states - Block rules
  const [blockSearch, setBlockSearch] = useState("");
  const [blockStatusFilter, setBlockStatusFilter] = useState("all");
  const [blockSort, setBlockSort] = useState<BlockSortOption>("name-asc");
  const [blockPageSize, setBlockPageSize] = useState<PageSizeOption>("20");
  const [blockCurrentPage, setBlockCurrentPage] = useState(1);

  // Rule data
  const [templateRules, setTemplateRules] = useState<SmsTemplateRule[]>([]);
  const [blockRules, setBlockRules] = useState<SmsBlockRule[]>([]);

  // Trainer / Editing states
  const [templateTrainer, setTemplateTrainer] = useState<
    SmsTemplateRule | "new" | null
  >(null);
  const [editingBlock, setEditingBlock] = useState<SmsBlockRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedPatternId, setCopiedPatternId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [templates, blocks] = await Promise.all([
        fetchSmsTemplateRules(),
        fetchSmsBlockRules(),
      ]);
      setTemplateRules(templates);
      setBlockRules(blocks);
    } catch {
      onNotify({
        title: "Could not load SMS rules",
        description: "Check Supabase connection and admin role.",
      });
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  // Unique Banks & Wallets
  const uniqueBanks = useMemo(() => {
    const set = new Set<string>();
    for (const rule of templateRules) {
      if (rule.bankName?.trim()) set.add(rule.bankName.trim());
    }
    return Array.from(set).sort();
  }, [templateRules]);

  // All Digital Wallets (Seeded/Known + Any from DB)
  const allWallets = useMemo(() => {
    const set = new Set<string>(KNOWN_DIGITAL_WALLETS);
    for (const rule of templateRules) {
      if (isWalletProvider(rule.bankName, rule.mode) && rule.bankName?.trim()) {
        set.add(rule.bankName.trim());
      }
    }
    return Array.from(set).sort();
  }, [templateRules]);

  // All Commercial & Payments Banks (from DB)
  const allBanks = useMemo(() => {
    const set = new Set<string>();
    for (const rule of templateRules) {
      if (!isWalletProvider(rule.bankName, rule.mode) && rule.bankName?.trim()) {
        set.add(rule.bankName.trim());
      }
    }
    return Array.from(set).sort();
  }, [templateRules]);

  // Counts for wallets and banks
  const walletRulesCount = useMemo(() => {
    return templateRules.filter((r) => isWalletProvider(r.bankName, r.mode)).length;
  }, [templateRules]);

  const bankRulesCount = useMemo(() => {
    return templateRules.filter((r) => !isWalletProvider(r.bankName, r.mode)).length;
  }, [templateRules]);

  const providerRuleCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rule of templateRules) {
      const name = rule.bankName?.trim();
      if (name) map[name] = (map[name] || 0) + 1;
    }
    return map;
  }, [templateRules]);

  // Unique Modes
  const uniqueModes = useMemo(() => {
    const set = new Set<string>();
    for (const rule of templateRules) {
      if (rule.mode?.trim()) set.add(rule.mode.trim().toLowerCase());
    }
    return Array.from(set).sort();
  }, [templateRules]);

  // Unique Types
  const uniqueTypes = useMemo(() => {
    const set = new Set<string>();
    for (const rule of templateRules) {
      if (rule.type?.trim()) set.add(rule.type.trim().toLowerCase());
    }
    return Array.from(set).sort();
  }, [templateRules]);

  // Active filter counters
  const activeTemplateFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (bankFilter !== "all") count++;
    if (typeFilter !== "all") count++;
    if (modeFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    return count;
  }, [search, bankFilter, typeFilter, modeFilter, statusFilter]);

  const activeBlockFilterCount = useMemo(() => {
    let count = 0;
    if (blockSearch.trim()) count++;
    if (blockStatusFilter !== "all") count++;
    return count;
  }, [blockSearch, blockStatusFilter]);

  // Filtered Templates
  const qTemplate = search.trim().toLowerCase();
  const filteredTemplate = useMemo(() => {
    return templateRules.filter((r) => {
      if (bankFilter === "__wallets_only__") {
        if (!isWalletProvider(r.bankName, r.mode)) return false;
      } else if (bankFilter === "__banks_only__") {
        if (isWalletProvider(r.bankName, r.mode)) return false;
      } else if (bankFilter !== "all") {
        if (r.bankName !== bankFilter) return false;
      }
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (modeFilter !== "all" && r.mode?.toLowerCase() !== modeFilter.toLowerCase()) return false;
      if (statusFilter === "active" && !r.isActive) return false;
      if (statusFilter === "inactive" && r.isActive) return false;
      if (!qTemplate) return true;
      return [
        r.bankName,
        r.type,
        r.mode,
        r.templatePattern,
        r.sampleMessage ?? "",
        ...(r.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(qTemplate);
    });
  }, [templateRules, bankFilter, typeFilter, modeFilter, statusFilter, qTemplate]);

  // Sorted Templates
  const sortedTemplate = useMemo(() => {
    const list = [...filteredTemplate];
    list.sort((a, b) => {
      switch (templateSort) {
        case "bank-asc":
          return (a.bankName || "").localeCompare(b.bankName || "");
        case "bank-desc":
          return (b.bankName || "").localeCompare(a.bankName || "");
        case "date-desc": {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        }
        case "date-asc": {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        }
        case "type-asc":
          return (a.type || "").localeCompare(b.type || "");
        case "type-desc":
          return (b.type || "").localeCompare(a.type || "");
        case "mode-asc":
          return (a.mode || "").localeCompare(b.mode || "");
        case "mode-desc":
          return (b.mode || "").localeCompare(a.mode || "");
        case "status-asc":
          return a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
        case "status-desc":
          return a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1;
        default:
          return 0;
      }
    });
    return list;
  }, [filteredTemplate, templateSort]);

  // Paginated Templates
  const totalTemplatePages = useMemo(() => {
    if (pageSize === "all") return 1;
    const size = Number(pageSize) || 30;
    return Math.max(1, Math.ceil(sortedTemplate.length / size));
  }, [sortedTemplate.length, pageSize]);

  const validTemplatePage = Math.min(Math.max(1, currentPage), totalTemplatePages);

  const paginatedTemplates = useMemo(() => {
    if (pageSize === "all") return sortedTemplate;
    const size = Number(pageSize) || 30;
    const start = (validTemplatePage - 1) * size;
    return sortedTemplate.slice(start, start + size);
  }, [sortedTemplate, validTemplatePage, pageSize]);

  // Filtered & Sorted Block Rules
  const qBlock = blockSearch.trim().toLowerCase();
  const filteredBlock = useMemo(() => {
    return blockRules.filter((r) => {
      if (blockStatusFilter === "active" && !r.isActive) return false;
      if (blockStatusFilter === "inactive" && r.isActive) return false;
      if (!qBlock) return true;
      return [r.name, r.pattern, ...(r.keywords ?? [])].join(" ").toLowerCase().includes(qBlock);
    });
  }, [blockRules, blockStatusFilter, qBlock]);

  const sortedBlock = useMemo(() => {
    const list = [...filteredBlock];
    list.sort((a, b) => {
      switch (blockSort) {
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "");
        case "name-desc":
          return (b.name || "").localeCompare(a.name || "");
        case "date-desc": {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        }
        case "date-asc": {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        }
        case "status-asc":
          return a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
        case "status-desc":
          return a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1;
        default:
          return 0;
      }
    });
    return list;
  }, [filteredBlock, blockSort]);

  const totalBlockPages = useMemo(() => {
    if (blockPageSize === "all") return 1;
    const size = Number(blockPageSize) || 20;
    return Math.max(1, Math.ceil(sortedBlock.length / size));
  }, [sortedBlock.length, blockPageSize]);

  const validBlockPage = Math.min(Math.max(1, blockCurrentPage), totalBlockPages);

  const paginatedBlocks = useMemo(() => {
    if (blockPageSize === "all") return sortedBlock;
    const size = Number(blockPageSize) || 20;
    const start = (validBlockPage - 1) * size;
    return sortedBlock.slice(start, start + size);
  }, [sortedBlock, validBlockPage, blockPageSize]);

  // Reset filters
  const resetTemplateFilters = () => {
    setSearch("");
    setBankFilter("all");
    setTypeFilter("all");
    setModeFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const resetBlockFilters = () => {
    setBlockSearch("");
    setBlockStatusFilter("all");
    setBlockCurrentPage(1);
  };

  // Quick Inline Status Toggles
  async function handleToggleTemplateActive(rule: SmsTemplateRule) {
    const nextActive = !rule.isActive;
    setTogglingId(rule.id);
    setTemplateRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, isActive: nextActive } : item)),
    );
    try {
      await saveSmsTemplateRule({ ...rule, isActive: nextActive }, adminId);
      onNotify({
        title: `Template ${nextActive ? "activated" : "deactivated"}`,
        description: `${rule.bankName} (${rule.mode}) is now ${nextActive ? "active" : "inactive"}.`,
      });
    } catch {
      // Revert on failure
      setTemplateRules((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, isActive: rule.isActive } : item)),
      );
      onNotify({
        title: "Failed to update status",
        description: "Check admin permissions.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleBlockActive(rule: SmsBlockRule) {
    const nextActive = !rule.isActive;
    setTogglingId(rule.id);
    setBlockRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, isActive: nextActive } : item)),
    );
    try {
      await saveSmsBlockRule({ ...rule, isActive: nextActive }, adminId);
      onNotify({
        title: `Block rule ${nextActive ? "activated" : "deactivated"}`,
        description: `"${rule.name}" is now ${nextActive ? "active" : "inactive"}.`,
      });
    } catch {
      setBlockRules((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, isActive: rule.isActive } : item)),
      );
      onNotify({
        title: "Failed to update status",
        description: "Check admin permissions.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  // Quick Copy Pattern
  function handleCopyPattern(id: string, pattern: string) {
    if (!pattern) return;
    void navigator.clipboard.writeText(pattern);
    setCopiedPatternId(id);
    setTimeout(() => setCopiedPatternId(null), 2000);
    onNotify({ title: "Copied pattern to clipboard" });
  }

  // Template Save from Modal
  async function handleSaveTaggedTemplate(
    rule: Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt">,
  ) {
    setSaving(true);
    try {
      const saved = await saveSmsTemplateRule(
        { ...rule, isActive: rule.isActive ?? true },
        adminId,
      );
      setTemplateRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setTemplateTrainer(null);
      onNotify({
        title: "Template saved",
        description: "Word tags → pattern. Phones pull on next rules refresh.",
      });
    } catch {
      onNotify({
        title: "Failed to save template",
        description: "Check admin permissions and schema.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Block Rule Save from Modal
  async function handleSaveBlock() {
    if (!editingBlock) return;
    if (!editingBlock.name.trim()) {
      onNotify({ title: "Block rule name is required" });
      return;
    }
    if (!editingBlock.keywords.length && !editingBlock.pattern?.trim()) {
      onNotify({ title: "Add keywords or a regex pattern to block" });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSmsBlockRule(editingBlock, adminId);
      setBlockRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setEditingBlock(null);
      onNotify({ title: "Block rule saved — OTP/promo ignored on mobile" });
    } catch {
      onNotify({
        title: "Failed to save block rule",
        description: "Check admin permissions and schema.",
      });
    } finally {
      setSaving(false);
    }
  }

  function startNewBlock() {
    setEditingBlock({
      id: crypto.randomUUID(),
      name: "",
      keywords: ["otp", "one time password"],
      pattern: "",
      sampleMessage: "",
      similarityThreshold: 0.6,
      isActive: true,
    });
  }

  function startNewTemplate() {
    setEditingBlock(null);
    setTemplateTrainer("new");
  }

  // Column sort togglers
  function toggleTemplateColumnSort(columnKey: string) {
    setCurrentPage(1);
    switch (columnKey) {
      case "bank":
        setTemplateSort((prev) => (prev === "bank-asc" ? "bank-desc" : "bank-asc"));
        break;
      case "type":
        setTemplateSort((prev) => (prev === "type-asc" ? "type-desc" : "type-asc"));
        break;
      case "mode":
        setTemplateSort((prev) => (prev === "mode-asc" ? "mode-desc" : "mode-asc"));
        break;
      case "date":
        setTemplateSort((prev) => (prev === "date-desc" ? "date-asc" : "date-desc"));
        break;
      case "status":
        setTemplateSort((prev) => (prev === "status-asc" ? "status-desc" : "status-asc"));
        break;
    }
  }

  function toggleBlockColumnSort(columnKey: string) {
    setBlockCurrentPage(1);
    switch (columnKey) {
      case "name":
        setBlockSort((prev) => (prev === "name-asc" ? "name-desc" : "name-asc"));
        break;
      case "date":
        setBlockSort((prev) => (prev === "date-desc" ? "date-asc" : "date-desc"));
        break;
      case "status":
        setBlockSort((prev) => (prev === "status-asc" ? "status-desc" : "status-asc"));
        break;
    }
  }

  // Stats calculation
  const activeTemplateCount = useMemo(
    () => templateRules.filter((r) => r.isActive).length,
    [templateRules],
  );
  const activeBlockCount = useMemo(
    () => blockRules.filter((r) => r.isActive).length,
    [blockRules],
  );

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/20 p-5 dark:border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="size-5" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold">SMS Rules & Templates</CardTitle>
              <CardDescription className="max-w-xl text-xs leading-relaxed">
                Bank parse templates (how SMS becomes transactions) and block rules (OTP/promo to
                ignore). Phones sync these shared defaults automatically.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 font-medium text-foreground shadow-2xs">
              <span className="size-2 rounded-full bg-emerald-500" />
              Templates: <strong>{templateRules.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 font-medium text-foreground shadow-2xs">
              <span className="size-2 rounded-full bg-amber-500" />
              Blocked: <strong>{blockRules.length}</strong>
            </span>
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Templates</span>
              <Smartphone className="size-4 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-foreground">{templateRules.length}</span>
              <span className="text-[11px] text-muted-foreground">({activeTemplateCount} active)</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Providers</span>
              <Building2 className="size-4 text-sky-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-foreground">{uniqueBanks.length}</span>
              <span className="text-[11px] text-muted-foreground">banks & wallets</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Block Rules</span>
              <Ban className="size-4 text-amber-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-foreground">{blockRules.length}</span>
              <span className="text-[11px] text-muted-foreground">({activeBlockCount} active)</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Filtered View</span>
              <Filter className="size-4 text-primary" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-foreground">
                {activeTab === "template" ? filteredTemplate.length : filteredBlock.length}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {activeTab === "template"
                  ? activeTemplateFilterCount > 0
                    ? `(${activeTemplateFilterCount} active)`
                    : "all shown"
                  : activeBlockFilterCount > 0
                  ? `(${activeBlockFilterCount} active)`
                  : "all shown"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(tabLabels) as RuleTab[]).map((tab) => (
              <Button
                key={tab}
                className={cn(
                  "h-8 text-xs font-semibold shadow-2xs",
                  activeTab === tab
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setTemplateTrainer(null);
                  setEditingBlock(null);
                }}
              >
                {tab === "block" ? <Ban className="mr-1.5 size-3.5" /> : null}
                {tabLabels[tab]}
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                    activeTab === tab
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {tab === "template" ? templateRules.length : blockRules.length}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{tabHints[activeTab]}</p>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {/* ── TEMPLATES FILTER & ACTION TOOLBAR ── */}
        {activeTab === "template" && (
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              {/* Filter inputs wrap */}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative min-w-[180px] flex-1 max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 pr-7 text-xs"
                    placeholder="Search bank, pattern, tokens, keywords…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setCurrentPage(1);
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Provider Filter Tabs: All | Wallets | Banks */}
                <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setBankFilter("all");
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-semibold transition-all",
                      bankFilter === "all"
                        ? "bg-background text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All ({templateRules.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBankFilter("__wallets_only__");
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all",
                      bankFilter === "__wallets_only__"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Filter all digital wallet templates"
                  >
                    <Wallet className="size-3 text-amber-500" />
                    Wallets ({walletRulesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBankFilter("__banks_only__");
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all",
                      bankFilter === "__banks_only__"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Filter all bank templates"
                  >
                    <Building2 className="size-3 text-sky-500" />
                    Banks ({bankRulesCount})
                  </button>
                </div>

                {/* Bank / Wallet Filter Dropdown */}
                <select
                  aria-label="Filter by bank or wallet"
                  className={selectFilterClass}
                  value={bankFilter}
                  onChange={(e) => {
                    setBankFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Providers ({uniqueBanks.length})</option>
                  <option value="__wallets_only__">👛 All Digital Wallets ({walletRulesCount})</option>
                  <option value="__banks_only__">🏦 All Banks Only ({bankRulesCount})</option>
                  <optgroup label={`👛 Digital Wallets (${allWallets.length})`}>
                    {allWallets.map((wallet) => (
                      <option key={wallet} value={wallet}>
                        👛 {wallet} {providerRuleCounts[wallet] !== undefined ? `(${providerRuleCounts[wallet]})` : "(0)"}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`🏦 Commercial & Payments Banks (${allBanks.length})`}>
                    {allBanks.map((bank) => (
                      <option key={bank} value={bank}>
                        🏦 {bank} {providerRuleCounts[bank] !== undefined ? `(${providerRuleCounts[bank]})` : "(0)"}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* Type Filter */}
                <select
                  aria-label="Filter by transaction type"
                  className={selectFilterClass}
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                  <option value="transfer">Transfer</option>
                  {uniqueTypes
                    .filter((t) => !["debit", "credit", "transfer"].includes(t))
                    .map((t) => (
                      <option key={t} value={t}>
                        {t.toUpperCase()}
                      </option>
                    ))}
                </select>

                {/* Mode Filter */}
                <select
                  aria-label="Filter by payment mode"
                  className={selectFilterClass}
                  value={modeFilter}
                  onChange={(e) => {
                    setModeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Modes ({uniqueModes.length})</option>
                  {uniqueModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatMode(mode)}
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  aria-label="Filter by status"
                  className={selectFilterClass}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>

                {/* Sort By Dropdown */}
                <div className="flex items-center gap-1">
                  <select
                    aria-label="Sort templates"
                    className={selectFilterClass}
                    value={templateSort}
                    onChange={(e) => {
                      setTemplateSort(e.target.value as TemplateSortOption);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="bank-asc">Sort: Bank / Wallet (A–Z)</option>
                    <option value="bank-desc">Sort: Bank / Wallet (Z–A)</option>
                    <option value="date-desc">Sort: Newest First</option>
                    <option value="date-asc">Sort: Oldest First</option>
                    <option value="type-asc">Sort: Type (A–Z)</option>
                    <option value="mode-asc">Sort: Mode (A–Z)</option>
                    <option value="status-asc">Sort: Active First</option>
                    <option value="status-desc">Sort: Inactive First</option>
                  </select>
                </div>

                {/* Page Size Dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-[11px] font-medium hidden sm:inline">Per page:</span>
                  <select
                    aria-label="Templates per page"
                    className={cn(selectFilterClass, "h-9 w-20 px-2")}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(e.target.value as PageSizeOption);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="all">All</option>
                  </select>
                </div>

                {/* Reset button if any filter applied */}
                {activeTemplateFilterCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={resetTemplateFilters}
                  >
                    <RotateCcw className="mr-1.5 size-3" />
                    Reset
                  </Button>
                )}
              </div>

              {/* Add template button */}
              <Button
                className="h-9 text-xs font-semibold shrink-0"
                type="button"
                onClick={startNewTemplate}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add template
              </Button>
            </div>

            {/* Active filter badges row */}
            {activeTemplateFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="flex items-center gap-1 font-semibold text-muted-foreground mr-1 text-[11px]">
                  <Filter className="size-3 text-primary" />
                  {activeTemplateFilterCount} {activeTemplateFilterCount === 1 ? "filter" : "filters"} applied:
                </span>

                {search.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Search: “{search}”
                    <button
                      type="button"
                      aria-label="Remove search filter"
                      onClick={() => {
                        setSearch("");
                        setCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {bankFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Provider:{" "}
                    {bankFilter === "__wallets_only__"
                      ? "👛 All Wallets"
                      : bankFilter === "__banks_only__"
                      ? "🏦 All Banks"
                      : isWalletProvider(bankFilter)
                      ? `👛 ${bankFilter}`
                      : `🏦 ${bankFilter}`}
                    <button
                      type="button"
                      aria-label="Remove bank filter"
                      onClick={() => {
                        setBankFilter("all");
                        setCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {typeFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Type: {typeFilter}
                    <button
                      type="button"
                      aria-label="Remove type filter"
                      onClick={() => {
                        setTypeFilter("all");
                        setCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {modeFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Mode: {formatMode(modeFilter)}
                    <button
                      type="button"
                      aria-label="Remove mode filter"
                      onClick={() => {
                        setModeFilter("all");
                        setCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {statusFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Status: {statusFilter}
                    <button
                      type="button"
                      aria-label="Remove status filter"
                      onClick={() => {
                        setStatusFilter("all");
                        setCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                  onClick={resetTemplateFilters}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── BLOCK SMS FILTER & ACTION TOOLBAR ── */}
        {activeTab === "block" && (
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 pr-7 text-xs"
                    placeholder="Search block rule name, keywords, regex…"
                    value={blockSearch}
                    onChange={(e) => {
                      setBlockSearch(e.target.value);
                      setBlockCurrentPage(1);
                    }}
                  />
                  {blockSearch && (
                    <button
                      type="button"
                      aria-label="Clear block search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setBlockSearch("");
                        setBlockCurrentPage(1);
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <select
                  aria-label="Filter by block status"
                  className={selectFilterClass}
                  value={blockStatusFilter}
                  onChange={(e) => {
                    setBlockStatusFilter(e.target.value);
                    setBlockCurrentPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>

                <select
                  aria-label="Sort block rules"
                  className={selectFilterClass}
                  value={blockSort}
                  onChange={(e) => {
                    setBlockSort(e.target.value as BlockSortOption);
                    setBlockCurrentPage(1);
                  }}
                >
                  <option value="name-asc">Sort: Name (A–Z)</option>
                  <option value="name-desc">Sort: Name (Z–A)</option>
                  <option value="date-desc">Sort: Newest First</option>
                  <option value="date-asc">Sort: Oldest First</option>
                  <option value="status-asc">Sort: Active First</option>
                  <option value="status-desc">Sort: Inactive First</option>
                </select>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-[11px] font-medium hidden sm:inline">Per page:</span>
                  <select
                    aria-label="Block rules per page"
                    className={cn(selectFilterClass, "h-9 w-20 px-2")}
                    value={blockPageSize}
                    onChange={(e) => {
                      setBlockPageSize(e.target.value as PageSizeOption);
                      setBlockCurrentPage(1);
                    }}
                  >
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="all">All</option>
                  </select>
                </div>

                {activeBlockFilterCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={resetBlockFilters}
                  >
                    <RotateCcw className="mr-1.5 size-3" />
                    Reset
                  </Button>
                )}
              </div>

              <Button
                className="h-9 text-xs font-semibold shrink-0"
                type="button"
                onClick={startNewBlock}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add block rule
              </Button>
            </div>

            {/* Active filter badges row for block */}
            {activeBlockFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="flex items-center gap-1 font-semibold text-muted-foreground mr-1 text-[11px]">
                  <Filter className="size-3 text-primary" />
                  {activeBlockFilterCount} {activeBlockFilterCount === 1 ? "filter" : "filters"} applied:
                </span>

                {blockSearch.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Search: “{blockSearch}”
                    <button
                      type="button"
                      aria-label="Remove search filter"
                      onClick={() => {
                        setBlockSearch("");
                        setBlockCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {blockStatusFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium">
                    Status: {blockStatusFilter}
                    <button
                      type="button"
                      aria-label="Remove status filter"
                      onClick={() => {
                        setBlockStatusFilter("all");
                        setBlockCurrentPage(1);
                      }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                  onClick={resetBlockFilters}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : null}

        {/* ── TEMPLATES TABLE ── */}
        {!loading && activeTab === "template" ? (
          <div className="space-y-3">
            <RulesTable
              emptyLabel={
                activeTemplateFilterCount > 0
                  ? "No SMS templates match your filter criteria. Try resetting filters or changing your search."
                  : "No templates yet. Seed bank catalog or click 'Add template' above."
              }
              onResetFilters={activeTemplateFilterCount > 0 ? resetTemplateFilters : undefined}
              headers={[
                { label: "Bank / Wallet", key: "bank", sortable: true },
                { label: "Type", key: "type", sortable: true },
                { label: "Mode", key: "mode", sortable: true },
                { label: "Template Pattern & Keywords" },
                { label: "Created Date", key: "date", sortable: true },
                { label: "Status", key: "status", sortable: true },
                { label: "Actions", align: "right" },
              ]}
              currentSortKey={
                templateSort.startsWith("bank")
                  ? "bank"
                  : templateSort.startsWith("type")
                  ? "type"
                  : templateSort.startsWith("mode")
                  ? "mode"
                  : templateSort.startsWith("date")
                  ? "date"
                  : templateSort.startsWith("status")
                  ? "status"
                  : undefined
              }
              currentSortDir={templateSort.endsWith("desc") ? "desc" : "asc"}
              onSortColumn={toggleTemplateColumnSort}
              rows={paginatedTemplates.map((rule) => {
                const isWallet = isWalletProvider(rule.bankName, rule.mode);
                return {
                  id: rule.id,
                  cells: [
                    <div key="bank" className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        {isWallet ? (
                          <Wallet className="size-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Building2 className="size-3.5 text-sky-500 shrink-0" />
                        )}
                        <span>{rule.bankName}</span>
                      </span>
                      {isWallet && (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Digital Wallet
                        </span>
                      )}
                      {rule.sampleMessage && (
                        <span
                          className="max-w-[200px] truncate text-[10px] text-muted-foreground"
                          title={rule.sampleMessage}
                        >
                          “{rule.sampleMessage}”
                        </span>
                      )}
                    </div>,
                    <span
                      key="type"
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                        rule.type === "debit"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : rule.type === "credit"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                      )}
                    >
                      {rule.type}
                    </span>,
                    <span
                      key="mode"
                      className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium"
                    >
                      {formatMode(rule.mode)}
                    </span>,
                    <div key="pattern" className="flex flex-col gap-1 max-w-[280px]">
                      <div className="flex items-center gap-1">
                        <span
                          className="truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                          title={rule.templatePattern}
                        >
                          {rule.templatePattern || "—"}
                        </span>
                        {rule.templatePattern && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                            title="Copy pattern"
                            onClick={() => handleCopyPattern(rule.id, rule.templatePattern)}
                          >
                            {copiedPatternId === rule.id ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </Button>
                        )}
                      </div>
                      {rule.keywords?.length > 0 && (
                        <span
                          className="truncate text-[10px] text-muted-foreground"
                          title={rule.keywords.join(", ")}
                        >
                          Tags: {rule.keywords.join(", ")}
                        </span>
                      )}
                    </div>,
                    <span
                      key="created"
                      className="whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                    >
                      {formatDateSafe(rule.createdAt)}
                    </span>,
                    <button
                      key="status"
                      type="button"
                      disabled={togglingId === rule.id}
                      onClick={() => void handleToggleTemplateActive(rule)}
                      className={cn(
                        "group inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:scale-105",
                        rule.isActive
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                      title="Click to toggle status"
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          rule.isActive ? "bg-emerald-500" : "bg-muted-foreground",
                        )}
                      />
                      <span>{rule.isActive ? "Active" : "Inactive"}</span>
                    </button>,
                  ],
                  onEdit: () => {
                    setEditingBlock(null);
                    setTemplateTrainer(rule);
                  },
                  onDelete: async () => {
                    if (!window.confirm(`Delete template for “${rule.bankName}”?`)) {
                      return;
                    }
                    try {
                      await deleteSmsTemplateRule(rule.id);
                      setTemplateRules((current) =>
                        current.filter((item) => item.id !== rule.id),
                      );
                      onNotify({ title: "Template deleted" });
                    } catch (err) {
                      onNotify({
                        title: "Failed to delete template",
                        description: err instanceof Error ? err.message : "Database error.",
                      });
                    }
                  },
                };
              })}
            />

            {/* Pagination controls */}
            {filteredTemplate.length > 0 && (
              <PaginationBar
                currentPage={validTemplatePage}
                totalPages={totalTemplatePages}
                pageSize={pageSize}
                totalItems={templateRules.length}
                filteredCount={filteredTemplate.length}
                itemName="templates"
                pageSizeOptions={["20", "30", "50", "100", "all"]}
                onPageChange={setCurrentPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz as PageSizeOption);
                  setCurrentPage(1);
                }}
              />
            )}
          </div>
        ) : null}

        {/* ── BLOCK SMS TABLE ── */}
        {!loading && activeTab === "block" ? (
          <div className="space-y-3">
            <RulesTable
              emptyLabel={
                activeBlockFilterCount > 0
                  ? "No block rules match your filter criteria. Try resetting filters."
                  : "No block rules yet. Click 'Add block rule' to block OTP or promo SMS."
              }
              onResetFilters={activeBlockFilterCount > 0 ? resetBlockFilters : undefined}
              headers={[
                { label: "Rule Name", key: "name", sortable: true },
                { label: "Blocked Keywords & Pattern" },
                { label: "Similarity Threshold" },
                { label: "Created Date", key: "date", sortable: true },
                { label: "Status", key: "status", sortable: true },
                { label: "Actions", align: "right" },
              ]}
              currentSortKey={
                blockSort.startsWith("name")
                  ? "name"
                  : blockSort.startsWith("date")
                  ? "date"
                  : blockSort.startsWith("status")
                  ? "status"
                  : undefined
              }
              currentSortDir={blockSort.endsWith("desc") ? "desc" : "asc"}
              onSortColumn={toggleBlockColumnSort}
              rows={paginatedBlocks.map((rule) => ({
                id: rule.id,
                cells: [
                  <div key="name" className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground">{rule.name}</span>
                    {rule.sampleMessage && (
                      <span
                        className="max-w-[200px] truncate text-[10px] text-muted-foreground"
                        title={rule.sampleMessage}
                      >
                        “{rule.sampleMessage}”
                      </span>
                    )}
                  </div>,
                  <div key="keywords" className="flex flex-col gap-1 max-w-[280px]">
                    <span
                      className="truncate text-xs text-foreground font-medium"
                      title={rule.keywords.join(", ")}
                    >
                      {rule.keywords.join(", ") || "—"}
                    </span>
                    {rule.pattern && (
                      <span
                        className="truncate font-mono text-[10px] text-muted-foreground bg-muted/50 rounded px-1"
                        title={rule.pattern}
                      >
                        Pattern: {rule.pattern}
                      </span>
                    )}
                  </div>,
                  <span
                    key="threshold"
                    className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                  >
                    {rule.similarityThreshold}
                  </span>,
                  <span
                    key="created"
                    className="whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                  >
                    {formatDateSafe(rule.createdAt)}
                  </span>,
                  <button
                    key="status"
                    type="button"
                    disabled={togglingId === rule.id}
                    onClick={() => void handleToggleBlockActive(rule)}
                    className={cn(
                      "group inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:scale-105",
                      rule.isActive
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                    title="Click to toggle status"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        rule.isActive ? "bg-emerald-500" : "bg-muted-foreground",
                      )}
                    />
                    <span>{rule.isActive ? "Active" : "Inactive"}</span>
                  </button>,
                ],
                onEdit: () => {
                  setTemplateTrainer(null);
                  setEditingBlock(rule);
                },
                onDelete: async () => {
                  if (!window.confirm(`Delete block rule “${rule.name}”?`)) return;
                  try {
                    await deleteSmsBlockRule(rule.id);
                    setBlockRules((current) => current.filter((item) => item.id !== rule.id));
                    onNotify({ title: "Block rule deleted" });
                  } catch (err) {
                    onNotify({
                      title: "Failed to delete block rule",
                      description: err instanceof Error ? err.message : "Database error.",
                    });
                  }
                },
              }))}
            />

            {/* Pagination controls */}
            {filteredBlock.length > 0 && (
              <PaginationBar
                currentPage={validBlockPage}
                totalPages={totalBlockPages}
                pageSize={blockPageSize}
                totalItems={blockRules.length}
                filteredCount={filteredBlock.length}
                itemName="block rules"
                pageSizeOptions={["20", "30", "50", "all"]}
                onPageChange={setBlockCurrentPage}
                onPageSizeChange={(sz) => {
                  setBlockPageSize(sz as PageSizeOption);
                  setBlockCurrentPage(1);
                }}
              />
            )}
          </div>
        ) : null}
      </CardContent>

      {/* ── Template add/edit popup ── */}
      <Dialog
        open={templateTrainer != null}
        onOpenChange={(open) => {
          if (!open) setTemplateTrainer(null);
        }}
      >
        <DialogContent
          className="flex max-h-[min(92vh,900px)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <div className="flex items-center gap-2">
              <DialogTitle>
                {templateTrainer === "new" || !templateTrainer
                  ? "Add SMS template"
                  : `Edit template · ${templateTrainer.bankName || "rule"}`}
              </DialogTitle>
              {templateTrainer && templateTrainer !== "new" && (
                <Badge
                  className={cn(
                    "text-[10px] uppercase font-semibold",
                    templateTrainer.isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {templateTrainer.isActive ? "Active" : "Inactive / Draft"}
                </Badge>
              )}
            </div>
            <DialogDescription>
              Paste a bank SMS, tag each word (Amount, Title, Card last4…), set Active / Inactive, then Save.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {templateTrainer != null ? (
              <SmsTemplateTagger
                key={templateTrainer === "new" ? "new-template" : templateTrainer.id}
                embedded
                existing={templateTrainer === "new" ? null : templateTrainer}
                saving={saving}
                onCancel={() => setTemplateTrainer(null)}
                onSave={(rule) => void handleSaveTaggedTemplate(rule)}
                dbBanks={uniqueBanks}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Block add/edit popup ── */}
      <Dialog
        open={editingBlock != null}
        onOpenChange={(open) => {
          if (!open) setEditingBlock(null);
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,720px)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle>
              {editingBlock?.name ? `Edit block · ${editingBlock.name}` : "Add block rule"}
            </DialogTitle>
            <DialogDescription>
              OTP / promo / spam keywords. Matching SMS never become transactions.
            </DialogDescription>
          </DialogHeader>
          {editingBlock ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <Field label="Sample SMS to block (optional)">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
                  placeholder="Your OTP is 482910. Do not share with anyone."
                  value={editingBlock.sampleMessage ?? ""}
                  onChange={(event) => {
                    const sample = event.target.value;
                    setEditingBlock((current) => {
                      if (!current) return current;
                      const next = { ...current, sampleMessage: sample };
                      if (!current.keywords.length && sample.trim()) {
                        next.keywords = extractKeywordsFromSample(sample);
                      }
                      if (!current.name.trim() && sample.trim()) {
                        next.name = "OTP / verification";
                      }
                      return next;
                    });
                  }}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rule name">
                  <Input
                    placeholder="OTP block, Promo SMS…"
                    value={editingBlock.name}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </Field>
                <Field label="Similarity threshold (0–1)">
                  <Input
                    inputMode="decimal"
                    max={1}
                    min={0}
                    step={0.1}
                    type="number"
                    value={editingBlock.similarityThreshold}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current
                          ? {
                              ...current,
                              similarityThreshold: Number(event.target.value) || 0,
                            }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Keywords (comma-separated)">
                <Input
                  placeholder="otp, one time password, do not share"
                  value={formatKeywordList(editingBlock.keywords)}
                  onChange={(event) =>
                    setEditingBlock((current) =>
                      current
                        ? {
                            ...current,
                            keywords: parseKeywordList(event.target.value),
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Regex pattern (optional)">
                <Input
                  className="font-mono text-xs"
                  placeholder="otp|one.?time.?password"
                  value={editingBlock.pattern ?? ""}
                  onChange={(event) =>
                    setEditingBlock((current) =>
                      current ? { ...current, pattern: event.target.value } : current,
                    )
                  }
                />
              </Field>
              <ActiveToggle
                checked={editingBlock.isActive}
                onCheckedChange={(checked) =>
                  setEditingBlock((current) =>
                    current ? { ...current, isActive: checked } : current,
                  )
                }
              />
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">Also block app notifications</span>
                  <span className="text-xs text-muted-foreground">
                    Off: SMS only. On: the same rule also hides matching payment-app
                    notifications. Needs the P3 block-rules SQL.
                  </span>
                </span>
                <Switch
                  checked={editingBlock.appliesToNotifications === true}
                  onCheckedChange={(checked) =>
                    setEditingBlock((current) =>
                      current ? { ...current, appliesToNotifications: checked } : current,
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          <div className="flex shrink-0 gap-2 border-t border-border bg-muted/40 px-5 py-3">
            <Button
              className="h-9"
              disabled={saving}
              type="button"
              onClick={() => void handleSaveBlock()}
            >
              <Save className="mr-1.5 size-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              className="h-9"
              type="button"
              variant="outline"
              onClick={() => setEditingBlock(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ActiveToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium">Active (synced to mobile)</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

type TableHeaderConfig = {
  label: string;
  key?: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
};

function RulesTable({
  headers,
  rows,
  emptyLabel,
  currentSortKey,
  currentSortDir,
  onSortColumn,
  onResetFilters,
}: {
  headers: (string | TableHeaderConfig)[];
  rows: Array<{
    id: string;
    cells: ReactNode[];
    onEdit: () => void;
    onDelete: () => Promise<void>;
  }>;
  emptyLabel: string;
  currentSortKey?: string;
  currentSortDir?: "asc" | "desc";
  onSortColumn?: (key: string) => void;
  onResetFilters?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center">
        <Search className="size-8 text-muted-foreground/60 mb-2" />
        <p className="text-sm font-medium text-foreground">{emptyLabel}</p>
        {onResetFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
            onClick={onResetFilters}
          >
            <RotateCcw className="mr-1.5 size-3" />
            Reset all filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {headers.map((headerItem, idx) => {
              const header: TableHeaderConfig =
                typeof headerItem === "string" ? { label: headerItem } : headerItem;
              const isSortable = Boolean(header.sortable && header.key && onSortColumn);
              const isCurrent = header.key === currentSortKey;

              return (
                <TableHead
                  key={header.key || header.label || `h-${idx}`}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none",
                    header.align === "right" && "text-right",
                  )}
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => onSortColumn!(header.key!)}
                      className={cn(
                        "group inline-flex items-center gap-1 hover:text-foreground transition-colors",
                        isCurrent && "text-primary font-extrabold",
                      )}
                      title={`Sort by ${header.label}`}
                    >
                      <span>{header.label}</span>
                      {isCurrent ? (
                        currentSortDir === "asc" ? (
                          <ArrowUp className="size-3 text-primary" />
                        ) : (
                          <ArrowDown className="size-3 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      )}
                    </button>
                  ) : (
                    header.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
              {row.cells.map((cell, index) => (
                <TableCell key={`${row.id}-${index}`} className="text-xs py-3">
                  {cell}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap text-right py-3">
                <Button
                  className="h-7 px-2.5 text-xs font-medium"
                  type="button"
                  variant="ghost"
                  onClick={row.onEdit}
                >
                  Edit
                </Button>
                <Button
                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  type="button"
                  variant="ghost"
                  title="Delete rule"
                  onClick={() => void row.onDelete()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PaginationBar({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  filteredCount,
  itemName = "items",
  pageSizeOptions = ["20", "30", "50", "100", "all"],
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: string;
  totalItems: number;
  filteredCount: number;
  itemName?: string;
  pageSizeOptions?: string[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: string) => void;
}) {
  const numSize = pageSize === "all" ? filteredCount : Number(pageSize) || 30;
  const startItem = filteredCount === 0 ? 0 : (currentPage - 1) * numSize + 1;
  const endItem = Math.min(currentPage * numSize, filteredCount);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
      {/* Left: item counter and per page select */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div>
          Showing <strong className="font-semibold text-foreground">{startItem}</strong>–
          <strong className="font-semibold text-foreground">{endItem}</strong> of{" "}
          <strong className="font-semibold text-foreground">{filteredCount}</strong> {itemName}
          {filteredCount !== totalItems && (
            <span className="ml-1 text-[11px] text-muted-foreground/80">
              (filtered from {totalItems})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-border/80">
          <span className="text-[11px]">Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            aria-label="Items per page"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All" : opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: navigation buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* First page */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            title="First page"
          >
            <ChevronsLeft className="size-3.5" />
          </Button>

          {/* Previous page */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            title="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 px-1">
            {pageNumbers.map((p, idx) =>
              p === "..." ? (
                <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={`page-${p}`}
                  type="button"
                  variant={currentPage === p ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 min-w-7 px-2 text-xs font-medium",
                    currentPage === p && "shadow-xs",
                  )}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              ),
            )}
          </div>

          {/* Next page */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            title="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>

          {/* Last page */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title="Last page"
          >
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
