"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Calendar,
  Clock,
  FileText,
  Hash,
  IndianRupee,
  Landmark,
  MapPin,
  Plus,
  ShoppingBag,
  Split,
  StickyNote,
  Store,
  Tag,
  Target,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useCategories } from "@/hooks/useCategories";
import { useContributors } from "@/hooks/useContributors";
import { useMerchants } from "@/hooks/useMerchants";
import { useFriends } from "@/hooks/useFriends";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { useOutings } from "@/hooks/useOutings";
import { usePurposes } from "@/hooks/usePurposes";
import {
  getActivePurposes,
  getDefaultPersonalPurpose,
  getPurposeById,
  resolvePurposeId,
} from "@/lib/purposes";
import { useTransactions } from "@/hooks/useTransactions";
import { findLikelyDuplicate } from "@/lib/transaction-summary";
import { buildExpenseSplits } from "@/lib/outings";
import { syncOutingRollupLedger } from "@/lib/outing-ledger-sync";
import { saveOutingExpense } from "@/lib/supabase-data";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { queryKeys } from "@/lib/query-keys";
import {
  getCategoryIcon,
  getTransactionTypeMeta,
  transactionTypeMeta,
} from "@/lib/transaction-ui";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  ContributorSource,
  OutingExpense,
  SplitType,
  Transaction,
  TripMember,
} from "@/types";

/**
 * Shared form for Add Income / Add Expense (web + app parity).
 *
 * Three mutually-exclusive transaction modes:
 *  - Normal — single Category + single Purpose (today's default).
 *  - Split Expense — Purpose Split (one Category, multiple Purpose/Amount
 *    rows) or Category Split (one Purpose, multiple Category/Amount rows).
 *    Writes multiple `transaction_splits` rows for one transaction.
 *  - Split with Friends — splits the amount across you + selected friends
 *    using the hidden "quick split" outing architecture (`isQuickSplit`).
 *
 * Trip mode (adding/editing an expense that belongs to a real, named
 * outing) is a separate, unrelated flow reached only via `lockedOutingId`/
 * `initialExpense` (opened from inside that outing's own page) — it does
 * not appear in the general Add/Edit form described above.
 *
 * Manual add: date/time only when "Past transaction" is on; off = now.
 * SMS auto-detect uses the real SMS timestamp (separate flow, not this form)
 * and always creates a Normal transaction — splitting only ever happens
 * here, manually.
 */
const transactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.preprocess(
    (value) => Number(value),
    z.number().positive("Amount is required"),
  ),
  merchant: z.string().min(1, "Merchant / Title is required"),
  category: z.string().min(1, "Category is required"),
  account: z.string().min(1, "Account is required"),
  purpose: z.string().min(1, "Purpose is required"),
  /** Optional custom display title (e.g. "College Backpack") — independent
   * of Split Expense, purely descriptive. */
  title: z.string().optional(),
  /** YYYY-MM-DD — only used when past transaction is on */
  date: z.string().optional(),
  /** HH:mm (24h) — only used when past transaction is on */
  time: z.string().optional(),
  /** Optional UPI / merchant identifier (lookup key, not display title) */
  reference: z.string().optional(),
  note: z.string().optional(),
  contributorSource: z.string().optional(),
});

function toLocalDatePart(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, "0");
    const day = String(n.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalTimePart(iso?: string) {
  if (!iso) {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combine local date + time into ISO for storage. */
function combineDateTimeLocal(date: string, time: string) {
  const t = time.length === 5 ? `${time}:00` : time;
  const local = new Date(`${date}T${t}`);
  if (Number.isNaN(local.getTime())) return new Date().toISOString();
  return local.toISOString();
}

/** True if any non-empty key repeats — used to block a split row from
 * reusing the same purpose/category (or purpose+category pair) as another
 * row, since that's just an unmerged duplicate rather than a real split. */
function hasDuplicateKeys(keys: string[]) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || key === "::") continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

type TransactionFormValues = z.input<typeof transactionSchema>;
type ParsedTransactionFormValues = z.output<typeof transactionSchema>;

type AddTransactionSlideOverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: Transaction["type"];
  initialValues?: Transaction;
  /** Not called in Trip mode — that path writes an outing_expense directly. */
  onSubmit?: (values: Omit<Transaction, "id">) => Promise<void>;
  onDelete?: (transaction: Transaction) => Promise<void>;
  /** Forces Trip mode onto this specific outing (no picker) — used when
   * opened from inside that outing's own "Add expense" flow. Not reachable
   * from the general Add/Edit Expense form. */
  lockedOutingId?: string;
  /** Editing an existing outing expense (not a plain Transaction) — forces
   * Trip mode and pre-fills payer/split fields from it. */
  initialExpense?: OutingExpense;
  /** Suppresses Trip mode AND the Split Expense / Split with Friends
   * switches entirely (always a plain Normal transaction) — for flows
   * editing a derived row (e.g. the outing rollup transaction) where
   * offering to reclassify it would be confusing. */
  hideOwnerToggle?: boolean;
  /** Opens with Split Expense already switched on — used right after
   * unlinking a transaction from an outing via "Convert to Split
   * Transaction", so the user lands straight in the split rows. */
  forceSplitExpense?: boolean;
};

const fieldInputClassName =
  "h-10 w-full min-w-0 rounded-lg px-3.5 text-sm shadow-none";

const fieldSelectClassName =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const chipClassName =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors";
const chipActiveClassName = "border-primary bg-primary text-primary-foreground";
const chipInactiveClassName = "border-border text-muted-foreground hover:text-foreground";

export function AddTransactionSlideOver({
  open,
  onOpenChange,
  mode = "expense",
  initialValues,
  onSubmit,
  onDelete,
  lockedOutingId,
  initialExpense,
  hideOwnerToggle,
  forceSplitExpense,
}: AddTransactionSlideOverProps) {
  const { accounts } = useAccounts();
  const { categories: allCategories } = useCategories();
  const { purposes } = usePurposes();
  const activePurposes = getActivePurposes(purposes);
  const {
    transactions,
    addTransaction: addTransactionDirect,
    updateTransaction: updateTransactionDirect,
  } = useTransactions();
  const { contributors, defaultContributorName } = useContributors();
  const { merchants } = useMerchants();
  const { outings } = useOutings();
  const { friends } = useFriends();
  const { user } = useAuthReady();
  const queryClient = useQueryClient();

  const activeOutings = useMemo(
    () => outings.filter((item) => item.status === "active" && !item.isQuickSplit),
    [outings],
  );

  const [ownerMode, setOwnerMode] = useState<"me" | "trip">("me");
  const [selectedOutingId, setSelectedOutingId] = useState("");
  const [paidByMemberId, setPaidByMemberId] = useState("");
  const [tripSplitType, setTripSplitType] = useState<SplitType>("equally");
  const [customSplitAmounts, setCustomSplitAmounts] = useState<
    Record<string, string>
  >({});
  const [tripSubmitting, setTripSubmitting] = useState(false);

  // ---- Split Expense (Purpose Split / Category Split / Purpose+Category) ----
  const [splitExpenseEnabled, setSplitExpenseEnabled] = useState(false);
  const [splitExpenseMode, setSplitExpenseMode] = useState<
    "purpose" | "category" | "both"
  >("purpose");
  const [purposeSplitRows, setPurposeSplitRows] = useState<
    { id: string; purposeId: string; amount: string }[]
  >([]);
  const [categorySplitRows, setCategorySplitRows] = useState<
    { id: string; categoryId: string; amount: string }[]
  >([]);
  const [bothSplitRows, setBothSplitRows] = useState<
    { id: string; purposeId: string; categoryId: string; amount: string }[]
  >([]);


  // ---- Split with Friends -------------------------------------------------
  const [friendSplitEnabled, setFriendSplitEnabled] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendSplitType, setFriendSplitType] = useState<SplitType>("equally");
  const [friendCustomAmounts, setFriendCustomAmounts] = useState<
    Record<string, string>
  >({});
  const [friendSplitSubmitting, setFriendSplitSubmitting] = useState(false);

  const selectedOuting = useMemo(
    () => outings.find((item) => item.id === selectedOutingId),
    [outings, selectedOutingId],
  );

  // The outing (if any) this transaction is linked to. Friend splits no longer
  // create outings, so any outing link here is a real trip.
  const initialOuting = useMemo(
    () =>
      initialValues?.outingId
        ? outings.find((item) => item.id === initialValues.outingId)
        : undefined,
    [initialValues?.outingId, outings],
  );
  const isEditingRealOutingTransaction = Boolean(initialValues?.outingId);

  /** Split Expense / Split with Friends are only offered for plain
   * transactions — never in Trip mode, never for a transaction already
   * linked to an outing, never for a suppressed derived row (e.g. the
   * outing rollup transaction). */
  const canOfferSplit =
    !lockedOutingId && !initialExpense && !hideOwnerToggle && !isEditingRealOutingTransaction;

  // Load the standalone friend_splits row when editing a Friend split
  // transaction, so its friends/split-type/amounts can be pre-filled.
  const {
    splits: allFriendSplits,
    saveSplit: saveFriendSplit,
    removeSplit: removeFriendSplit,
  } = useFriendSplits();
  const linkedFriendSplit = useMemo(
    () =>
      initialValues?.id
        ? allFriendSplits.find((split) => split.transactionId === initialValues.id)
        : undefined,
    [allFriendSplits, initialValues?.id],
  );

  function seedSplitExpenseRows(target: "purpose" | "category" | "both") {
    if (target === "purpose" && purposeSplitRows.length === 0) {
      setPurposeSplitRows([
        { id: crypto.randomUUID(), purposeId: "", amount: "" },
        { id: crypto.randomUUID(), purposeId: "", amount: "" },
      ]);
    }
    if (target === "category" && categorySplitRows.length === 0) {
      setCategorySplitRows([
        { id: crypto.randomUUID(), categoryId: "", amount: "" },
        { id: crypto.randomUUID(), categoryId: "", amount: "" },
      ]);
    }
    if (target === "both" && bothSplitRows.length === 0) {
      setBothSplitRows([
        { id: crypto.randomUUID(), purposeId: "", categoryId: "", amount: "" },
        { id: crypto.randomUUID(), purposeId: "", categoryId: "", amount: "" },
      ]);
    }
  }

  function handleToggleSplitExpense(checked: boolean) {
    setSplitExpenseEnabled(checked);
    if (!checked) return;
    setFriendSplitEnabled(false);
    seedSplitExpenseRows(splitExpenseMode);
  }

  function handleSetSplitExpenseMode(next: "purpose" | "category" | "both") {
    setSplitExpenseMode(next);
    seedSplitExpenseRows(next);
  }

  function handleToggleFriendSplit(checked: boolean) {
    setFriendSplitEnabled(checked);
    if (checked) setSplitExpenseEnabled(false);
  }

  // Reset / pre-populate the three modes whenever the sheet opens for a
  // (possibly different) transaction.
  useEffect(() => {
    if (!open) return;

    if (!canOfferSplit) {
      setSplitExpenseEnabled(false);
      setFriendSplitEnabled(false);
      return;
    }

    if (initialValues && linkedFriendSplit) {
      setFriendSplitEnabled(true);
      setSplitExpenseEnabled(false);
      const friendIds = linkedFriendSplit.members
        .filter((member) => !member.isCurrentUser)
        .map((member) => member.friendId)
        .filter((id): id is string => Boolean(id));
      setSelectedFriendIds(friendIds);
      setFriendSplitType(linkedFriendSplit.splitType);
      setFriendCustomAmounts(
        Object.fromEntries(
          linkedFriendSplit.splits.map((split) => [
            split.memberId,
            String(split.amount),
          ]),
        ),
      );
      return;
    }

    if (initialValues?.hasSplits && (initialValues.splits?.length ?? 0) > 1) {
      const splits = initialValues.splits!;
      setSplitExpenseEnabled(true);
      setFriendSplitEnabled(false);
      const distinctCategories = new Set(splits.map((s) => s.categoryId));
      const distinctPurposes = new Set(splits.map((s) => s.purposeId));
      if (distinctPurposes.size === 1 && distinctCategories.size > 1) {
        setSplitExpenseMode("category");
        setCategorySplitRows(
          splits.map((s) => ({
            id: crypto.randomUUID(),
            categoryId: s.categoryId,
            amount: String(s.amount),
          })),
        );
        setPurposeSplitRows([]);
        setBothSplitRows([]);
      } else if (distinctPurposes.size > 1 && distinctCategories.size > 1) {
        setSplitExpenseMode("both");
        setBothSplitRows(
          splits.map((s) => ({
            id: crypto.randomUUID(),
            purposeId: s.purposeId,
            categoryId: s.categoryId,
            amount: String(s.amount),
          })),
        );
        setPurposeSplitRows([]);
        setCategorySplitRows([]);
      } else {
        setSplitExpenseMode("purpose");
        setPurposeSplitRows(
          splits.map((s) => ({
            id: crypto.randomUUID(),
            purposeId: s.purposeId,
            amount: String(s.amount),
          })),
        );
        setCategorySplitRows([]);
        setBothSplitRows([]);
      }
      return;
    }

    // New transaction, or a plain existing one — Normal, both switches off,
    // unless the caller asked to land straight in Split Expense (the
    // "Convert to Split Transaction" unlink outcome).
    setSplitExpenseEnabled(Boolean(forceSplitExpense));
    setSplitExpenseMode("purpose");
    setPurposeSplitRows(
      forceSplitExpense
        ? [
            { id: crypto.randomUUID(), purposeId: "", amount: "" },
            { id: crypto.randomUUID(), purposeId: "", amount: "" },
          ]
        : [],
    );
    setCategorySplitRows([]);
    setBothSplitRows([]);
    setFriendSplitEnabled(false);
    setSelectedFriendIds([]);
    setFriendSplitType("equally");
    setFriendCustomAmounts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the sheet (re)opens for a given transaction
  }, [
    open,
    initialValues?.id,
    initialOuting?.id,
    linkedFriendSplit,
    canOfferSplit,
    forceSplitExpense,
  ]);

  // Items (Title / Itemization) — independent seed/reset, kept out of the
  // Split Expense effect above since the two features never interact.

  useEffect(() => {
    if (!open) return;
    if (initialExpense) {
      setOwnerMode("trip");
      setSelectedOutingId(initialExpense.outingId);
      setPaidByMemberId(initialExpense.paidByMemberId);
      setTripSplitType(initialExpense.splitType);
      setCustomSplitAmounts(
        Object.fromEntries(
          initialExpense.splits.map((split) => [
            split.memberId,
            String(split.amount),
          ]),
        ),
      );
    } else if (lockedOutingId) {
      setOwnerMode("trip");
      setSelectedOutingId(lockedOutingId);
      setPaidByMemberId("");
      setTripSplitType("equally");
      setCustomSplitAmounts({});
    } else {
      setOwnerMode("me");
      setSelectedOutingId("");
      setPaidByMemberId("");
      setTripSplitType("equally");
      setCustomSplitAmounts({});
    }
  }, [open, initialExpense, lockedOutingId]);

  useEffect(() => {
    if (!open || ownerMode !== "trip" || !selectedOuting || paidByMemberId) return;
    const me =
      selectedOuting.members.find((member) => member.isCurrentUser) ??
      selectedOuting.members[0];
    if (me) setPaidByMemberId(me.id);
  }, [open, ownerMode, selectedOuting, paidByMemberId]);

  const purposeChoices = useMemo(() => {
    const list = [...activePurposes];
    if (initialValues?.purposeId || initialValues?.purpose) {
      const id = resolvePurposeId(
        initialValues.purposeId ?? initialValues.purpose,
        purposes,
      );
      const existing = getPurposeById(purposes, id);
      if (existing && !list.some((p) => p.id === existing.id)) {
        list.push(existing);
      }
    }
    return list;
  }, [activePurposes, initialValues, purposes]);

  const defaultPurposeId =
    resolvePurposeId(
      initialValues?.purposeId ?? initialValues?.purpose,
      purposes,
    ) ||
    getDefaultPersonalPurpose(purposeChoices)?.id ||
    "";

  const defaultAccountName =
    initialValues?.accountName ||
    initialValues?.account ||
    initialExpense?.accountName ||
    accounts.find((a) => a.isDefault && a.isActive !== false)?.name ||
    accounts.find((a) => a.isActive !== false)?.name ||
    "";

  // Builds a fresh "starting state" for the form from the source-of-truth
  // props (the record being edited, or blank-with-defaults for a new one).
  // Deliberately NOT wired in as RHF's `values` option: that option re-syncs
  // the form to a freshly computed object on every render where it isn't
  // deep-equal to the last one, and `defaultAccountName`/`defaultPurposeId`
  // are recomputed from `accounts`/`purposes` — data that gets new array
  // references from refetches/realtime updates independently of user input.
  // That resync used to fire while the user was mid-edit and silently wipe
  // Amount/Merchant back to these "new transaction" defaults. This is called
  // once for the initial mount and again, explicitly, only when the sheet
  // (re)opens for a given transaction — see the effect below.
  function buildFormValues(): TransactionFormValues {
    return {
      type: initialValues?.type ?? mode,
      amount:
        initialValues?.totalAmount ??
        initialValues?.amount ??
        initialExpense?.amount ??
        0,
      merchant: initialValues?.merchant ?? initialExpense?.description ?? "",
      title: initialValues?.title ?? "",
      category: initialValues?.category ?? initialExpense?.category ?? "",
      account: defaultAccountName,
      purpose: defaultPurposeId,
      contributorSource:
        initialValues?.contributorSource ?? defaultContributorName,
      date: toLocalDatePart(
        initialValues?.transactionDate ??
          initialValues?.date ??
          initialExpense?.date,
      ),
      time: toLocalTimePart(
        initialValues?.transactionDate ??
          initialValues?.date ??
          initialExpense?.date,
      ),
      reference:
        initialValues?.reference ||
        initialValues?.referenceId ||
        initialValues?.upiId ||
        "",
      note: initialValues?.note ?? "",
    };
  }

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
    setValue,
  } = useForm<TransactionFormValues, unknown, ParsedTransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: buildFormValues(),
  });

  // Re-seed the form from the source-of-truth record only when the sheet
  // (re)opens for a given transaction — never on every render. This is what
  // actually applies the "Default Purpose" / new-vs-edit defaults from
  // buildFormValues(); everything else (Category, Purpose, Account,
  // dropdown data loading, re-renders) must leave the in-progress form
  // alone, which plain RHF state already guarantees once we stopped using
  // the `values` option above.
  const formResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      formResetKeyRef.current = null;
      return;
    }
    const resetKey = initialValues?.id ?? initialExpense?.id ?? "new";
    if (formResetKeyRef.current === resetKey) return;
    formResetKeyRef.current = resetKey;
    reset(buildFormValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the sheet (re)opens for a given transaction, matching the convention above
  }, [open, initialValues?.id, initialExpense?.id]);

  const currentType = watch("type");
  const amount = watch("amount");
  const merchant = watch("merchant");
  const category = watch("category");
  const account = watch("account");
  const purpose = watch("purpose");
  const amountNum = Number(amount) || 0;

  const customSplitTotal = selectedOuting
    ? selectedOuting.members.reduce(
        (sum, member) => sum + (Number(customSplitAmounts[member.id]) || 0),
        0,
      )
    : 0;
  const customSplitValid = Math.abs(customSplitTotal - amountNum) < 0.01;
  const tripFormValid =
    ownerMode !== "trip" ||
    (Boolean(selectedOuting) &&
      amountNum > 0 &&
      merchant.trim().length > 0 &&
      Boolean(category) &&
      Boolean(account) &&
      Boolean(paidByMemberId) &&
      (tripSplitType !== "custom" || customSplitValid));

  const purposeSplitTotal = purposeSplitRows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );
  const purposeSplitDuplicate = hasDuplicateKeys(
    purposeSplitRows.map((row) => row.purposeId),
  );
  const purposeSplitValid =
    purposeSplitRows.length >= 2 &&
    purposeSplitRows.every((row) => Boolean(row.purposeId) && Number(row.amount) > 0) &&
    !purposeSplitDuplicate &&
    Math.abs(purposeSplitTotal - amountNum) < 0.01;

  const categorySplitTotal = categorySplitRows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );
  const categorySplitDuplicate = hasDuplicateKeys(
    categorySplitRows.map((row) => row.categoryId),
  );
  const categorySplitValid =
    categorySplitRows.length >= 2 &&
    categorySplitRows.every((row) => Boolean(row.categoryId) && Number(row.amount) > 0) &&
    !categorySplitDuplicate &&
    Math.abs(categorySplitTotal - amountNum) < 0.01;

  const bothSplitTotal = bothSplitRows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );
  const bothSplitDuplicate = hasDuplicateKeys(
    bothSplitRows.map((row) => `${row.purposeId}::${row.categoryId}`),
  );
  const bothSplitValid =
    bothSplitRows.length >= 2 &&
    bothSplitRows.every(
      (row) => Boolean(row.purposeId) && Boolean(row.categoryId) && Number(row.amount) > 0,
    ) &&
    !bothSplitDuplicate &&
    Math.abs(bothSplitTotal - amountNum) < 0.01;


  const splitExpenseValid =
    splitExpenseMode === "purpose"
      ? purposeSplitValid
      : splitExpenseMode === "category"
        ? categorySplitValid
        : bothSplitValid;

  const showCategorySplitRows =
    canOfferSplit && splitExpenseEnabled && splitExpenseMode === "category";
  const showPurposeSplitRows =
    canOfferSplit && splitExpenseEnabled && splitExpenseMode === "purpose";
  const showBothSplitRows =
    canOfferSplit && splitExpenseEnabled && splitExpenseMode === "both";

  const friendSplitMembers: TripMember[] = useMemo(() => {
    const you: TripMember = { id: "me", name: "You", isCurrentUser: true };
    const picked = friends
      .filter((friend) => selectedFriendIds.includes(friend.id))
      .map((friend) => ({
        id: friend.id,
        name: friend.name,
        friendId: friend.id,
        upiId: friend.upiId ?? friend.upiIds?.[0],
        isCurrentUser: false,
      }));
    return [you, ...picked];
  }, [friends, selectedFriendIds]);

  const friendCustomTotal = friendSplitMembers.reduce(
    (sum, member) => sum + (Number(friendCustomAmounts[member.id]) || 0),
    0,
  );
  const friendCustomValid = Math.abs(friendCustomTotal - amountNum) < 0.01;
  const friendSplitValid =
    selectedFriendIds.length >= 1 &&
    (friendSplitType !== "custom" || friendCustomValid);

  const splitSectionValid =
    (!splitExpenseEnabled || splitExpenseValid) &&
    (!friendSplitEnabled || friendSplitValid);

  // Contributor only when income AND more than one person configured.
  const showContributorSource =
    currentType === "income" && contributors.length > 1;

  const typeMeta = getTransactionTypeMeta(currentType);
  const categories = allCategories.filter(
    (item) =>
      item.type === currentType &&
      (item.isActive !== false || item.name === initialValues?.category),
  );
  const selectableAccounts = accounts
    .filter(
      (item) =>
        item.isActive !== false ||
        item.name === initialValues?.account ||
        item.name === initialValues?.accountName ||
        item.id === initialValues?.accountId,
    )
    // Bank/wallet/credit before Cash — e.g. HDFC, Axis, Cash — same order
    // the default-account picker below and mobile's Add Expense form use.
    .sort((a, b) => Number(a.type === "cash") - Number(b.type === "cash"));

  useEffect(() => {
    if (!open) return;
    if (!category && categories.length > 0) {
      setValue("category", categories[0].name);
    }
  }, [open, category, categories, setValue]);

  useEffect(() => {
    if (!open) return;
    if (!account && selectableAccounts.length > 0) {
      setValue(
        "account",
        selectableAccounts.find((a) => a.isDefault)?.name ??
          selectableAccounts[0].name,
      );
    }
  }, [open, account, selectableAccounts, setValue]);

  // Default Purpose = Personal. purposeChoices loads asynchronously, so this
  // covers the case where the sheet opens (and buildFormValues() runs)
  // before purposes have finished fetching; it only fills an empty field, so
  // it never overrides a purpose the user already picked.
  useEffect(() => {
    if (!open) return;
    if (!purpose && purposeChoices.length > 0) {
      setValue(
        "purpose",
        getDefaultPersonalPurpose(purposeChoices)?.id ?? purposeChoices[0].id,
      );
    }
  }, [open, purpose, purposeChoices, setValue]);

  useEffect(() => {
    if (!open) return;
    if (currentType === "income" && showContributorSource) {
      const current = watch("contributorSource");
      if (!current && defaultContributorName) {
        setValue("contributorSource", defaultContributorName);
      }
    }
  }, [
    open,
    currentType,
    showContributorSource,
    defaultContributorName,
    setValue,
    watch,
  ]);

  const selectedCategoryColor =
    categories.find((item) => item.name === category)?.color ?? "#8b7ff0";
  const CategoryIcon = getCategoryIcon(category);

  const [duplicateMatch, setDuplicateMatch] = useState<Transaction | null>(
    null,
  );
  const [pendingValues, setPendingValues] =
    useState<ParsedTransactionFormValues | null>(null);
  /** Manual past entry: when off, save uses current date/time. */
  const [isPastTransaction, setIsPastTransaction] = useState(false);

  useEffect(() => {
    if (!open) {
      setDuplicateMatch(null);
      setPendingValues(null);
      return;
    }
    // Editing: show existing date/time. New: past switch off → now.
    setIsPastTransaction(Boolean(initialValues) || Boolean(initialExpense));
  }, [open, initialValues, initialExpense]);

  function resolveTransactionIso(values: ParsedTransactionFormValues) {
    if (
      isPastTransaction &&
      values.date?.trim() &&
      values.time?.trim()
    ) {
      return combineDateTimeLocal(values.date, values.time);
    }
    return new Date().toISOString();
  }

  async function commitSubmit(values: ParsedTransactionFormValues) {
    const isoDate = resolveTransactionIso(values);
    const amountNumber = Number(values.amount);
    const accountName = values.account;
    const paymentMethod =
      accountName.toLowerCase() === "cash" ? "Cash" : "UPI";
    // UPI / identifier field = merchant lookup key (not the display title).
    const merchantIdentifier = values.reference?.trim() || undefined;

    // Preserve system tags only when editing (rollup / transfer / bank meta).
    // Drop old upi: tag so the identifier can be updated or cleared.
    const preservedSystemTags = (initialValues?.tags ?? []).filter(
      (t) =>
        t.startsWith("bank:") ||
        t.startsWith("last4:") ||
        t.startsWith("transfer_to:") ||
        t === "transfer" ||
        t === "outing-rollup",
    );
    const tags = [
      ...preservedSystemTags,
      ...(merchantIdentifier ? [`upi:${merchantIdentifier}`] : []),
    ];

    const splitExpenseSplits: Transaction["splits"] =
      canOfferSplit && splitExpenseEnabled && splitExpenseValid
        ? splitExpenseMode === "purpose"
          ? purposeSplitRows.map((row) => ({
              id: crypto.randomUUID(),
              transactionId: "",
              userId: "",
              purposeId: row.purposeId,
              categoryId: values.category,
              amount: Number(row.amount) || 0,
            }))
          : splitExpenseMode === "category"
            ? categorySplitRows.map((row) => ({
                id: crypto.randomUUID(),
                transactionId: "",
                userId: "",
                purposeId: values.purpose,
                categoryId: row.categoryId,
                amount: Number(row.amount) || 0,
              }))
            : bothSplitRows.map((row) => ({
                id: crypto.randomUUID(),
                transactionId: "",
                userId: "",
                purposeId: row.purposeId,
                categoryId: row.categoryId,
                amount: Number(row.amount) || 0,
              }))
        : undefined;

    const submittedItems: Transaction["items"] = [];

    if (!onSubmit) return;

    // Friend Split -> Normal / Split Expense: the toggle is off but a
    // friend_splits row still exists for this transaction. Remove it (and its
    // settlements, via FK cascade) so no orphan record or stale friend
    // balance is left behind.
    if (initialValues && linkedFriendSplit && !friendSplitEnabled) {
      await removeFriendSplit(linkedFriendSplit.id);
    }

    await onSubmit({
      type: values.type,
      merchant: values.merchant.trim(),
      title: values.title?.trim() || undefined,
      category: values.category,
      account: accountName,
      accountName,
      accountId: initialValues?.accountId,
      purpose: values.purpose,
      purposeId: values.purpose,
      amount: amountNumber,
      totalAmount: amountNumber,
      date: isoDate,
      transactionDate: isoDate,
      paymentMethod,
      paymentType: paymentMethod,
      status: initialValues?.status ?? "completed",
      reference: merchantIdentifier,
      referenceId: merchantIdentifier,
      // Always store identifier in upiId for cross-platform merchant matching.
      upiId: merchantIdentifier,
      note: values.note?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      source: initialValues?.source ?? "manual",
      entrySource: initialValues?.entrySource ?? "manual",
      contributorSource:
        values.type === "income"
          ? showContributorSource
            ? (values.contributorSource as ContributorSource | undefined) ||
              defaultContributorName
            : defaultContributorName
          : undefined,
      // Simple form never links outing from here
      outingId: initialValues?.outingId ?? null,
      hasSplits: splitExpenseSplits
        ? splitExpenseSplits.length > 1
        : initialValues?.hasSplits,
      splits: splitExpenseSplits ?? initialValues?.splits,
      hasItems: submittedItems ? submittedItems.length > 0 : initialValues?.hasItems,
      items: submittedItems,
    });
    setDuplicateMatch(null);
    setPendingValues(null);
    reset();
    onOpenChange(false);
  }

  async function submit(values: ParsedTransactionFormValues) {
    if (isPastTransaction && (!values.date?.trim() || !values.time?.trim())) {
      return;
    }

    if (!initialValues) {
      const duplicate = findLikelyDuplicate(
        {
          amount: Number(values.amount),
          account: values.account,
          date: resolveTransactionIso(values),
        },
        transactions,
      );

      if (duplicate) {
        setDuplicateMatch(duplicate);
        setPendingValues(values);
        return;
      }
    }

    await commitSubmit(values);
  }

  /**
   * Trip mode never creates a plain `transactions` row directly — it writes
   * an `outing_expenses` row and resyncs the outing's single "Outing total"
   * rollup transaction, same as the outing detail page's own add/edit flow.
   * This bypasses the `onSubmit` prop (which expects a `Transaction`) so the
   * one-rollup-per-outing architecture stays intact regardless of where the
   * form was opened from. Only reachable via `lockedOutingId`/`initialExpense`
   * — never from the general Add/Edit Expense form.
   */
  async function handleTripSubmit() {
    if (!user?.id || !selectedOuting || !tripFormValid) return;

    setTripSubmitting(true);
    try {
      const amountNumber = Number(watch("amount"));
      const merchantValue = watch("merchant").trim();
      const categoryValue = watch("category");
      const accountValue = watch("account");
      const selectedAccount = accounts.find((item) => item.name === accountValue);
      const paymentMode =
        selectedAccount?.type === "cash"
          ? "Cash"
          : selectedAccount?.type === "wallet"
            ? "Wallet"
            : "Online";
      const expenseDate =
        isPastTransaction && watch("date")?.trim() && watch("time")?.trim()
          ? combineDateTimeLocal(watch("date")!, watch("time")!).slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      const customSplits =
        tripSplitType === "custom"
          ? selectedOuting.members
              .map((member) => ({
                memberId: member.id,
                amount: Number(customSplitAmounts[member.id]) || 0,
              }))
              .filter((split) => split.amount > 0)
          : undefined;
      const splits = buildExpenseSplits(
        amountNumber,
        tripSplitType,
        selectedOuting.members,
        paidByMemberId,
        selectedOuting.members.map((member) => member.id),
        customSplits,
      );

      await saveOutingExpense(user.id, {
        id: initialExpense?.id ?? crypto.randomUUID(),
        userId: user.id,
        outingId: selectedOuting.id,
        description: merchantValue,
        amount: amountNumber,
        category: categoryValue,
        date: expenseDate,
        paidByMemberId,
        splitType: tripSplitType,
        splits,
        source: initialExpense?.source ?? "manual",
        linkedTransactionId: initialExpense?.linkedTransactionId,
        accountName: accountValue,
        paymentMode,
      });

      const defaultAccount =
        accounts.find((item) => item.isDefault)?.name ?? accounts[0]?.name ?? "Cash";
      await syncOutingRollupLedger(user.id, selectedOuting.id, {
        defaultAccountName: defaultAccount,
      });

      await invalidateFinancialData(queryClient, user.id, {
        outingId: selectedOuting.id,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.allOutingExpenses(user.id),
      });

      reset();
      onOpenChange(false);
    } finally {
      setTripSubmitting(false);
    }
  }

  /**
   * "Split with Friends" on a new normal transaction: create the plain ledger
   * transaction, then record a standalone `friend_splits` row against it. A
   * friend split is a single shared bill, not a trip — it deliberately creates
   * no outing, outing expense, outing member or outing settlement, and the
   * transaction's `outingId` stays null.
   */
  async function handleFriendSplitSubmit(values: ParsedTransactionFormValues) {
    if (!user?.id || !friendSplitValid) return;

    setFriendSplitSubmitting(true);
    try {
      const isoDate = resolveTransactionIso(values);
      const amountNumber = Number(values.amount);
      const accountName = values.account;
      const paymentMethod = accountName.toLowerCase() === "cash" ? "Cash" : "UPI";
      const merchantIdentifier = values.reference?.trim() || undefined;

      const saved = await addTransactionDirect({
        type: values.type,
        merchant: values.merchant.trim(),
        category: values.category,
        account: accountName,
        accountName,
        purpose: values.purpose,
        purposeId: values.purpose,
        amount: amountNumber,
        totalAmount: amountNumber,
        date: isoDate,
        transactionDate: isoDate,
        paymentMethod,
        paymentType: paymentMethod,
        status: "completed",
        reference: merchantIdentifier,
        referenceId: merchantIdentifier,
        upiId: merchantIdentifier,
        note: values.note?.trim() || undefined,
        source: "manual",
        entrySource: "manual",
        outingId: null,
      });

      const customSplits =
        friendSplitType === "custom"
          ? friendSplitMembers
              .map((member) => ({
                memberId: member.id,
                amount: Number(friendCustomAmounts[member.id]) || 0,
              }))
              .filter((split) => split.amount > 0)
          : undefined;
      const splits = buildExpenseSplits(
        amountNumber,
        friendSplitType,
        friendSplitMembers,
        "me",
        friendSplitMembers.map((member) => member.id),
        customSplits,
      );

      const selectedAccount = accounts.find((item) => item.name === accountName);
      const paymentMode =
        selectedAccount?.type === "cash"
          ? "Cash"
          : selectedAccount?.type === "wallet"
            ? "Wallet"
            : "Online";

      await saveFriendSplit({
        transactionId: saved.id,
        description: values.merchant.trim(),
        amount: amountNumber,
        category: values.category,
        date: isoDate,
        members: friendSplitMembers,
        paidByMemberId: "me",
        splitType: friendSplitType,
        splits,
        accountName,
        paymentMode,
      });

      reset();
      onOpenChange(false);
    } finally {
      setFriendSplitSubmitting(false);
    }
  }

  /**
   * Editing an existing Friend split transaction: update the plain transaction
   * fields and rewrite its `friend_splits` row (roster included). Still no
   * outing anywhere in the path.
   */
  async function handleFriendSplitEditSubmit(values: ParsedTransactionFormValues) {
    if (!user?.id || !initialValues || !friendSplitValid) return;

    setFriendSplitSubmitting(true);
    try {
      const isoDate = resolveTransactionIso(values);
      const amountNumber = Number(values.amount);
      const accountName = values.account;
      const paymentMethod = accountName.toLowerCase() === "cash" ? "Cash" : "UPI";
      const merchantIdentifier = values.reference?.trim() || undefined;

      await updateTransactionDirect({
        id: initialValues.id,
        transaction: {
          type: values.type,
          merchant: values.merchant.trim(),
          category: values.category,
          account: accountName,
          accountName,
          purpose: values.purpose,
          purposeId: values.purpose,
          amount: amountNumber,
          totalAmount: amountNumber,
          date: isoDate,
          transactionDate: isoDate,
          paymentMethod,
          paymentType: paymentMethod,
          reference: merchantIdentifier,
          referenceId: merchantIdentifier,
          upiId: merchantIdentifier,
          note: values.note?.trim() || undefined,
          outingId: null,
          // Split Expense -> Friend Split: collapse the multi-row split back
          // to one. updateTransaction rewrites transaction_splits from this.
          hasSplits: false,
          splits: undefined,
        },
      });

      const customSplits =
        friendSplitType === "custom"
          ? friendSplitMembers
              .map((member) => ({
                memberId: member.id,
                amount: Number(friendCustomAmounts[member.id]) || 0,
              }))
              .filter((split) => split.amount > 0)
          : undefined;
      const splits = buildExpenseSplits(
        amountNumber,
        friendSplitType,
        friendSplitMembers,
        "me",
        friendSplitMembers.map((member) => member.id),
        customSplits,
      );

      const selectedAccount = accounts.find((item) => item.name === accountName);
      const paymentMode =
        selectedAccount?.type === "cash"
          ? "Cash"
          : selectedAccount?.type === "wallet"
            ? "Wallet"
            : "Online";

      // Upserts on transaction_id — so this both edits an existing friend
      // split and creates one when converting Normal/Split Expense -> Friend
      // Split. No duplicate row can result.
      await saveFriendSplit({
        ...(linkedFriendSplit ?? {}),
        id: linkedFriendSplit?.id,
        transactionId: initialValues.id,
        description: values.merchant.trim(),
        amount: amountNumber,
        category: values.category,
        date: isoDate,
        members: friendSplitMembers,
        paidByMemberId: "me",
        splitType: friendSplitType,
        splits,
        accountName,
        paymentMode,
      });

      reset();
      onOpenChange(false);
    } finally {
      setFriendSplitSubmitting(false);
    }
  }

  function minutesAgoLabel(iso?: string) {
    if (!iso) return "recently";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.max(0, Math.round(diffMs / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.round(hours / 24)} day(s) ago`;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <div className="border-b border-border px-6 pb-5 pt-6">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-xl font-semibold tracking-tight">
              {initialValues || initialExpense
                ? "Edit transaction"
                : currentType === "expense"
                  ? "Add expense"
                  : "Add income"}
            </SheetTitle>
            <SheetDescription className="mt-1">
              {ownerMode === "trip"
                ? "Amount, title, category, account, who paid, and how it's split."
                : `Amount, title, account, category, purpose${
                    showContributorSource ? ", contributor" : ""
                  }, notes. Turn on past transaction to pick a date & time.`}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form
          className="grid gap-5 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (ownerMode === "trip") {
              void handleTripSubmit();
            } else if (canOfferSplit && friendSplitEnabled) {
              if (initialValues) {
                void handleSubmit(handleFriendSplitEditSubmit)();
              } else {
                void handleSubmit(handleFriendSplitSubmit)();
              }
            } else {
              void handleSubmit(submit)();
            }
          }}
        >
          {/* Expense / Income toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {(["expense", "income"] as const).map((type) => {
              const meta = transactionTypeMeta[type];
              const Icon = meta.icon;
              const isActive = currentType === type;

              return (
                <label
                  key={type}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold transition-colors",
                    isActive
                      ? cn("bg-card shadow-sm", meta.accent.text)
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    value={type}
                    {...register("type")}
                  />
                  <Icon className="size-4" />
                  {meta.label}
                </label>
              );
            })}
          </div>

          {/* Amount */}
          <div
            className={cn(
              "rounded-2xl border p-5 transition-colors",
              typeMeta.accent.border,
              typeMeta.accent.surface,
            )}
          >
            <Label
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="transaction-amount"
            >
              Amount
            </Label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={cn("text-2xl font-bold", typeMeta.accent.text)}>
                {currentType === "expense" ? "−" : "+"}
              </span>
              <IndianRupee
                className={cn("size-6 shrink-0", typeMeta.accent.text)}
              />
              <Input
                className="h-12 flex-1 border-0 bg-transparent p-0 text-3xl font-bold tracking-tight shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                id="transaction-amount"
                inputMode="decimal"
                placeholder="0"
                {...register("amount")}
              />
            </div>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {Number(amount) > 0 || merchant
                ? `${currentType === "expense" ? "−" : "+"}${formatCurrency(Number(amount) || 0)} · ${merchant || "Title"} · ${category || "Category"}`
                : "Enter the amount."}
            </p>
            {errors.amount?.message ? (
              <p className="mt-1.5 text-xs text-destructive">
                {errors.amount.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4">
            {/* Title */}
            <Field
              error={errors.merchant?.message}
              icon={FileText}
              label="Title"
            >
              <Input
                className={fieldInputClassName}
                list="merchant-suggestions"
                placeholder={
                  currentType === "income"
                    ? "e.g. Salary, Freelance, Bonus"
                    : "e.g. Amazon, Uber, Dinner with friends"
                }
                {...register("merchant")}
              />
              <datalist id="merchant-suggestions">
                {merchants.map((item) => (
                  <option key={item.id} value={item.title} />
                ))}
              </datalist>
            </Field>

            {/* Account */}
            <Field
              error={errors.account?.message}
              icon={Landmark}
              label="Account"
            >
              <select className={fieldSelectClassName} {...register("account")}>
                <option value="">Select account</option>
                {selectableAccounts.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                    {item.type === "cash"
                      ? " (Cash)"
                      : item.last4
                        ? ` ···${item.last4}`
                        : ""}
                  </option>
                ))}
              </select>
            </Field>

            {/* Trip mode — only reachable via lockedOutingId/initialExpense,
                never from the general Add/Edit Expense form. */}
            {ownerMode === "trip" ? (
              <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4">
                {lockedOutingId && selectedOuting ? (
                  <p className="text-sm font-medium text-foreground">
                    Adding to: <span className="text-primary">{selectedOuting.name}</span>
                  </p>
                ) : (
                  <Field icon={MapPin} label="Outing">
                    <select
                      className={fieldSelectClassName}
                      value={selectedOutingId}
                      onChange={(event) => setSelectedOutingId(event.target.value)}
                    >
                      <option value="">Select outing</option>
                      {activeOutings.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {activeOutings.length === 0 ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        No active outings — create one first.
                      </p>
                    ) : null}
                  </Field>
                )}

                {selectedOuting ? (
                  <>
                    <Field icon={Users} label="Paid by">
                      <select
                        className={fieldSelectClassName}
                        value={paidByMemberId}
                        onChange={(event) => setPaidByMemberId(event.target.value)}
                      >
                        {selectedOuting.members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="grid gap-2">
                      <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Split className="size-3.5" />
                        Split
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {(["equally", "solo", "custom"] as SplitType[]).map(
                          (type) => (
                            <button
                              key={type}
                              className={cn(
                                chipClassName,
                                tripSplitType === type
                                  ? chipActiveClassName
                                  : chipInactiveClassName,
                              )}
                              type="button"
                              onClick={() => setTripSplitType(type)}
                            >
                              {type === "equally"
                                ? "Split"
                                : type === "solo"
                                  ? "Solo"
                                  : "Custom"}
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    {tripSplitType === "custom" ? (
                      <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                        {selectedOuting.members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-sm text-foreground">
                              {member.name}
                            </span>
                            <Input
                              className="h-9 w-28 text-right"
                              inputMode="decimal"
                              placeholder="0"
                              value={customSplitAmounts[member.id] ?? ""}
                              onChange={(event) =>
                                setCustomSplitAmounts((current) => ({
                                  ...current,
                                  [member.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                        <div
                          className={cn(
                            "flex items-center justify-between border-t border-border pt-2 text-xs font-medium",
                            customSplitValid
                              ? "text-muted-foreground"
                              : "text-destructive",
                          )}
                        >
                          <span>Allocated</span>
                          <span>
                            {formatCurrency(customSplitTotal)} /{" "}
                            {formatCurrency(amountNum)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Split Expense — Purpose Split or Category Split */}
            {canOfferSplit && !friendSplitEnabled ? (
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Split className="size-3.5" />
                      Split Expense
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Off = one category and one purpose.
                    </p>
                  </div>
                  <Switch
                    checked={splitExpenseEnabled}
                    onCheckedChange={handleToggleSplitExpense}
                  />
                </div>

                {splitExpenseEnabled ? (
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Split Type
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {(["purpose", "category", "both"] as const).map((tab) => (
                        <button
                          key={tab}
                          className={cn(
                            chipClassName,
                            "inline-flex items-center gap-1.5",
                            splitExpenseMode === tab
                              ? chipActiveClassName
                              : chipInactiveClassName,
                          )}
                          type="button"
                          onClick={() => handleSetSplitExpenseMode(tab)}
                        >
                          {tab === "purpose" ? (
                            <Target className="size-3.5" />
                          ) : tab === "category" ? (
                            <Tag className="size-3.5" />
                          ) : (
                            <Split className="size-3.5" />
                          )}
                          {tab === "purpose"
                            ? "Purpose Split"
                            : tab === "category"
                              ? "Category Split"
                              : "Purpose + Category Split"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Split with Friends */}
            {canOfferSplit && !splitExpenseEnabled ? (
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Users className="size-3.5" />
                      Split with Friends
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Off = just you.
                    </p>
                  </div>
                  <Switch
                    checked={friendSplitEnabled}
                    onCheckedChange={handleToggleFriendSplit}
                  />
                </div>

                {friendSplitEnabled ? (
                  <div className="grid gap-3">
                    {friends.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No friends yet — add one from Friends first.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {friends.map((friend) => {
                          const selected = selectedFriendIds.includes(friend.id);
                          return (
                            <button
                              key={friend.id}
                              className={cn(
                                chipClassName,
                                selected ? chipActiveClassName : chipInactiveClassName,
                              )}
                              type="button"
                              onClick={() =>
                                setSelectedFriendIds((current) =>
                                  selected
                                    ? current.filter((id) => id !== friend.id)
                                    : [...current, friend.id],
                                )
                              }
                            >
                              {friend.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedFriendIds.length > 0 ? (
                      <>
                        <div className="grid gap-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Split Type
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {(["equally", "custom"] as SplitType[]).map((type) => (
                              <button
                                key={type}
                                className={cn(
                                  chipClassName,
                                  friendSplitType === type
                                    ? chipActiveClassName
                                    : chipInactiveClassName,
                                )}
                                type="button"
                                onClick={() => setFriendSplitType(type)}
                              >
                                {type === "equally" ? "Equal" : "Custom"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {friendSplitType === "custom" ? (
                          <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                            {friendSplitMembers.map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="text-sm text-foreground">
                                  {member.name}
                                </span>
                                <Input
                                  className="h-9 w-28 text-right"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={friendCustomAmounts[member.id] ?? ""}
                                  onChange={(event) =>
                                    setFriendCustomAmounts((current) => ({
                                      ...current,
                                      [member.id]: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                            ))}
                            <div
                              className={cn(
                                "flex items-center justify-between border-t border-border pt-2 text-xs font-medium",
                                friendCustomValid
                                  ? "text-muted-foreground"
                                  : "text-destructive",
                              )}
                            >
                              <span>Allocated</span>
                              <span>
                                {formatCurrency(friendCustomTotal)} /{" "}
                                {formatCurrency(amountNum)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Split equally across you + {selectedFriendIds.length}{" "}
                            friend{selectedFriendIds.length === 1 ? "" : "s"} — each
                            pays{" "}
                            {formatCurrency(
                              friendSplitMembers.length > 0
                                ? amountNum / friendSplitMembers.length
                                : 0,
                            )}
                            .
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Purpose + Category Split — one row list with both selects */}
            {showBothSplitRows ? (
              <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Split className="size-3.5" />
                  Purpose + Category rows
                </Label>
                {bothSplitRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                    <select
                      className={fieldSelectClassName}
                      value={row.purposeId}
                      onChange={(event) =>
                        setBothSplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, purposeId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Purpose</option>
                      {purposeChoices.map((purpose) => (
                        <option key={purpose.id} value={purpose.id}>
                          {purpose.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={fieldSelectClassName}
                      value={row.categoryId}
                      onChange={(event) =>
                        setBothSplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, categoryId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Category</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-9 w-24 shrink-0 text-right"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.amount}
                      onChange={(event) =>
                        setBothSplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      disabled={bothSplitRows.length <= 2}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setBothSplitRows((rows) =>
                          rows.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="justify-self-start"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setBothSplitRows((rows) => [
                      ...rows,
                      { id: crypto.randomUUID(), purposeId: "", categoryId: "", amount: "" },
                    ])
                  }
                >
                  <Plus className="size-3.5" />
                  Add split
                </Button>
                {bothSplitDuplicate ? (
                  <p className="text-xs text-destructive">
                    Two rows use the same purpose + category — combine them into one row.
                  </p>
                ) : null}
                <div
                  className={cn(
                    "flex items-center justify-between border-t border-border pt-2 text-xs font-medium",
                    bothSplitValid ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  <span>Allocated</span>
                  <span>
                    {formatCurrency(bothSplitTotal)} / {formatCurrency(amountNum)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Category — single field, or replaced by Category Split rows.
                In Purpose + Category Split mode the rows above already cover
                category, so nothing else renders here. */}
            {showBothSplitRows ? null : showCategorySplitRows ? (
              <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Tag className="size-3.5" />
                  Category rows
                </Label>
                {categorySplitRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <select
                      className={fieldSelectClassName}
                      value={row.categoryId}
                      onChange={(event) =>
                        setCategorySplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, categoryId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Select category</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-9 w-24 shrink-0 text-right"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.amount}
                      onChange={(event) =>
                        setCategorySplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      disabled={categorySplitRows.length <= 2}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setCategorySplitRows((rows) =>
                          rows.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="justify-self-start"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCategorySplitRows((rows) => [
                      ...rows,
                      { id: crypto.randomUUID(), categoryId: "", amount: "" },
                    ])
                  }
                >
                  <Plus className="size-3.5" />
                  Add split
                </Button>
                {categorySplitDuplicate ? (
                  <p className="text-xs text-destructive">
                    Two rows use the same category — combine them into one row.
                  </p>
                ) : null}
                <div
                  className={cn(
                    "flex items-center justify-between border-t border-border pt-2 text-xs font-medium",
                    categorySplitValid ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  <span>Allocated</span>
                  <span>
                    {formatCurrency(categorySplitTotal)} / {formatCurrency(amountNum)}
                  </span>
                </div>
              </div>
            ) : (
              <Field error={errors.category?.message} icon={Tag} label="Category">
                <select
                  className={fieldSelectClassName}
                  {...register("category")}
                >
                  <option value="">Select category</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {category ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: selectedCategoryColor }}
                    />
                    <CategoryIcon className="size-3.5" />
                    {category}
                  </div>
                ) : null}
              </Field>
            )}

            {/* Purpose — single field, or replaced by Purpose Split rows.
                Trip mode inherits the outing's Purpose automatically. In
                Purpose + Category Split mode the rows above already cover
                purpose, so nothing else renders here. */}
            {showBothSplitRows ? null : showPurposeSplitRows ? (
              <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" />
                  Purpose rows
                </Label>
                {purposeSplitRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <select
                      className={fieldSelectClassName}
                      value={row.purposeId}
                      onChange={(event) =>
                        setPurposeSplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, purposeId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Select purpose</option>
                      {purposeChoices.map((purpose) => (
                        <option key={purpose.id} value={purpose.id}>
                          {purpose.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-9 w-24 shrink-0 text-right"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.amount}
                      onChange={(event) =>
                        setPurposeSplitRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      disabled={purposeSplitRows.length <= 2}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setPurposeSplitRows((rows) =>
                          rows.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="justify-self-start"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setPurposeSplitRows((rows) => [
                      ...rows,
                      { id: crypto.randomUUID(), purposeId: "", amount: "" },
                    ])
                  }
                >
                  <Plus className="size-3.5" />
                  Add split
                </Button>
                {purposeSplitDuplicate ? (
                  <p className="text-xs text-destructive">
                    Two rows use the same purpose — combine them into one row.
                  </p>
                ) : null}
                <div
                  className={cn(
                    "flex items-center justify-between border-t border-border pt-2 text-xs font-medium",
                    purposeSplitValid ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  <span>Allocated</span>
                  <span>
                    {formatCurrency(purposeSplitTotal)} / {formatCurrency(amountNum)}
                  </span>
                </div>
              </div>
            ) : ownerMode === "me" ? (
              <Field
                error={errors.purpose?.message}
                icon={Target}
                label="Purpose"
              >
                <select className={fieldSelectClassName} {...register("purpose")}>
                  <option value="">Select purpose</option>
                  {purposeChoices.map((purpose) => (
                    <option key={purpose.id} value={purpose.id}>
                      {purpose.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {/* Contributor — only if more than one */}
            {showContributorSource ? (
              <Field icon={Users} label="Contributor">
                <select
                  className={fieldSelectClassName}
                  {...register("contributorSource")}
                >
                  {contributors.map((contributor) => (
                    <option key={contributor.id} value={contributor.name}>
                      {contributor.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {/* Past transaction — manual only; off = current date/time */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Past transaction
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isPastTransaction
                    ? "Pick the original date and time."
                    : "Uses today's date and time."}
                </p>
              </div>
              <Switch
                checked={isPastTransaction}
                onCheckedChange={(checked) => {
                  setIsPastTransaction(checked);
                  if (checked) {
                    // Seed pickers with current values if empty
                    const d = watch("date");
                    const t = watch("time");
                    if (!d) setValue("date", toLocalDatePart());
                    if (!t) setValue("time", toLocalTimePart());
                  }
                }}
              />
            </div>

            {isPastTransaction ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field error={errors.date?.message} icon={Calendar} label="Date">
                  <Input
                    className={cn(
                      fieldInputClassName,
                      "[color-scheme:light] dark:[color-scheme:dark]",
                    )}
                    type="date"
                    required={isPastTransaction}
                    {...register("date")}
                  />
                </Field>
                <Field error={errors.time?.message} icon={Clock} label="Time">
                  <Input
                    className={cn(
                      fieldInputClassName,
                      "[color-scheme:light] dark:[color-scheme:dark]",
                    )}
                    type="time"
                    required={isPastTransaction}
                    {...register("time")}
                  />
                </Field>
              </div>
            ) : null}

            {/* Notes */}
            <Field icon={StickyNote} label="Notes">
              <Textarea
                className="min-h-20 rounded-lg px-3.5 py-3 text-sm shadow-none"
                placeholder="Optional note…"
                {...register("note")}
              />
            </Field>
          </div>

          {duplicateMatch ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Similar transaction exists
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    {formatCurrency(
                      duplicateMatch.totalAmount ?? duplicateMatch.amount,
                    )}{" "}
                    · {duplicateMatch.merchant} ·{" "}
                    {duplicateMatch.accountName || duplicateMatch.account}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/70">
                    Added {minutesAgoLabel(duplicateMatch.createdAt)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDuplicateMatch(null);
                        setPendingValues(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (pendingValues) void commitSubmit(pendingValues);
                      }}
                    >
                      Save anyway
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-border px-0 pt-5">
            {initialValues && onDelete ? (
              <Button
                disabled={isSubmitting}
                type="button"
                variant="destructive"
                onClick={() =>
                  void onDelete(initialValues).then(() => onOpenChange(false))
                }
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button
              className={cn("flex-1 sm:flex-none sm:px-8", typeMeta.accent.button)}
              disabled={
                isSubmitting ||
                tripSubmitting ||
                friendSplitSubmitting ||
                (ownerMode === "trip" && !tripFormValid) ||
                !splitSectionValid
              }
              type="submit"
            >
              {isSubmitting || tripSubmitting || friendSplitSubmitting
                ? "Saving..."
                : initialValues || initialExpense
                  ? "Update"
                  : currentType === "expense"
                    ? "Save expense"
                    : "Save income"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  children,
  className,
  error,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  className?: string;
  error?: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
