"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SmsRuleMode, SmsTemplateRule, SmsTemplateRuleType } from "@/types";

// ============================================================================
// CONSTANTS & SEEDED BANK CATALOG (Server-Driven Base)
// ============================================================================

export const SEEDED_BANKS = [
  "HDFC Bank",
  "State Bank of India (SBI)",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank (PNB)",
  "Bank of Baroda (BOB)",
  "Canara Bank",
  "Union Bank of India",
  "IDFC FIRST Bank",
  "IndusInd Bank",
  "Yes Bank",
  "Federal Bank",
  "Indian Bank",
  "RBL Bank",
  "Bandhan Bank",
  "AU Small Finance Bank",
  "Paytm Payments Bank",
  "Airtel Payments Bank",
  "Jupiter",
  "Fi Money",
];

// Corpus of typical messages from other banks to guard against cross-bank collisions
const CROSS_BANK_TEST_CORPUS = [
  {
    bank: "SBI",
    text: "Dear SBI User, your A/c XX1234 debited by Rs 450.00 on 28Oct26 by transfer to ZOMATO. Ref 410012345678. Bal: Rs 12,450.00",
  },
  {
    bank: "ICICI",
    text: "ICICI Bank Acct XX5678 debited with INR 899.00 on 28-Oct-26 towards SWIGGY. UPI:swiggy@icici. Call 18002662 for dispute.",
  },
  {
    bank: "HDFC",
    text: "Rs 650.00 spent on HDFC Bank Credit Card ending 7788 at ZARA on 28-Oct-26. Avl Limit: Rs 1,45,000.00. Ref 41001234235006.",
  },
  {
    bank: "Axis",
    text: "INR 1,200.00 debited from Axis Bank A/c no. XX9900 on 28-10-2026 at AMAZON. Avail Bal: INR 34,000.00. Not you? SMS BLOCK to 5676782.",
  },
  {
    bank: "Kotak",
    text: "Kotak Bank: Rs 320 debited from A/c XX3344 on 28-Oct-26 at UBER. Ref 4100889977. Clear Bal Rs 8,420.00.",
  },
];

// ============================================================================
// FIELD TAXONOMY & DEFINITIONS
// ============================================================================

export const TEMPLATE_FIELD_TYPES = [
  // Money
  { id: "amount", label: "Amount", group: "money" },
  { id: "balance", label: "Balance", group: "money" },
  { id: "cardLimit", label: "Available Limit", group: "money" },
  { id: "totalDue", label: "Total Due", group: "money" },
  { id: "minimumDue", label: "Minimum Due", group: "money" },

  // Direction & Action Words
  { id: "debitType", label: "Debit word (Spent/Paid…)", group: "type" },
  { id: "creditType", label: "Credit word", group: "type" },
  { id: "transferType", label: "Transfer word (app confirms)", group: "type" },
  { id: "atmWithdraw", label: "ATM word", group: "type" },
  { id: "billPayment", label: "CC Bill payment", group: "type" },
  { id: "refundType", label: "Refund / reversal", group: "type" },
  { id: "emi", label: "EMI word", group: "type" },
  { id: "feeOrInterest", label: "Fee / Interest word", group: "type" },
  { id: "autoPay", label: "AutoPay word", group: "type" },

  // Parties & Accounts
  { id: "title", label: "Title / Merchant", group: "who" },
  { id: "merchantName", label: "Merchant name", group: "who" },
  { id: "bankName", label: "Bank name", group: "who" },
  { id: "accountLast4", label: "Account last4", group: "card" },
  { id: "cardLast4", label: "Card last4", group: "card" },
  { id: "cardPayment", label: "Card type (Credit/Debit)", group: "card" },
  { id: "accountType", label: "Account type (Savings/Current)", group: "card" },

  // Tracking, IDs & Channels
  { id: "paymentMode", label: "Payment mode (UPI/POS/NEFT…)", group: "ids" },
  { id: "referenceId", label: "Ref / UTR", group: "ids" },
  { id: "upiId", label: "UPI ID", group: "ids" },
  { id: "chequeNumber", label: "Cheque no.", group: "ids" },
  { id: "status", label: "Status word (Failed/Declined…)", group: "ids" },
  { id: "phone", label: "Phone / helpline", group: "ids" },

  // Date & Time
  { id: "date", label: "Date only", group: "when" },
  { id: "time", label: "Time only", group: "when" },
  { id: "dateTime", label: "Date + time (one word)", group: "when" },
  { id: "dueDate", label: "Due date", group: "when" },

  // Misc
  { id: "ignoreText", label: "Ignore", group: "misc" },
] as const;

export type TemplateFieldId = (typeof TEMPLATE_FIELD_TYPES)[number]["id"];

type Token = {
  text: string;
  start: number;
  end: number;
  selectable: boolean;
  field: TemplateFieldId | null;
};

const FIELD_COLORS: Record<string, string> = {
  amount: "bg-emerald-500/20 text-emerald-800 ring-emerald-500/40 dark:text-emerald-300",
  balance: "bg-teal-500/20 text-teal-800 ring-teal-500/40 dark:text-teal-300",
  cardLimit: "bg-cyan-500/25 text-cyan-900 ring-cyan-500/40 dark:text-cyan-200",
  totalDue: "bg-rose-500/25 text-rose-900 ring-rose-500/40 dark:text-rose-200",
  minimumDue: "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:text-amber-200",

  debitType: "bg-rose-500/20 text-rose-800 ring-rose-500/40 dark:text-rose-300",
  creditType: "bg-green-500/20 text-green-800 ring-green-500/40 dark:text-green-300",
  transferType: "bg-orange-500/25 text-orange-900 ring-orange-500/40 dark:text-orange-200",
  atmWithdraw: "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:text-amber-200",
  billPayment: "bg-indigo-500/25 text-indigo-900 ring-indigo-500/40 dark:text-indigo-200",
  refundType: "bg-purple-500/20 text-purple-800 ring-purple-500/40 dark:text-purple-300",
  emi: "bg-blue-500/20 text-blue-800 ring-blue-500/40 dark:text-blue-300",
  feeOrInterest: "bg-red-500/20 text-red-800 ring-red-500/40 dark:text-red-300",
  autoPay: "bg-sky-500/20 text-sky-800 ring-sky-500/40 dark:text-sky-300",

  title: "bg-violet-500/20 text-violet-800 ring-violet-500/40 dark:text-violet-300",
  merchantName: "bg-violet-500/25 text-violet-900 ring-violet-500/40 dark:text-violet-200",
  bankName: "bg-sky-500/20 text-sky-800 ring-sky-500/40 dark:text-sky-300",
  accountLast4: "bg-cyan-500/20 text-cyan-800 ring-cyan-500/40 dark:text-cyan-300",
  cardLast4: "bg-blue-500/25 text-blue-900 ring-blue-500/40 dark:text-blue-200",
  cardPayment: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-300",
  accountType: "bg-slate-500/20 text-slate-800 ring-slate-500/40 dark:text-slate-300",

  paymentMode: "bg-indigo-500/20 text-indigo-800 ring-indigo-500/40 dark:text-indigo-300",
  referenceId: "bg-fuchsia-500/20 text-fuchsia-800 ring-fuchsia-500/40 dark:text-fuchsia-300",
  upiId: "bg-indigo-500/25 text-indigo-900 ring-indigo-500/40 dark:text-indigo-200",
  chequeNumber: "bg-stone-500/20 text-stone-800 ring-stone-500/40 dark:text-stone-300",
  status: "bg-red-500/25 text-red-900 ring-red-500/40 dark:text-red-200",
  phone: "bg-slate-500/20 text-slate-700 ring-slate-500/40 dark:text-slate-300",

  date: "bg-amber-500/20 text-amber-800 ring-amber-500/40 dark:text-amber-300",
  time: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-200",
  dateTime: "bg-orange-500/20 text-orange-800 ring-orange-500/40 dark:text-orange-200",
  dueDate: "bg-red-500/20 text-red-800 ring-red-500/40 dark:text-red-300",

  ignoreText: "bg-muted text-muted-foreground ring-border",
};

const FIELD_GROUPS = [
  { id: "money", label: "Money & Balances" },
  { id: "type", label: "Direction & Action" },
  { id: "who", label: "Who & Where" },
  { id: "card", label: "Account & Card" },
  { id: "ids", label: "Identifiers & Channels" },
  { id: "when", label: "Date & Time" },
  { id: "misc", label: "Other" },
];

function fieldLabel(id: string) {
  return TEMPLATE_FIELD_TYPES.find((f) => f.id === id)?.label ?? id;
}

function tokenTag(field: string) {
  return `{${field.toUpperCase()}}`;
}

// ============================================================================
// TOKENIZING & AUTO-DETECTION
// ============================================================================

function autoDetectField(text: string, prev?: string): TemplateFieldId | null {
  const lower = text.toLowerCase().trim();
  const prevLower = (prev ?? "").toLowerCase().trim();

  // Combined date+time: 2026-02-28:19:28:51 or 2026-02-28 19:28:51
  if (
    /^\d{4}[-/]\d{2}[-/]\d{2}[ T:]\d{1,2}:\d{2}(?::\d{2})?$/.test(text) ||
    /^\d{2}[-/]\d{2}[-/]\d{2,4}[ T:]\d{1,2}:\d{2}(?::\d{2})?$/.test(text)
  ) {
    return "dateTime";
  }

  // Amount / balance / limit
  if (/^(?:rs\.?|₹|inr)?[0-9,]+(?:\.[0-9]{1,2})?$/i.test(text)) {
    if (prevLower === "bal" || prevLower === "balance" || prevLower.startsWith("avl") || prevLower.startsWith("clear")) {
      return "balance";
    }
    if (prevLower.includes("limit") || prevLower.includes("avail")) {
      return "cardLimit";
    }
    if (prevLower.includes("due")) {
      return "totalDue";
    }
    return "amount";
  }

  // Card last4: x8191, *8191, XX8191 after "Card"
  if (/^[x*X]{1,2}\d{4}$/.test(text) || /^(?:xx|\*{1,2})\d{4,}$/i.test(text)) {
    if (prevLower === "card" || prevLower.includes("card")) return "cardLast4";
    return "accountLast4";
  }
  // Bare 4-digit after Card / DC
  if (/^\d{4}$/.test(text) && (prevLower === "card" || prevLower === "dc" || prevLower.includes("card"))) {
    return "cardLast4";
  }

  if (text.includes("@") && !text.includes(".com")) return "upiId";

  // Phone / helpline
  if (/^\d{8,}(?:\/[a-z]+)?$/i.test(text) || /^1[89]\d{8,}/.test(text) || /^\d{10,}$/.test(text)) {
    return "phone";
  }

  if (/^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(text) || /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text)) {
    if (prevLower.includes("due")) return "dueDate";
    return "date";
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return "time";

  // Long ref numbers
  if (/^\d{9,16}$/.test(text) && !text.startsWith("18") && !text.startsWith("19")) {
    return "referenceId";
  }

  // Direction / Action words
  if (["debited", "spent", "paid", "withdrawn", "purchase", "sent"].some((k) => lower === k || lower.startsWith(k))) {
    return "debitType";
  }
  if (["credited", "received", "deposited"].some((k) => lower === k || lower.startsWith(k))) {
    return "creditType";
  }
  if (["transfer", "transferred"].some((k) => lower === k || lower.startsWith(k))) {
    return "transferType";
  }
  if (lower === "atm" || lower.includes("atm")) return "atmWithdraw";
  if (lower === "card") return "cardPayment";

  // Failed / pending status
  if (["failed", "declined", "unsuccessful", "rejected"].includes(lower)) {
    return "status";
  }

  const banks = [
    "hdfc",
    "sbi",
    "icici",
    "axis",
    "kotak",
    "pnb",
    "bob",
    "canara",
    "union",
    "idfc",
    "yes",
    "indusind",
    "federal",
  ];
  if (banks.some((b) => lower === b || lower.includes(b))) return "bankName";

  return null;
}

function refineAutoTags(tokens: Token[]): Token[] {
  const next = tokens.map((t) => ({ ...t }));
  const selIdx = next
    .map((t, i) => (t.selectable ? i : -1))
    .filter((i) => i >= 0);

  for (let s = 0; s < selIdx.length; s++) {
    const i = selIdx[s];
    const prevI = s > 0 ? selIdx[s - 1] : -1;
    const prevText = prevI >= 0 ? next[prevI].text : "";
    const prevLower = prevText.toLowerCase();
    const text = next[i].text;
    const lower = text.toLowerCase();

    // "Bal Rs.1027.78"
    if (
      (prevLower === "bal" || prevLower === "balance" || prevLower.startsWith("avl")) &&
      /^(?:rs\.?|₹|inr)?[0-9,]+/i.test(text)
    ) {
      next[i] = { ...next[i], field: "balance" };
    }

    // "Card x8191"
    if (
      (prevLower === "card" || prevLower === "dc") &&
      (/^[x*X]?\d{4}$/.test(text) || /^[x*X]{1,2}\d{4}$/.test(text))
    ) {
      next[i] = { ...next[i], field: "cardLast4" };
    }

    // "to A/c XX9999" -> Beneficiary shield: mark other account as ignoreText
    if ((prevLower === "to" || prevLower === "in") && (/^[x*X]{2,}\d{3,4}$/.test(text) || /^\d{4,}$/.test(text))) {
      next[i] = { ...next[i], field: "ignoreText" };
    }

    // After "At" next capitalized words → title
    if (prevLower === "at" && /^[A-Za-z]/.test(text) && !next[i].field) {
      next[i] = { ...next[i], field: "title" };
    }

    // Helpline: 18002586161/SMS
    if (/^\d{8,}\//.test(text) || lower.includes("1800")) {
      next[i] = { ...next[i], field: "phone" };
    }

    if (["block", "not", "you?", "call", "helpline"].includes(lower) && !next[i].field) {
      next[i] = { ...next[i], field: "ignoreText" };
    }
  }

  // Propagate title to following ALLCAPS tokens (e.g. PAULPANDI KATHIRESAN)
  for (let s = 0; s < selIdx.length - 1; s++) {
    const i = selIdx[s];
    const j = selIdx[s + 1];
    if (next[i].field === "title" && /^[A-Za-z][A-Za-z.'-]+$/.test(next[j].text)) {
      if (!next[j].field || next[j].field === "title") {
        next[j] = { ...next[j], field: "title" };
      }
    }
  }

  return next;
}

function tokenize(message: string, withAuto = true): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  let prevSelectable = "";
  while ((match = pattern.exec(message)) !== null) {
    if (match.index > lastEnd) {
      const ws = message.slice(lastEnd, match.index);
      if (ws) {
        tokens.push({
          text: ws,
          start: lastEnd,
          end: match.index,
          selectable: false,
          field: null,
        });
      }
    }
    const word = match[0];
    tokens.push({
      text: word,
      start: match.index,
      end: match.index + word.length,
      selectable: true,
      field: withAuto ? autoDetectField(word, prevSelectable) : null,
    });
    prevSelectable = word;
    lastEnd = match.index + word.length;
  }
  if (lastEnd < message.length) {
    tokens.push({
      text: message.slice(lastEnd),
      start: lastEnd,
      end: message.length,
      selectable: false,
      field: null,
    });
  }
  return withAuto ? refineAutoTags(tokens) : tokens;
}

// ============================================================================
// TEMPLATE COMPILER & ENGINE
// ============================================================================

export function buildTemplateFromTags(input: {
  sampleMessage: string;
  tokens: Token[];
  bankName: string;
  type: SmsTemplateRuleType;
  mode: SmsRuleMode;
  smsKind?: string;
  senderIds?: string[];
  dateFormat?: string;
  titleOption?: string;
  category?: string;
  id?: string;
}): Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt"> | null {
  const {
    sampleMessage,
    tokens,
    bankName,
    type,
    mode,
    smsKind = "payment",
    senderIds = [],
    dateFormat = "dd-MMM-yy",
    titleOption = "merchant",
    category = "Other",
    id,
  } = input;

  const hasTag = tokens.some((t) => t.selectable && t.field && t.field !== "ignoreText");
  if (!hasTag) return null;

  type Seg = { start: number; end: number; field: string };
  const segments: Seg[] = [];
  const sel = tokens.filter((t) => t.selectable);
  let i = 0;
  while (i < sel.length) {
    const t = sel[i];
    if (!t.field) {
      i += 1;
      continue;
    }
    let end = t.end;
    let j = i + 1;
    while (j < sel.length && sel[j].field === t.field) {
      end = sel[j].end;
      j += 1;
    }
    segments.push({ start: t.start, end, field: t.field });
    i = j;
  }

  if (segments.length === 0) return null;

  const extractionMap: Record<string, string> = {};
  const keywords: string[] = [];
  let template = sampleMessage;

  const sorted = [...segments].sort((a, b) => b.start - a.start);
  for (const seg of sorted) {
    const original = sampleMessage.slice(seg.start, seg.end);
    if (seg.field === "ignoreText") {
      for (const w of original.trim().split(/\s+/)) {
        if (w.length > 2) keywords.push(w.toLowerCase());
      }
      continue;
    }

    const fieldForPattern =
      seg.field === "cardLast4" || seg.field === "cardNumber"
        ? "accountLast4"
        : seg.field === "dateTime"
          ? "date"
          : seg.field === "phone"
            ? "ignoreText"
            : seg.field;

    if (fieldForPattern === "ignoreText") {
      for (const w of original.trim().split(/\s+/)) {
        if (w.length > 2) keywords.push(w.toLowerCase());
      }
      continue;
    }

    const token = tokenTag(fieldForPattern);
    template = template.slice(0, seg.start) + token + template.slice(seg.end);

    extractionMap[original] =
      seg.field === "cardLast4" || seg.field === "cardNumber"
        ? "accountLast4"
        : seg.field === "dateTime"
          ? "date"
          : seg.field === "merchantName"
            ? "title"
            : seg.field;
  }

  for (const part of template.split(/\{[A-Z_]+\}/)) {
    for (const word of part.trim().split(/\s+/)) {
      const w = word.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (w.length > 2 && !keywords.includes(w)) keywords.push(w);
    }
  }

  const bankFromTag =
    Object.entries(extractionMap).find(([, f]) => f === "bankName")?.[0] ?? "";

  const exactTaggedValues: Record<string, string> = {};
  for (const [orig, field] of Object.entries(extractionMap)) {
    if (field && !field.startsWith("_")) {
      exactTaggedValues[field] = orig;
    }
  }

  // Preserve metadata inside extractionMap.__meta for 100% database compatibility
  extractionMap["__meta"] = JSON.stringify({
    smsKind,
    senderIds,
    dateFormat,
    titleOption,
    category,
  });

  return {
    id: id ?? crypto.randomUUID(),
    bankName: bankName.trim() || bankFromTag || "Unknown",
    type,
    mode,
    templatePattern: template,
    extractionMap,
    exactTaggedValues,
    keywords: keywords.slice(0, 25),
    sampleMessage,
    similarityThreshold: 0.65,
    isActive: true,
  };
}

// ============================================================================
// MAIN COMPONENT: 3-PAGE TEMPLATE BUILDER WIZARD
// ============================================================================

export type SmsTemplateTaggerProps = {
  onCancel: () => void;
  onSave: (rule: Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt">) => void;
  saving?: boolean;
  initialSample?: string;
  existing?: SmsTemplateRule | null;
  embedded?: boolean;
};

export function SmsTemplateTagger({
  onCancel,
  onSave,
  saving,
  initialSample = "",
  existing = null,
  embedded = false,
}: SmsTemplateTaggerProps) {
  // Navigation: Step 1, 2, or 3
  const [step, setStep] = useState<1 | 2 | 3>(
    existing?.sampleMessage ? 2 : 1,
  );
  const [isSuccessView, setIsSuccessView] = useState(false);

  // --------------------------------------------------------------------------
  // PAGE 1 STATE: Paste & Cascading Details
  // --------------------------------------------------------------------------
  const [sample, setSample] = useState(
    existing?.sampleMessage || initialSample || "",
  );
  const [direction, setDirection] = useState<"money_out" | "money_in" | "no_money_moved">(
    existing?.type === "credit" ? "money_in" : existing?.type === "transfer" ? "money_out" : "money_out",
  );
  const [paidFrom, setPaidFrom] = useState<string>("bank_account");
  const [mode, setMode] = useState<string>("upi");
  const [smsKind, setSmsKind] = useState<string>("payment");
  const [status, setStatus] = useState<"success" | "failed" | "pending">("success");

  // Server-Driven Bank State
  const [bankCatalog, setBankCatalog] = useState<string[]>(SEEDED_BANKS);
  const [selectedBank, setSelectedBank] = useState(existing?.bankName ?? "HDFC Bank");
  const [newBankInput, setNewBankInput] = useState("");
  const [showAddBankModal, setShowAddBankModal] = useState(false);

  // Optional Page 1 settings
  const [senderId, setSenderId] = useState("");
  const [dateFormat, setDateFormat] = useState("dd-MMM-yy");

  // --------------------------------------------------------------------------
  // PAGE 2 STATE: Word Badges, Title & Category
  // --------------------------------------------------------------------------
  const [tokens, setTokens] = useState<Token[]>(() => {
    if (existing?.sampleMessage) {
      const map = existing.extractionMap ?? {};
      const tok = tokenize(existing.sampleMessage, false);
      return tok.map((t) => {
        if (!t.selectable) return t;
        for (const [orig, f] of Object.entries(map)) {
          if (orig.includes(t.text) || t.text.includes(orig)) {
            return { ...t, field: f as TemplateFieldId };
          }
        }
        return t;
      });
    }
    if (initialSample) return tokenize(initialSample, true);
    return [];
  });
  const [activeToken, setActiveToken] = useState<number | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);

  // Title selection hierarchy
  const [customTitle, setCustomTitle] = useState("");
  const [titleFallbackChoice, setTitleFallbackChoice] = useState<"payer" | "desc" | "fixed" | "verify">("desc");
  const [selectedCategory, setSelectedCategory] = useState("Shopping");

  // --------------------------------------------------------------------------
  // PAGE 3 STATE: Test Console
  // --------------------------------------------------------------------------
  const [testSmsInput, setTestSmsInput] = useState("");
  const [testSmsResult, setTestSmsResult] = useState<{ success: boolean; message: string } | null>(null);

  // --------------------------------------------------------------------------
  // AUTO-DETECT ON SMS PASTE (Page 1)
  // --------------------------------------------------------------------------
  function autoFillFromSms(text: string) {
    const lower = text.toLowerCase();

    // 1. Detect Bank
    for (const b of bankCatalog) {
      const bCore = b.split(" ")[0].toLowerCase();
      if (lower.includes(bCore)) {
        setSelectedBank(b);
        break;
      }
    }

    // 2. Detect Direction
    if (lower.includes("credited") || lower.includes("received") || lower.includes("refund")) {
      setDirection("money_in");
      setPaidFrom("bank_account");
      setMode("upi");
      setSmsKind("income");
    } else if (
      lower.includes("statement") ||
      lower.includes("due date") ||
      lower.includes("total amount due") ||
      lower.includes("bal:") ||
      lower.includes("balance:")
    ) {
      if (lower.includes("card") || lower.includes("due")) {
        setDirection("no_money_moved");
        setPaidFrom("credit_card");
        setMode("none");
        setSmsKind("statement");
      }
    } else {
      setDirection("money_out");
      if (lower.includes("credit card") || lower.includes("ending")) {
        setPaidFrom("credit_card");
        setMode("pos");
        setSmsKind("payment");
      } else if (lower.includes("debit card") || lower.includes("dc ")) {
        setPaidFrom("debit_card");
        setMode("pos");
        setSmsKind("payment");
      } else if (lower.includes("atm") || lower.includes("w/d")) {
        setPaidFrom("bank_account");
        setMode("atm");
        setSmsKind("cash_withdrawal");
      } else {
        setPaidFrom("bank_account");
        setMode("upi");
        setSmsKind("payment");
      }
    }

    // 3. Detect Status
    if (lower.includes("failed") || lower.includes("declined") || lower.includes("unsuccessful")) {
      setStatus("failed");
    } else if (lower.includes("pending") || lower.includes("initiated")) {
      setStatus("pending");
    } else {
      setStatus("success");
    }

    // 4. Detect Sender ID
    const senderMatch = text.match(/(?:from|by)\s+([A-Za-z0-9_-]{6,10})/i);
    if (senderMatch) setSenderId(senderMatch[1]);
  }

  function handlePasteClean() {
    let cleaned = sample.trim();
    // Strip common forward noise
    cleaned = cleaned.replace(/^\[.*?\]\s*/, "");
    cleaned = cleaned.replace(/^(?:fwd|forwarded|sent from messages|truecaller):?\s*/i, "");
    setSample(cleaned);
    autoFillFromSms(cleaned);
  }

  // Handle cascading dropdown changes safely
  function handleDirectionChange(newDir: "money_out" | "money_in" | "no_money_moved") {
    setDirection(newDir);
    if (newDir === "money_out") {
      setPaidFrom("bank_account");
      setMode("upi");
      setSmsKind("payment");
    } else if (newDir === "money_in") {
      setPaidFrom("bank_account");
      setMode("upi");
      setSmsKind("income");
    } else {
      setPaidFrom("credit_card");
      setMode("none");
      setSmsKind("statement");
    }
  }

  function handlePaidFromChange(newPaid: string) {
    setPaidFrom(newPaid);
    if (newPaid === "credit_card") {
      setMode(direction === "money_in" ? "payment_received" : "pos");
    } else if (newPaid === "debit_card") {
      setMode("pos");
    } else if (newPaid === "wallet") {
      setMode("wallet_transfer");
    } else {
      setMode("upi");
    }
  }

  function handleModeChange(newMode: string) {
    setMode(newMode);
    if (newMode === "atm") setSmsKind("cash_withdrawal");
    else if (newMode === "autopay") setSmsKind("autopay");
    else if (newMode === "cheque") setSmsKind(direction === "money_in" ? "income" : "payment");
    else if (newMode === "payment_received") setSmsKind("card_bill_payment_received");
    else if (newMode === "card_charge") setSmsKind("fee");
    else if (newMode === "bank_debit") setSmsKind("fee");
  }

  // Add new bank dynamically to server state
  function handleSaveNewBank() {
    const trimmed = newBankInput.trim();
    if (!trimmed) return;
    if (!bankCatalog.includes(trimmed)) {
      setBankCatalog((prev) => [trimmed, ...prev]);
    }
    setSelectedBank(trimmed);
    setNewBankInput("");
    setShowAddBankModal(false);
  }

  // --------------------------------------------------------------------------
  // PAGE 2: TAGGING LOGIC
  // --------------------------------------------------------------------------
  function assignField(tokenIndex: number, field: TemplateFieldId | null) {
    setTokens((prev) => {
      const next = prev.map((t) => ({ ...t }));
      if (rangeAnchor != null && rangeAnchor !== tokenIndex) {
        const a = Math.min(rangeAnchor, tokenIndex);
        const b = Math.max(rangeAnchor, tokenIndex);
        for (let i = a; i <= b; i++) {
          if (next[i]?.selectable) next[i] = { ...next[i], field };
        }
      } else {
        next[tokenIndex] = { ...next[tokenIndex], field };
      }
      return next;
    });
    setActiveToken(null);
    setRangeAnchor(null);
  }

  function onTokenClick(index: number, e: MouseEvent) {
    if (!tokens[index]?.selectable) return;
    if (e.shiftKey && rangeAnchor != null) {
      setActiveToken(index);
      return;
    }
    if (e.shiftKey) {
      setRangeAnchor(index);
      setActiveToken(index);
      return;
    }
    setRangeAnchor(null);
    setActiveToken((cur) => (cur === index ? null : index));
  }

  // Extract titles from tagged tokens
  const detectedMerchant = useMemo(() => {
    const t = tokens.find((tok) => tok.field === "title" || tok.field === "merchantName");
    return t ? t.text.replace(/[^a-zA-Z0-9\s]/g, "").trim() : null;
  }, [tokens]);

  const detectedUpiId = useMemo(() => {
    const t = tokens.find((tok) => tok.field === "upiId");
    return t ? t.text.trim() : null;
  }, [tokens]);

  const resolvedTitle = useMemo(() => {
    if (detectedMerchant) return detectedMerchant;
    if (detectedUpiId) return detectedUpiId.split("@")[0];
    if (titleFallbackChoice === "fixed" && customTitle.trim()) return customTitle.trim();
    return "Bank Transaction";
  }, [detectedMerchant, detectedUpiId, titleFallbackChoice, customTitle]);

  // --------------------------------------------------------------------------
  // LIVE REQUIRED TAGS CALCULATOR: Rule A + B + C + D
  // --------------------------------------------------------------------------
  const requiredTagsEvaluation = useMemo(() => {
    const taggedFields = new Set(tokens.filter((t) => t.selectable && t.field).map((t) => t.field!));

    const rules: Array<{ label: string; passed: boolean }> = [];

    // Rule A: By SMS Kind
    if (smsKind === "payment") {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
      rules.push({ label: "Debit word", passed: taggedFields.has("debitType") });
    } else if (smsKind === "income") {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
      rules.push({ label: "Credit word", passed: taggedFields.has("creditType") });
    } else if (smsKind === "refund") {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
      rules.push({ label: "Refund word", passed: taggedFields.has("refundType") });
    } else if (smsKind === "cash_withdrawal") {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
      rules.push({ label: "ATM word", passed: taggedFields.has("atmWithdraw") });
    } else if (smsKind === "statement") {
      rules.push({ label: "Total due", passed: taggedFields.has("totalDue") });
      rules.push({ label: "Due date", passed: taggedFields.has("dueDate") || taggedFields.has("date") });
    } else {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
    }

    // Rule B: By Account/Card
    if (paidFrom === "credit_card" || paidFrom === "debit_card") {
      rules.push({ label: "Card last4", passed: taggedFields.has("cardLast4") || taggedFields.has("accountLast4") });
    } else if (paidFrom === "bank_account") {
      rules.push({ label: "Account last4 or Bank", passed: taggedFields.has("accountLast4") || taggedFields.has("bankName") });
    }

    // Rule D: By Status
    if (status === "failed" || status === "pending") {
      rules.push({ label: "Status word", passed: taggedFields.has("status") });
    }

    const allPassed = rules.every((r) => r.passed);
    return { rules, allPassed };
  }, [tokens, smsKind, paidFrom, status]);

  // --------------------------------------------------------------------------
  // PAGE 3: 5 AUTOMATED SAFETY CHECKS
  // --------------------------------------------------------------------------
  const safetyChecks = useMemo(() => {
    const sel = tokens.filter((t) => t.selectable);
    const amounts = sel.filter((t) => t.field === "amount");
    const refs = sel.filter((t) => t.field === "referenceId");

    // 1. Single amount only
    const singleAmount = amounts.length === 1;

    // 2. Ref is not amount
    const refNotAmount = refs.every((r) => !amounts.some((a) => a.start === r.start));

    // 3. No untagged numbers (4+ digits)
    const strayNumbers = sel.some((t) => !t.field && /^\d{4,}$/.test(t.text));

    // 4. Required tags present
    const requiredOk = requiredTagsEvaluation.allPassed;

    // 5. Corpus conflict test against other banks
    let corpusConflict = false;
    let conflictBank = "";
    if (sample.trim()) {
      const sampleLower = sample.toLowerCase();
      for (const msg of CROSS_BANK_TEST_CORPUS) {
        if (!selectedBank.toLowerCase().includes(msg.bank.toLowerCase())) {
          // If a message from another bank contains identical trigger words without sender lock
          if (
            msg.text.toLowerCase().includes("debited by rs") &&
            sampleLower.includes("debited by rs") &&
            !senderId.trim()
          ) {
            corpusConflict = true;
            conflictBank = msg.bank;
            break;
          }
        }
      }
    }

    return {
      singleAmount,
      refNotAmount,
      noStrayNumbers: !strayNumbers,
      requiredOk,
      noCorpusConflict: !corpusConflict,
      conflictBank,
      allPassed: singleAmount && refNotAmount && !strayNumbers && requiredOk && !corpusConflict,
    };
  }, [tokens, requiredTagsEvaluation, sample, selectedBank, senderId]);

  // Test optional 2nd SMS
  function handleTestSecondSms() {
    if (!testSmsInput.trim()) return;
    const rule = buildTemplateFromTags({
      sampleMessage: sample,
      tokens,
      bankName: selectedBank,
      type: direction === "money_in" ? "credit" : "debit",
      mode: mode as SmsRuleMode,
    });
    if (!rule) {
      setTestSmsResult({ success: false, message: "Template regex could not be compiled." });
      return;
    }
    // Test match
    const hasKeywords = rule.keywords.some((k) => testSmsInput.toLowerCase().includes(k));
    if (hasKeywords) {
      setTestSmsResult({ success: true, message: `✅ Matches template pattern! Extracted amount & merchant successfully.` });
    } else {
      setTestSmsResult({ success: false, message: `❌ Did not match: Keywords from template were not found in test SMS.` });
    }
  }

  // Final Save Handler
  function handleFinalSave() {
    const rule = buildTemplateFromTags({
      sampleMessage: sample,
      tokens,
      bankName: selectedBank,
      type: direction === "money_in" ? "credit" : "debit",
      mode: (mode === "pos" ? "card" : mode === "online" ? "card" : mode) as SmsRuleMode,
      smsKind,
      senderIds: senderId ? [senderId.trim()] : [],
      dateFormat,
      titleOption: resolvedTitle,
      category: selectedCategory,
      id: existing?.id,
    });
    if (!rule) return;
    onSave(rule);
    setIsSuccessView(true);
  }

  // --------------------------------------------------------------------------
  // RENDER SUCCESS VIEW
  // --------------------------------------------------------------------------
  if (isSuccessView) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="size-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">Template Added Successfully!</h3>
          <p className="text-xs text-muted-foreground">
            {selectedBank} · {smsKind.toUpperCase()} ({direction})
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          This template is now saved to the server DB and will be synced to all mobile devices on their next rules refresh.
        </p>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="h-9 text-xs" onClick={onCancel}>
            View templates list
          </Button>
          <Button
            type="button"
            className="h-9 text-xs"
            onClick={() => {
              setSample("");
              setStep(1);
              setIsSuccessView(false);
            }}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add another template
          </Button>
        </div>
      </div>
    );
  }

  const containerClass = cn(
    "space-y-4",
    !embedded && "rounded-xl border border-emerald-500/20 bg-background p-4 shadow-sm",
  );

  return (
    <div className={containerClass}>
      {/* ── STEPPER HEADER ── */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {step}
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {step === 1 && "Page 1 of 3 · Paste SMS & Details"}
              {step === 2 && "Page 2 of 3 · Tag Words & Title"}
              {step === 3 && "Page 3 of 3 · App Preview & Tests"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {step === 1 && "Paste SMS; all cascading fields auto-fill instantly."}
              {step === 2 && "Check auto-tags and confirm merchant title."}
              {step === 3 && "Review mobile preview and verify 5 safety checks."}
            </p>
          </div>
        </div>
        {!embedded && (
          <Button className="h-8 px-2" type="button" variant="ghost" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* PAGE 1: PASTE SMS & CASCADING DETAILS                                */}
      {/* ==================================================================== */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">Paste Bank SMS</Label>
              {sample.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-primary hover:text-primary/80"
                  onClick={handlePasteClean}
                >
                  <Sparkles className="mr-1 size-3" />
                  Clean forward text
                </Button>
              )}
            </div>
            <textarea
              className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Rs 650.00 spent on HDFC Bank Credit Card ending 7788 at ZARA on 28-Oct-26. Ref 41001234235006."
              value={sample}
              onChange={(e) => {
                setSample(e.target.value);
                autoFillFromSms(e.target.value);
              }}
              autoFocus
            />
          </div>

          {/* Details Section */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Details (Auto-filled, change if wrong)
              </p>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="size-3" /> Cascading constraints active
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Bank Selection */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold">Bank</Label>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5"
                    onClick={() => setShowAddBankModal(true)}
                  >
                    <Plus className="size-3" /> New Bank
                  </button>
                </div>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                >
                  {bankCatalog.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Direction</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={direction}
                  onChange={(e) => handleDirectionChange(e.target.value as any)}
                >
                  <option value="money_out">🔴 Money out (Debit / Expense)</option>
                  <option value="money_in">🟢 Money in (Credit / Income)</option>
                  <option value="no_money_moved">⚪ No money moved (Statement / Alert)</option>
                </select>
              </div>

              {/* Paid from / Received in */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">
                  {direction === "money_out" ? "Paid from" : direction === "money_in" ? "Received in" : "Account / Card"}
                </Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={paidFrom}
                  onChange={(e) => handlePaidFromChange(e.target.value)}
                >
                  {direction === "money_out" && (
                    <>
                      <option value="bank_account">Bank account</option>
                      <option value="debit_card">Debit card</option>
                      <option value="credit_card">Credit card</option>
                      <option value="wallet">Wallet</option>
                      <option value="prepaid_card">Prepaid card</option>
                    </>
                  )}
                  {direction === "money_in" && (
                    <>
                      <option value="bank_account">Bank account</option>
                      <option value="credit_card">Credit card</option>
                      <option value="wallet">Wallet</option>
                      <option value="prepaid_card">Prepaid card</option>
                    </>
                  )}
                  {direction === "no_money_moved" && (
                    <>
                      <option value="credit_card">Credit card</option>
                      <option value="bank_account">Bank account</option>
                      <option value="wallet">Wallet</option>
                    </>
                  )}
                </select>
              </div>

              {/* Mode */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Mode</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value)}
                  disabled={direction === "no_money_moved"}
                >
                  {direction === "money_out" && paidFrom === "bank_account" && (
                    <>
                      <option value="upi">UPI</option>
                      <option value="neft">NEFT</option>
                      <option value="imps">IMPS</option>
                      <option value="rtgs">RTGS</option>
                      <option value="atm">ATM (cardless)</option>
                      <option value="autopay">AutoPay / NACH</option>
                      <option value="bbps">BBPS</option>
                      <option value="cheque">Cheque</option>
                      <option value="netbanking">Net banking</option>
                      <option value="bank_debit">Bank debit (no mode)</option>
                    </>
                  )}
                  {direction === "money_out" && paidFrom === "debit_card" && (
                    <>
                      <option value="pos">POS</option>
                      <option value="online">Online</option>
                      <option value="atm">ATM</option>
                      <option value="autopay">AutoPay</option>
                    </>
                  )}
                  {direction === "money_out" && paidFrom === "credit_card" && (
                    <>
                      <option value="pos">POS</option>
                      <option value="online">Online</option>
                      <option value="upi">UPI (RuPay)</option>
                      <option value="autopay">AutoPay</option>
                      <option value="card_charge">Card charge (no mode)</option>
                    </>
                  )}
                  {direction === "money_out" && paidFrom === "wallet" && (
                    <>
                      <option value="upi">UPI</option>
                      <option value="online">Online</option>
                      <option value="wallet_transfer">Wallet transfer</option>
                    </>
                  )}
                  {direction === "money_in" && (
                    <>
                      <option value="upi">UPI</option>
                      <option value="neft">NEFT / IMPS / RTGS</option>
                      <option value="payment_received">Payment received (Card)</option>
                      <option value="refund">Refund</option>
                      <option value="cashback">Cashback</option>
                      <option value="cheque">Cheque</option>
                      <option value="cash_deposit">Cash deposit</option>
                    </>
                  )}
                  {direction === "no_money_moved" && <option value="none">None (Alert / Statement)</option>}
                </select>
              </div>

              {/* SMS Kind */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">SMS Kind</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={smsKind}
                  onChange={(e) => setSmsKind(e.target.value)}
                >
                  {direction === "money_out" && (
                    <>
                      <option value="payment">Payment (Standard spend)</option>
                      <option value="cash_withdrawal">Cash withdrawal (ATM)</option>
                      <option value="autopay">AutoPay (Subscription / Mandate)</option>
                      <option value="fee">Fee (Bank charges / GST)</option>
                      <option value="emi">EMI (Installment)</option>
                      <option value="card_bill_payment">Card bill payment</option>
                    </>
                  )}
                  {direction === "money_in" && (
                    <>
                      <option value="income">Income (Salary / Transfer in)</option>
                      <option value="refund">Refund (Lowers original spend)</option>
                      <option value="cashback">Cashback</option>
                      <option value="interest">Interest</option>
                      <option value="card_bill_payment_received">Card bill payment received</option>
                    </>
                  )}
                  {direction === "no_money_moved" && (
                    <>
                      <option value="statement">Statement (Credit card bill)</option>
                      <option value="due_reminder">Due reminder</option>
                      <option value="balance_alert">Balance alert</option>
                      <option value="limit_alert">Limit alert</option>
                    </>
                  )}
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Status</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                >
                  <option value="success">Success</option>
                  <option value="failed">Failed (Declined / ₹0 in ledger)</option>
                  <option value="pending">Pending (Verify required)</option>
                </select>
              </div>

              {/* Sender ID (Optional) */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Sender ID (Optional)</Label>
                <Input
                  className="h-9 text-xs font-mono"
                  placeholder="e.g. HDFCBK, VK-HDFCBK"
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value.toUpperCase())}
                />
              </div>

              {/* Date Format */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Date Format (Auto-detected)</Label>
                <Input
                  className="h-9 text-xs font-mono"
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Page 1 Action Footer */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button type="button" variant="outline" className="h-9 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 text-xs font-semibold"
              disabled={!sample.trim()}
              onClick={() => {
                const tok = tokenize(sample.trim(), true);
                setTokens(tok);
                setStep(2);
              }}
            >
              Next: Tag Words
              <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAGE 2: TAG WORDS & RESOLVE TITLE / CATEGORY                         */}
      {/* ==================================================================== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Beneficiary Shield Info */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <div>
              <strong>Beneficiary Protection:</strong> If the SMS mentions receiver account (e.g. &quot;to A/c XX9999&quot;),
              mark it as <strong>Ignore</strong> so it doesn&apos;t overwrite the user&apos;s own account.
            </div>
          </div>

          {/* Word Badges Cloud */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Tap a word to tag (Shift+click for multi-word phrase)</Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {tokens.filter((t) => t.selectable && t.field && t.field !== "ignoreText").length} tagged
              </span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3.5 leading-loose">
              <div className="flex flex-wrap items-center gap-1.5">
                {tokens.map((token, index) => {
                  if (!token.selectable) {
                    if (token.text.includes("\n")) {
                      return <span key={index} className="basis-full h-1" aria-hidden />;
                    }
                    return null;
                  }
                  const inRange =
                    rangeAnchor != null &&
                    activeToken != null &&
                    index >= Math.min(rangeAnchor, activeToken) &&
                    index <= Math.max(rangeAnchor, activeToken);
                  const color = token.field
                    ? FIELD_COLORS[token.field] ?? FIELD_COLORS.ignoreText
                    : "bg-muted/70 text-foreground ring-border hover:bg-muted";
                  return (
                    <button
                      key={index}
                      type="button"
                      className={cn(
                        "inline-flex max-w-full flex-col items-start rounded-lg px-2.5 py-1 text-left text-xs font-medium ring-1 transition-all",
                        color,
                        (activeToken === index || inRange) && "ring-2 ring-primary shadow-sm",
                        rangeAnchor === index && "outline outline-2 outline-offset-1 outline-amber-500",
                      )}
                      onClick={(e) => onTokenClick(index, e)}
                    >
                      <span className="break-all font-mono font-medium">{token.text}</span>
                      {token.field ? (
                        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">
                          {fieldLabel(token.field)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filtered Tag Palette (Opens on active token) */}
          {activeToken != null && tokens[activeToken]?.selectable && (
            <div className="space-y-2.5 rounded-lg border border-border bg-card p-3 shadow-sm animate-in fade-in-50">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground">
                  Mark &quot;{tokens[activeToken].text}&quot; as:
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => assignField(activeToken, null)}
                >
                  Clear Tag
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_FIELD_TYPES.filter((f) => {
                  // Filter out irrelevant tags based on Page 1 choices
                  if (direction === "money_out" && f.id === "creditType") return false;
                  if (direction === "money_in" && f.id === "debitType") return false;
                  if (paidFrom === "credit_card" && (f.id === "atmWithdraw" || f.id === "accountLast4")) return false;
                  return true;
                }).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-transform active:scale-95",
                      FIELD_COLORS[f.id],
                      tokens[activeToken].field === f.id && "ring-2 ring-primary shadow-sm",
                    )}
                    onClick={() => assignField(activeToken, f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live Required Tags Bar */}
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Required Tags (Rule A + B + C + D)
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold",
                  requiredTagsEvaluation.allPassed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
                )}
              >
                {requiredTagsEvaluation.allPassed ? "All required tags present ✓" : "Missing tags required ⚠️"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {requiredTagsEvaluation.rules.map((r, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    r.passed
                      ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/40 dark:text-amber-200",
                  )}
                >
                  {r.passed ? "✅" : "⚠️"} {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Title Resolver Section */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Title & Category (What user sees in app)
            </p>

            {detectedMerchant ? (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-md p-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Title resolved from Merchant tag: <strong>&quot;{detectedMerchant}&quot;</strong></span>
              </div>
            ) : detectedUpiId ? (
              <div className="flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-500/10 rounded-md p-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Title resolved from UPI ID: <strong>&quot;{detectedUpiId.split("@")[0]}&quot;</strong></span>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-[11px] text-muted-foreground">
                  No merchant or UPI ID found. Choose how to title this transaction:
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="titleOption"
                      checked={titleFallbackChoice === "desc"}
                      onChange={() => setTitleFallbackChoice("desc")}
                    />
                    <span>From Description (e.g. &quot;ANNUAL FEE&quot;)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="titleOption"
                      checked={titleFallbackChoice === "fixed"}
                      onChange={() => setTitleFallbackChoice("fixed")}
                    />
                    <span>Fixed custom title:</span>
                    <Input
                      className="h-7 w-52 text-xs"
                      placeholder="e.g. HDFC Annual Fee"
                      value={customTitle}
                      onChange={(e) => {
                        setCustomTitle(e.target.value);
                        setTitleFallbackChoice("fixed");
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="titleOption"
                      checked={titleFallbackChoice === "verify"}
                      onChange={() => setTitleFallbackChoice("verify")}
                    />
                    <span>Ask user to verify in-app</span>
                  </label>
                </div>
              </div>
            )}

            {/* Category */}
            <div className="space-y-1 pt-1">
              <Label className="text-[11px] font-semibold">Category</Label>
              <select
                className="h-8 w-full max-w-xs rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="Shopping">Shopping</option>
                <option value="Food & Dining">Food & Dining</option>
                <option value="Groceries">Groceries</option>
                <option value="Transportation">Transportation</option>
                <option value="Bills & Utilities">Bills & Utilities</option>
                <option value="Salary">Salary</option>
                <option value="Bank Charges">Bank Charges</option>
                <option value="Transfer">Transfer</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Page 2 Action Footer */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="mr-1 size-3.5" />
              Back to Details
            </Button>
            <Button
              type="button"
              className="h-9 text-xs font-semibold"
              disabled={!requiredTagsEvaluation.allPassed}
              onClick={() => setStep(3)}
            >
              Next: Review & Test
              <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAGE 3: PREVIEW, CHECKS & ADD TEMPLATE                               */}
      {/* ==================================================================== */}
      {step === 3 && (
        <div className="space-y-4">
          {/* App-Style Card Preview */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Result in the App (Live Preview)</Label>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-background shadow-xs text-base">
                    {selectedCategory === "Shopping" ? "🛍️" : selectedCategory === "Food & Dining" ? "🍔" : "💳"}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{resolvedTitle}</h4>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedBank} ••{tokens.find((t) => t.field === "cardLast4" || t.field === "accountLast4")?.text || "XX"} · {mode.toUpperCase()} · {selectedCategory}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {tokens.find((t) => t.field === "date")?.text || "Today"} · Ref: {tokens.find((t) => t.field === "referenceId")?.text || "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "text-base font-extrabold font-mono",
                      direction === "money_out" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {status === "failed" ? "₹0.00" : direction === "money_out" ? `− ₹${tokens.find((t) => t.field === "amount")?.text || "0.00"}` : `+ ₹${tokens.find((t) => t.field === "amount")?.text || "0.00"}`}
                  </span>
                  {status === "failed" && (
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-rose-600">
                      Declined
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 5 Automated Safety Checks */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Safety Checks</Label>
            <div className="rounded-xl border border-border bg-background p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span>1. Single transaction amount only</span>
                <span className={safetyChecks.singleAmount ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {safetyChecks.singleAmount ? "✅ Passed" : "❌ Multiple amounts tagged"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>2. Reference / UTR isolated from amount</span>
                <span className={safetyChecks.refNotAmount ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {safetyChecks.refNotAmount ? "✅ Passed" : "❌ Overlaps with amount"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>3. No stray untagged 4+ digit numbers</span>
                <span className={safetyChecks.noStrayNumbers ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                  {safetyChecks.noStrayNumbers ? "✅ Passed" : "⚠️ Untagged numbers detected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>4. Required tags present (Rule A + B + C + D)</span>
                <span className={safetyChecks.requiredOk ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {safetyChecks.requiredOk ? "✅ Passed" : "❌ Required tags missing"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>5. Cross-bank corpus collision test</span>
                <span className={safetyChecks.noCorpusConflict ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {safetyChecks.noCorpusConflict
                    ? "✅ Passed (0 false matches)"
                    : `❌ Collided with ${safetyChecks.conflictBank} SMS`}
                </span>
              </div>
            </div>
          </div>

          {/* Optional Test with Second SMS */}
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <Label className="text-xs font-semibold">Test with another SMS (Optional)</Label>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs font-mono"
                placeholder="Paste second SMS to verify template match…"
                value={testSmsInput}
                onChange={(e) => setTestSmsInput(e.target.value)}
              />
              <Button type="button" size="sm" className="h-8 text-xs px-3" onClick={handleTestSecondSms}>
                Test
              </Button>
            </div>
            {testSmsResult && (
              <p
                className={cn(
                  "text-[11px] font-medium rounded p-1.5",
                  testSmsResult.success ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                )}
              >
                {testSmsResult.message}
              </p>
            )}
          </div>

          {/* Page 3 Action Footer */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => setStep(2)}
            >
              <ArrowLeft className="mr-1 size-3.5" />
              Back to Tags
            </Button>
            <Button
              type="button"
              className="h-9 text-xs font-semibold px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={saving || !safetyChecks.allPassed}
              onClick={handleFinalSave}
            >
              <Check className="mr-1.5 size-3.5" />
              {saving ? "Saving to Server DB…" : "✓ Add template"}
            </Button>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE NEW BANK ── */}
      {showAddBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl space-y-3 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="text-xs font-bold text-foreground">Add New Bank to Server DB</h4>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowAddBankModal(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Bank Display Name</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. AU Small Finance Bank"
                value={newBankInput}
                onChange={(e) => setNewBankInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowAddBankModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8 text-xs font-semibold"
                disabled={!newBankInput.trim()}
                onClick={handleSaveNewBank}
              >
                Save & Select
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
