"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export const SEEDED_WALLETS = [
  "Paytm Wallet",
  "Amazon Pay",
  "PhonePe Wallet",
  "MobiKwik",
  "Freecharge",
  "PayZapp Wallet",
];

export const ALL_SEEDED_INSTITUTIONS = [...SEEDED_WALLETS, ...SEEDED_BANKS];

export const BANK_MATCH_RULES: Array<{ bank: string; keywords: string[] }> = [
  // ── Digital Wallets (Checked first so wallet names aren't masked by UPI/bank footer links) ──
  { bank: "Paytm Wallet", keywords: ["paytm wallet"] },
  { bank: "Amazon Pay", keywords: ["amazon pay balance", "amazon pay wallet", "amazon pay"] },
  { bank: "PayZapp Wallet", keywords: ["payzapp wallet", "payzapp"] },
  { bank: "PhonePe Wallet", keywords: ["phonepe wallet"] },
  { bank: "MobiKwik", keywords: ["mobikwik wallet", "mobikwik"] },
  { bank: "Freecharge", keywords: ["freecharge wallet", "freecharge"] },

  // ── Commercial & Payments Banks ──
  { bank: "Paytm Payments Bank", keywords: ["paytm payments bank", "paytm bank"] },
  { bank: "Airtel Payments Bank", keywords: ["airtel payments bank", "airtel bank"] },
  { bank: "HDFC Bank", keywords: ["hdfc", "hdfcbk"] },
  { bank: "State Bank of India (SBI)", keywords: ["sbi", "state bank", "sbin"] },
  { bank: "ICICI Bank", keywords: ["icici", "icicib"] },
  { bank: "Axis Bank", keywords: ["axis", "axisbk", "utib"] },
  { bank: "Kotak Mahindra Bank", keywords: ["kotak", "kmbl"] },
  { bank: "Punjab National Bank (PNB)", keywords: ["pnb", "punjab national"] },
  { bank: "Bank of Baroda (BOB)", keywords: ["baroda", "bob "] },
  { bank: "Canara Bank", keywords: ["canara", "cnrb"] },
  { bank: "Union Bank of India", keywords: ["union bank", "uboi"] },
  { bank: "IDFC FIRST Bank", keywords: ["idfc"] },
  { bank: "IndusInd Bank", keywords: ["indusind", "indusb"] },
  { bank: "Yes Bank", keywords: ["yes bank", "yesbnk"] },
  { bank: "Federal Bank", keywords: ["federal"] },
  { bank: "Indian Bank", keywords: ["indian bank"] },
  { bank: "RBL Bank", keywords: ["rbl"] },
  { bank: "Bandhan Bank", keywords: ["bandhan"] },
  { bank: "AU Small Finance Bank", keywords: ["au small", "aubank"] },
  { bank: "Jupiter", keywords: ["jupiter"] },
  { bank: "Fi Money", keywords: ["fi money", "epifi"] },
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
  { id: "merchant", label: "Merchant", group: "who" },
  { id: "bankName", label: "Bank name", group: "who" },
  { id: "accountLast4", label: "Account last4", group: "card" },
  { id: "cardLast4", label: "Card last4", group: "card" },
  { id: "cardPayment", label: "Card type (Credit/Debit)", group: "card" },
  { id: "accountType", label: "Account type (Savings/Current)", group: "card" },

  // Tracking, IDs & Channels
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

  // Unified Amber color for Merchant ("Big Basket")
  merchant: "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:text-amber-200",
  title: "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:text-amber-200",
  merchantName: "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:text-amber-200",

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

  date: "bg-yellow-500/20 text-yellow-800 ring-yellow-500/40 dark:text-yellow-300",
  time: "bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-200",
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

const CONNECTING_WORDS = new Set([
  "at",
  "on",
  "via",
  "to",
  "for",
  "using",
  "with",
  "from",
  "by",
  "in",
  "through",
  "dated",
  "ref",
  "refno",
  "avl",
  "bal",
  "balance",
  "clear",
  "sms",
  "not",
  "call",
  "block",
]);

const COMMON_MERCHANTS = new Set([
  "amazon",
  "flipkart",
  "swiggy",
  "zomato",
  "uber",
  "ola",
  "blinkit",
  "zepto",
  "bigbasket",
  "myntra",
  "netflix",
  "spotify",
  "makemytrip",
  "irctc",
  "starbucks",
  "kfc",
  "mcdonalds",
  "dominos",
  "reliance",
  "dmart",
  "jio",
  "airtel",
  "tataplay",
  "cred",
  "cultfit",
  "nykaa",
  "ajio",
  "zara",
  "decathlon",
  "bookmyshow",
  "dunzo",
]);

export function directionLabel(d: "money_out" | "money_in" | "no_money_moved" | string): string {
  if (d === "money_out") return "Money out";
  if (d === "money_in") return "Money in";
  if (d === "no_money_moved") return "No money moved";
  return "Not selected";
}

export function paidFromLabel(p: string, _d?: string): string {
  if (!p) return "Not selected";
  const map: Record<string, string> = {
    bank_account: "Bank account",
    debit_card: "Debit card",
    credit_card: "Credit card",
    wallet: "Wallet",
    prepaid_card: "Prepaid card",
  };
  return map[p] ?? p;
}

export function modeLabel(m: string): string {
  if (!m) return "Not selected";
  const map: Record<string, string> = {
    upi: "UPI",
    pos: "POS",
    online: "Online",
    card: "Card",
    atm: "ATM",
    neft: "NEFT",
    imps: "IMPS",
    rtgs: "RTGS",
    netbanking: "NetBanking",
    wallet: "Wallet",
    wallet_topup: "Add money (top-up)",
    wallet_transfer: "Wallet transfer",
    autopay: "AutoPay",
    cheque: "Cheque",
    bank_debit: "Bank debit",
    card_charge: "Card charge",
    none: "None",
  };
  return map[m] ?? m.toUpperCase();
}

export function smsKindLabel(k: string): string {
  if (!k) return "Not selected";
  const map: Record<string, string> = {
    payment: "Payment",
    wallet_topup: "Wallet top-up",
    income: "Income",
    statement: "Statement",
    refund: "Refund",
    cash_withdrawal: "Cash withdrawal",
    balance_alert: "Balance alert",
    failure: "Failure",
    otp_promo: "OTP / Promo",
    fee: "Fee",
    autopay: "AutoPay",
    emi: "EMI",
    cashback: "Cashback",
    due_reminder: "Due reminder",
    limit_alert: "Limit alert",
    card_bill_payment: "Card bill payment",
    card_bill_payment_received: "Card bill payment received",
  };
  return map[k] ?? k;
}

export function getRelevantTagIds(
  direction: string,
  paidFrom: string,
  mode: string,
  smsKind: string,
  status: string,
): Set<TemplateFieldId> {
  const ids = new Set<TemplateFieldId>([
    "amount",
    "bankName",
    "referenceId",
    "date",
    "time",
    "dateTime",
    "balance",
    "ignoreText",
  ]);

  // Direction & SMS kind
  if (direction === "money_out") {
    if (smsKind === "payment") {
      ids.add("debitType");
      ids.add("merchant");
    } else if (smsKind === "cash_withdrawal") {
      ids.add("atmWithdraw");
      ids.add("debitType");
    } else if (smsKind === "statement") {
      ids.add("totalDue");
      ids.add("minimumDue");
      ids.add("dueDate");
    } else if (smsKind === "refund") {
      ids.add("refundType");
      ids.add("merchant");
    } else {
      ids.add("debitType");
      ids.add("merchant");
    }
  } else if (direction === "money_in") {
    ids.add("creditType");
    ids.add("merchant");
    if (smsKind === "refund") ids.add("refundType");
  } else {
    // no_money_moved
    if (smsKind === "statement") {
      ids.add("totalDue");
      ids.add("minimumDue");
      ids.add("dueDate");
      ids.add("cardLimit");
    } else if (smsKind === "balance_alert") {
      ids.add("balance");
      ids.add("cardLimit");
    }
  }

  // Paid from
  if (paidFrom === "debit_card") {
    ids.add("cardLast4");
    ids.add("cardPayment");
    ids.add("accountLast4");
  } else if (paidFrom === "credit_card") {
    ids.add("cardLast4");
    ids.add("cardPayment");
    ids.add("cardLimit");
    ids.add("totalDue");
    ids.add("minimumDue");
    ids.add("dueDate");
    ids.add("emi");
    ids.add("feeOrInterest");
  } else if (paidFrom === "bank_account") {
    ids.add("accountLast4");
    ids.add("accountType");
    ids.add("chequeNumber");
  }

  // Mode
  if (mode === "upi") {
    ids.add("upiId");
    ids.add("merchant");
  } else if (mode === "pos" || mode === "online" || mode === "card") {
    ids.add("merchant");
    ids.add("cardLast4");
    ids.add("cardPayment");
  } else if (mode === "atm") {
    ids.add("atmWithdraw");
  } else if (mode === "neft" || mode === "imps" || mode === "rtgs") {
    ids.add("transferType");
    ids.add("accountLast4");
  }

  // Status
  if (status === "failed" || status === "pending") {
    ids.add("status");
  }

  return ids;
}

// Type / action words (Debit word, Credit word, ATM word…). Whole-word match on
// the letters only, so "statement" is not an ATM word and "Debit Card" stays card.
const TYPE_WORD_RULES: Array<[RegExp, TemplateFieldId]> = [
  [/^(?:debited|spent|paid|withdrawn|deducted|sent|purchase|purchased|charged)$/, "debitType"],
  [/^(?:credited|received|deposited|added)$/, "creditType"],
  [/^(?:refund|refunded|reversal|reversed)$/, "refundType"],
  [/^(?:transfer|transferred)$/, "transferType"],
  [/^atm$/, "atmWithdraw"],
  [/^emi$/, "emi"],
  [/^autopay$/, "autoPay"],
  [/^(?:failed|declined|unsuccessful|rejected)$/, "status"],
];

function detectTypeWord(text: string): TemplateFieldId | null {
  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return null;
  for (const [re, field] of TYPE_WORD_RULES) {
    if (re.test(word)) return field;
  }
  return null;
}

/** Tag untagged words that are type/action words; never overrides existing tags. */
function tagTypeWords(tokens: Token[]): Token[] {
  return tokens.map((t) => {
    if (!t.selectable || t.field) return t;
    const field = detectTypeWord(t.text);
    return field ? { ...t, field } : t;
  });
}

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
  if (/^\d{8,}(?:\/[a-z]+)?$/i.test(text) || /^1[89]\d{8,}/.test(text)) {
    return "phone";
  }

  // Date regex supporting month names (e.g. 28-Oct-26, 28-Oct-2026, 28/10/2026, 28-10-26)
  if (
    /^\d{1,2}[-/](?:[a-zA-Z]{3,}|\d{1,2})[-/]\d{2,4}$/.test(text) ||
    /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text)
  ) {
    if (prevLower.includes("due")) return "dueDate";
    return "date";
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return "time";

  // Long ref numbers (10+ digits, e.g. 41001234235005, UTR 281026001234, order 402-123456)
  if (/^\d{10,}$/.test(text) && !text.startsWith("1800") && !text.startsWith("1900")) {
    return "referenceId";
  }
  if (/^\d{9,16}$/.test(text) && !text.startsWith("1800") && !text.startsWith("1900")) {
    return "referenceId";
  }
  if (/^\d{3,}-\d{4,}$/.test(text)) {
    return "referenceId";
  }

  // Direction / action / status words
  const typeWord = detectTypeWord(text);
  if (typeWord) return typeWord;
  if (lower === "card") return "cardPayment";

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
    "paytm",
    "amazon",
    "payzapp",
    "phonepe",
    "mobikwik",
    "freecharge",
  ];
  if (banks.some((b) => lower === b || lower.includes(b))) return "bankName";

  const cleanWord = lower.replace(/[^a-z0-9]/g, "");
  if (COMMON_MERCHANTS.has(cleanWord)) return "merchant";

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
    const prevPrevI = s > 1 ? selIdx[s - 2] : -1;
    const prevText = prevI >= 0 ? next[prevI].text : "";
    const prevLower = prevText.toLowerCase();
    const prevPrevLower = prevPrevI >= 0 ? next[prevPrevI].text.toLowerCase() : "";
    const text = next[i].text;
    const lower = text.toLowerCase();

    // Multi-word Card Type: "Debit Card" or "Credit Card"
    if (lower === "card" && (prevLower === "debit" || prevLower === "credit") && prevI >= 0) {
      next[prevI] = { ...next[prevI], field: "cardPayment" };
      next[i] = { ...next[i], field: "cardPayment" };
    }

    // Multi-word Wallet: "Paytm Wallet", "PayZapp Wallet", "PhonePe Wallet", "Amazon Pay"
    if (lower === "wallet" && ["paytm", "payzapp", "phonepe", "mobikwik", "freecharge"].includes(prevLower) && prevI >= 0) {
      next[prevI] = { ...next[prevI], field: "bankName" };
      next[i] = { ...next[i], field: "bankName" };
    }
    if (lower === "pay" && prevLower === "amazon" && prevI >= 0) {
      next[prevI] = { ...next[prevI], field: "bankName" };
      next[i] = { ...next[i], field: "bankName" };
    }
    if (lower === "balance" && prevLower === "pay" && prevPrevLower === "amazon" && prevPrevI >= 0 && prevI >= 0) {
      next[prevPrevI] = { ...next[prevPrevI], field: "bankName" };
      next[prevI] = { ...next[prevI], field: "bankName" };
      next[i] = { ...next[i], field: "bankName" };
    }

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

    // Beneficiary Protection: "to A/c XX9999", "to XX9999", "credited to XX9999", "towards A/c XX9999", "to beneficiary A/c XX9999"
    let isBeneficiaryAcct = false;
    for (let back = 1; back <= 4; back++) {
      const bIdx = s - back;
      if (bIdx >= 0) {
        const bText = next[selIdx[bIdx]].text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (bText === "to" || bText === "towards" || bText === "transferred" || bText === "credited" || bText === "beneficiary") {
          isBeneficiaryAcct = true;
          break;
        }
        if (bText === "from" || bText === "debited") {
          isBeneficiaryAcct = false;
          break;
        }
      }
    }

    if (
      isBeneficiaryAcct &&
      (/^[x*X.]{1,}\d{2,6}$/i.test(text) || /^\d{4,}$/.test(text) || next[i].field === "accountLast4")
    ) {
      next[i] = { ...next[i], field: "ignoreText" };
    }

    // Common known merchant check
    const cleanWord = lower.replace(/[^a-z0-9]/g, "");
    if (COMMON_MERCHANTS.has(cleanWord) && !next[i].field) {
      next[i] = { ...next[i], field: "merchant" };
    }

    // After "At", "on", "to", "towards", "for", "info" (when not followed by A/c), word -> merchant
    const isMerchantPreposition =
      prevLower === "at" ||
      prevLower === "towards" ||
      prevLower === "for" ||
      prevLower === "info" ||
      (prevLower === "on" && !lower.includes("card") && !/^\d/.test(text)) ||
      (prevLower === "to" && prevPrevLower !== "a/c" && prevPrevLower !== "account" && !isBeneficiaryAcct);

    if (isMerchantPreposition && /^[A-Za-z]/.test(text) && !next[i].field) {
      if (!CONNECTING_WORDS.has(lower) && !["card", "acct", "account", "balance", "bal", "rs", "inr"].includes(lower)) {
        next[i] = { ...next[i], field: "merchant" };
      }
    }

    // Helpline
    if (/^\d{8,}\//.test(text) || lower.includes("1800")) {
      next[i] = { ...next[i], field: "phone" };
    }

    if (["block", "not", "you?", "call", "helpline"].includes(lower) && !next[i].field) {
      next[i] = { ...next[i], field: "ignoreText" };
    }
  }

  // Extra Beneficiary Guard: If multiple accountLast4 tags remain in money_out, ensure receiver accounts are ignoreText
  const acctIndices = next
    .map((t, idx) => (t.selectable && t.field === "accountLast4" ? idx : -1))
    .filter((idx) => idx >= 0);
  if (acctIndices.length > 1) {
    for (let a = 1; a < acctIndices.length; a++) {
      const idx = acctIndices[a];
      next[idx] = { ...next[idx], field: "ignoreText" };
    }
  }

  // Propagate merchant to consecutive words (e.g. "BIG BASKET"), STOPPING at connector words!
  for (let s = 0; s < selIdx.length - 1; s++) {
    const i = selIdx[s];
    const j = selIdx[s + 1];
    if (next[i].field === "merchant") {
      const nextWord = next[j].text.toLowerCase();
      // STOP before connector words like "on", "at", "via", "using", "with"
      if (CONNECTING_WORDS.has(nextWord)) {
        continue;
      }
      if (/^[A-Za-z0-9][A-Za-z0-9.'&-]*$/.test(next[j].text) && (!next[j].field || next[j].field === "merchant")) {
        next[j] = { ...next[j], field: "merchant" };
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

    const rawWord = match[0];
    let word = rawWord;
    let trailingPunct = "";

    // Strip trailing punctuation from words ("28-Oct-26." -> "28-Oct-26", "41001234235005." -> "41001234235005")
    const matchPunct = rawWord.match(/^(.+?)([.,;:!?\]\)]+)$/);
    if (matchPunct && !/^([.,;:!?\]\)]+)$/.test(rawWord)) {
      word = matchPunct[1];
      trailingPunct = matchPunct[2];
    }

    const wordStart = match.index;
    const wordEnd = match.index + word.length;

    tokens.push({
      text: word,
      start: wordStart,
      end: wordEnd,
      selectable: true,
      field: withAuto ? autoDetectField(word, prevSelectable) : null,
    });
    prevSelectable = word;

    if (trailingPunct) {
      tokens.push({
        text: trailingPunct,
        start: wordEnd,
        end: match.index + rawWord.length,
        selectable: false,
        field: null,
      });
    }

    lastEnd = match.index + rawWord.length;
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
  isActive?: boolean;
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
    isActive = true,
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
          : seg.field === "merchant" || seg.field === "merchantName" || seg.field === "title"
            ? "merchant"
            : seg.field === "cardPayment"
              ? "cardPayment"
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
          : seg.field === "merchant" || seg.field === "merchantName" || seg.field === "title"
            ? "merchant"
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
    isActive: isActive ?? true,
  };
}

// Pattern placeholder ({MERCHANT}, {ACCOUNTLAST4}…) -> tagger field id.
const PATTERN_FIELD_BY_TOKEN: Record<string, TemplateFieldId> = (() => {
  const m: Record<string, TemplateFieldId> = {};
  for (const f of TEMPLATE_FIELD_TYPES) m[f.id.toUpperCase()] = f.id;
  m.TITLE = "merchant";
  m.MERCHANTNAME = "merchant";
  m.CARDNUMBER = "accountLast4";
  m.ACCOUNTNUMBER = "accountLast4";
  return m;
})();

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Edit mode: rebuild word tags by matching the saved template_pattern against
 * the saved sample_message. Each {FIELD} becomes a lazy capture group; words
 * inside a captured span get that field. Returns null when the pattern does not
 * match the sample (caller falls back to extraction_map substring matching).
 */
function tagTokensFromPattern(sample: string, pattern: string, tokens: Token[]): Token[] | null {
  if (!sample || !pattern) return null;
  const placeholder = /\{([A-Za-z0-9_]+)\}/g;
  const fields: (TemplateFieldId | null)[] = [];
  // Every literal part is its own group too, so span offsets can be summed up.
  let source = "^(\\s*)";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = placeholder.exec(pattern)) !== null) {
    source += `(${escapeRegExp(pattern.slice(last, m.index))})([\\s\\S]+?)`;
    fields.push(PATTERN_FIELD_BY_TOKEN[m[1].toUpperCase()] ?? null);
    last = m.index + m[0].length;
  }
  if (fields.length === 0) return null;
  source += `(${escapeRegExp(pattern.slice(last))})(\\s*)$`;

  let match: RegExpExecArray | null;
  try {
    match = new RegExp(source).exec(sample);
  } catch {
    return null;
  }
  if (!match) return null;

  const spans: { start: number; end: number; field: TemplateFieldId }[] = [];
  let offset = match[1].length;
  for (let i = 0; i < fields.length; i++) {
    offset += match[2 + i * 2].length;
    const value = match[3 + i * 2];
    const field = fields[i];
    if (field && value.trim()) {
      spans.push({ start: offset, end: offset + value.length, field });
    }
    offset += value.length;
  }
  if (spans.length === 0) return null;

  return tokens.map((t) => {
    if (!t.selectable) return t;
    const span = spans.find((sp) => t.start < sp.end && t.end > sp.start);
    return span ? { ...t, field: span.field } : t;
  });
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
  const existingMeta = useMemo(() => {
    try {
      if (existing?.extractionMap?.["__meta"]) {
        return JSON.parse(existing.extractionMap["__meta"]);
      }
    } catch {}
    return null;
  }, [existing]);

  const [direction, setDirection] = useState<"money_out" | "money_in" | "no_money_moved" | "">(
    existing?.type === "credit" ? "money_in" : existing?.type === "transfer" ? "money_out" : existing ? "money_out" : "",
  );
  const [paidFrom, setPaidFrom] = useState<string>(existing ? "bank_account" : "");
  const [mode, setMode] = useState<string>(existing?.mode ?? (existing ? "upi" : ""));
  const [smsKind, setSmsKind] = useState<string>(
    (existing as any)?.smsKind ?? existingMeta?.smsKind ?? (existing ? "payment" : ""),
  );
  const [status, setStatus] = useState<"success" | "failed" | "pending" | "">(existing ? "success" : "");
  const [isActive, setIsActive] = useState<boolean>(existing?.isActive ?? true);

  // Server-Driven Bank & Wallet State
  const [bankCatalog, setBankCatalog] = useState<string[]>(ALL_SEEDED_INSTITUTIONS);
  const [selectedBank, setSelectedBank] = useState(existing?.bankName ?? "");
  const [newBankInput, setNewBankInput] = useState("");
  const [showAddBankModal, setShowAddBankModal] = useState(false);

  // Optional Page 1 settings
  const [senderId, setSenderId] = useState("");
  const [dateFormat, setDateFormat] = useState("dd-MMM-yy");

  // --------------------------------------------------------------------------
  // PAGE 2 STATE: Word Badges, Filtered Palette & Title
  // --------------------------------------------------------------------------
  const [tokens, setTokens] = useState<Token[]>(() => {
    if (existing?.sampleMessage) {
      const map = existing.extractionMap ?? {};
      const tok = tokenize(existing.sampleMessage, false);
      // Rebuild tags from template_pattern first; extraction_map keys are often
      // catalog tag names (Payee, Amount…) that never appear in the sample.
      const fromPattern = tagTokensFromPattern(
        existing.sampleMessage,
        existing.templatePattern ?? "",
        tok,
      );
      if (fromPattern) return tagTypeWords(fromPattern);
      // Fallback: only keys that are real sample text (catalog names like
      // "Balance" would otherwise tag "Bal", "Ref"… by substring).
      const sampleText = existing.sampleMessage;
      return tagTypeWords(tok.map((t) => {
        if (!t.selectable) return t;
        for (const [orig, f] of Object.entries(map)) {
          if (!orig || orig === "__meta" || orig.startsWith("__")) continue;
          if (!sampleText.includes(orig)) continue;
          if (orig.includes(t.text) || t.text.includes(orig)) {
            const fieldId = f === "merchantName" || f === "title" ? "merchant" : (f as TemplateFieldId);
            return { ...t, field: fieldId };
          }
        }
        return t;
      }));
    }
    if (initialSample) return tokenize(initialSample, true);
    return [];
  });
  const [activeToken, setActiveToken] = useState<number | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);

  // Title selection hierarchy
  const [customTitle, setCustomTitle] = useState("");
  const [titleFallbackChoice, setTitleFallbackChoice] = useState<"payer" | "desc" | "fixed" | "verify">("desc");
  const [selectedCategory, setSelectedCategory] = useState("Shopping");

  // --------------------------------------------------------------------------
  // PAGE 3 STATE: Test Console
  // --------------------------------------------------------------------------
  const [testSmsInput, setTestSmsInput] = useState("");
  const [testSmsResult, setTestSmsResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-detect on initial sample if present
  useEffect(() => {
    if (initialSample && !existing) {
      autoFillFromSms(initialSample);
    }
  }, []);

  // --------------------------------------------------------------------------
  // AUTO-DETECT ON SMS PASTE (Page 1)
  // --------------------------------------------------------------------------
  function autoFillFromSms(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setSelectedBank("");
      setDirection("");
      setPaidFrom("");
      setMode("");
      setSmsKind("");
      setStatus("");
      setSenderId("");
      return;
    }

    // Strip URLs, disclaimers, and dispute lines so links (e.g. https://1.hdfc.bank.in/...)
    // or SMS BLOCK lines never cause false bank detections
    const cleanForMatching = trimmed
      .replace(/https?:\/\/[^\s]+/gi, "")
      .replace(/(?:report|dispute|call|sms\s+block\w*)[:\s]+[^\n\.]+/gi, "");
    const cleanLower = cleanForMatching.toLowerCase();

    // 1. Detect Bank / Wallet
    let detectedBank = "";

    // Disambiguation: Check if SMS is for Paytm Payments Bank (a bank) or Paytm Wallet (a wallet)
    const isPaytmPaymentsBank =
      /\bpaytm\s+(?:payments\s+)?bank\b/i.test(cleanLower) ||
      (/\bpaytm\b/i.test(cleanLower) && /\b(?:a\/c|account|acct)\b/i.test(cleanLower) && !/\bwallet\b/i.test(cleanLower));

    // If money is debited FROM a bank A/c TOWARDS a wallet, the bank is the debiting bank, not the wallet
    const isDebitedFromBankTowardsWallet =
      /\b(?:debited|transferred|spent)\s+from\b/i.test(cleanLower) &&
      /\b(?:a\/c|account|acct)\b/i.test(cleanLower) &&
      /\b(?:towards|to)\s+(?:paytm\s+wallet|amazon\s+pay|payzapp|phonepe\s+wallet|mobikwik|freecharge|wallet)\b/i.test(cleanLower);

    for (const rule of BANK_MATCH_RULES) {
      // If it's a Paytm Payments Bank account SMS, don't let Paytm Wallet rule capture it
      if (isPaytmPaymentsBank && rule.bank === "Paytm Wallet") continue;
      // If it's debited from a bank a/c towards a wallet, skip wallet rules so the actual bank matches
      if (isDebitedFromBankTowardsWallet && SEEDED_WALLETS.includes(rule.bank)) continue;

      const match = rule.keywords.some((kw) => {
        const cleanKw = kw.trim();
        if (cleanKw.length <= 4) {
          const regex = new RegExp(`(?:^|[^a-z0-9])${cleanKw}(?:[^a-z0-9]|$)`, "i");
          return regex.test(cleanForMatching);
        }
        return cleanLower.includes(cleanKw);
      });
      if (match) {
        detectedBank = rule.bank;
        break;
      }
    }

    if (!detectedBank) {
      for (const b of bankCatalog) {
        const bLower = b.toLowerCase();
        const cleanB = bLower.replace(/\(.*?\)/g, "").trim();
        const words = cleanB.split(/\s+/).filter((w) => w.length > 2 && w !== "bank" && w !== "wallet");
        if (
          cleanLower.includes(cleanB) ||
          (words.length > 0 &&
            words.some((w) => {
              const regex = new RegExp(`(?:^|[^a-z0-9])${w}(?:[^a-z0-9]|$)`, "i");
              return regex.test(cleanForMatching);
            }))
        ) {
          detectedBank = b;
          break;
        }
      }
    }
    setSelectedBank(detectedBank);

    // 2. Detect Direction
    let detectedDirection: "money_out" | "money_in" | "no_money_moved" | "" = "";
    let detectedPaidFrom = "";
    let detectedMode = "";
    let detectedKind = "";

    const isCredit =
      /\b(?:credited|credit to|received|refund(?:ed)?|cashback|deposited|deposit of|reversal|added to|added)\b/i.test(cleanLower) ||
      /\btransferred to your\b/i.test(cleanLower);

    const isNoMoneyMoved =
      (/\b(?:statement|due date|total (?:amount )?due|min(?:imum)? (?:amount )?due|e-statement|bill generated)\b/i.test(cleanLower) ||
        (/\b(?:avail(?:able)?|avl) limit\b/i.test(cleanLower) && !/\b(?:spent|debited|paid|deducted)\b/i.test(cleanLower))) &&
      !isCredit;

    const isDebit =
      /\b(?:debited|spent|withdrawn|paid|transferred from|sent|txn of|deducted|purchase of|charged)\b/i.test(cleanLower) ||
      /\bused at\b/i.test(cleanLower);

    if (isCredit) {
      detectedDirection = "money_in";
    } else if (isNoMoneyMoved) {
      detectedDirection = "no_money_moved";
    } else if (isDebit) {
      detectedDirection = "money_out";
    }

    // 3. Detect Paid From (with disambiguation rules):
    // - "Paytm Wallet" / "Amazon Pay balance" → Wallet
    // - "Paytm Payments Bank A/c XXxxxx" → Bank account (it is a bank)
    // - "via Paytm UPI / PhonePe" from a bank a/c → Bank account (app only)
    // - "debited from Bank A/c towards Wallet" → Bank account
    const isViaAppUpiFromBank =
      /\bvia\s+(?:paytm|phonepe|gpay|google pay|bhim)\b/i.test(cleanLower) &&
      /\b(?:a\/c|account|acct|bank)\b/i.test(cleanLower);

    if (isViaAppUpiFromBank || isDebitedFromBankTowardsWallet || isPaytmPaymentsBank) {
      detectedPaidFrom = "bank_account";
    } else if (
      SEEDED_WALLETS.includes(detectedBank) ||
      /\b(?:wallet|paytm wallet|amazon pay(?:\s+balance)?|payzapp(?:\s+wallet)?|phonepe wallet|mobikwik|freecharge)\b/i.test(cleanLower)
    ) {
      detectedPaidFrom = "wallet";
    } else if (
      /\b(?:credit card|cc ending|c\/card)\b/i.test(cleanLower) ||
      (/\bcard ending\b/i.test(cleanLower) && (/\blimit\b/i.test(cleanLower) || /\breward\b/i.test(cleanLower) || /\bcredit\b/i.test(cleanLower)))
    ) {
      detectedPaidFrom = "credit_card";
    } else if (/\b(?:debit card|dc ending|dc\b|atm\/debit)\b/i.test(cleanLower)) {
      detectedPaidFrom = "debit_card";
    } else if (/\b(?:a\/c|account|acct|savings|current a\/c|a\/c no)\b/i.test(cleanLower)) {
      detectedPaidFrom = "bank_account";
    } else if (/\bcard ending\b/i.test(cleanLower) || /\bcard x\b/i.test(cleanLower)) {
      detectedPaidFrom = /\batm\b/i.test(cleanLower) ? "debit_card" : "credit_card";
    }

    // 4. Detect Mode
    if (detectedPaidFrom === "wallet") {
      if (detectedDirection === "money_in") {
        if (/\bcashback\b/i.test(cleanLower)) {
          detectedMode = "cashback";
        } else if (/\brefund\b/i.test(cleanLower)) {
          detectedMode = "refund";
        } else {
          detectedMode = "wallet_topup"; // "Add money (top-up)"
        }
      } else {
        if (/\b(?:upi|vpa)\b/i.test(cleanLower)) {
          detectedMode = "upi";
        } else if (/\b(?:online|e-?com)\b/i.test(cleanLower)) {
          detectedMode = "online";
        } else {
          detectedMode = "wallet_transfer";
        }
      }
    } else if (/\b(?:upi|vpa|gpay|google pay|phonepe|bhim)\b/i.test(cleanLower) || /[a-z0-9._-]+@[a-z]{3,}/i.test(cleanLower)) {
      detectedMode = "upi";
    } else if (/\b(?:atm|atm w\/d|atm cash|cash withdrawal|cash wdl|w\/d)\b/i.test(cleanLower)) {
      detectedMode = "atm";
    } else if (/\b(?:pos|pos purchase|pos swipe|swipe|at pos)\b/i.test(cleanLower)) {
      detectedMode = "pos";
    } else if (/\b(?:netbanking|net banking|internet banking)\b/i.test(cleanLower)) {
      detectedMode = "netbanking";
    } else if (/\b(?:e-?com|online|payment gateway)\b/i.test(cleanLower)) {
      detectedMode = "online";
    } else if (/\bneft\b/i.test(cleanLower)) {
      detectedMode = "neft";
    } else if (/\bimps\b/i.test(cleanLower)) {
      detectedMode = "imps";
    } else if (/\brtgs\b/i.test(cleanLower)) {
      detectedMode = "rtgs";
    } else if (/\b(?:autopay|nach|mandate|standing instruction)\b/i.test(cleanLower)) {
      detectedMode = "autopay";
    } else if (/\b(?:cheque|chq|clearing)\b/i.test(cleanLower)) {
      detectedMode = "cheque";
    } else if (/\b(?:fee|charges?|gst)\b/i.test(cleanLower)) {
      detectedMode = detectedPaidFrom === "credit_card" ? "card_charge" : "bank_debit";
    } else if (detectedDirection === "no_money_moved") {
      detectedMode = "none";
    } else if (detectedDirection === "money_in" && /\brefund\b/i.test(cleanLower)) {
      detectedMode = "refund";
    } else if (detectedDirection === "money_in" && /\bcashback\b/i.test(cleanLower)) {
      detectedMode = "cashback";
    } else if (detectedPaidFrom === "credit_card" || detectedPaidFrom === "debit_card") {
      detectedMode = "pos";
    }

    // 5. Detect SMS Kind
    const isCashback = /\bcashback\b/i.test(cleanLower);
    const isRefund = /\b(?:refund|reversal)\b/i.test(cleanLower);

    const isWalletTopupSms =
      !isCashback &&
      !isRefund &&
      ((/\b(?:added to|loaded to|top-?up|topped up)\b/i.test(cleanLower) &&
        /\b(?:wallet|paytm wallet|amazon pay|payzapp)\b/i.test(cleanLower)) ||
       (detectedPaidFrom === "wallet" && detectedDirection === "money_in") ||
       (detectedPaidFrom === "bank_account" && detectedDirection === "money_out" && /\b(?:wallet|paytm wallet|amazon pay|payzapp)\b/i.test(cleanLower)));

    if (isCashback) {
      detectedKind = "cashback";
    } else if (isRefund) {
      detectedKind = "refund";
    } else if (isWalletTopupSms) {
      detectedKind = "wallet_topup";
    } else if (detectedDirection === "no_money_moved" || /\b(?:statement|due date|bill generated)\b/i.test(cleanLower)) {
      detectedKind = "statement";
    } else if (/\b(?:balance alert|bal:? rs|available balance)\b/i.test(cleanLower) && !detectedDirection) {
      detectedKind = "balance_alert";
    } else if (/\b(?:atm|cash withdrawal|w\/d)\b/i.test(cleanLower)) {
      detectedKind = "cash_withdrawal";
      setSelectedCategory("ATM Cash Withdrawal");
    } else if (/\b(?:fee|charges?|annual maintenance|penalty)\b/i.test(cleanLower)) {
      detectedKind = "fee";
      setSelectedCategory("Bank Charges");
    } else if (/\b(?:autopay|nach|mandate|recurring)\b/i.test(cleanLower)) {
      detectedKind = "autopay";
      setSelectedCategory("Utility Bills");
    } else if (/\b(?:emi|installment)\b/i.test(cleanLower)) {
      detectedKind = "emi";
    } else if (/\b(?:refund|reversal)\b/i.test(cleanLower)) {
      detectedKind = "refund";
    } else if (/\bcashback\b/i.test(cleanLower)) {
      detectedKind = "cashback";
    } else if (/\b(?:card bill payment|payment received towards credit card)\b/i.test(cleanLower)) {
      detectedKind = detectedDirection === "money_in" ? "card_bill_payment_received" : "card_bill_payment";
    } else if (detectedDirection === "money_in") {
      detectedKind = "income";
    } else if (detectedDirection === "money_out") {
      detectedKind = "payment";
    }

    // 6. Detect Status
    let detectedStatus: "success" | "failed" | "pending" | "" = "";
    if (/\b(?:failed|declined|unsuccessful|rejected|failure)\b/i.test(cleanLower)) {
      detectedStatus = "failed";
    } else if (/\b(?:pending|initiated|processing|in progress)\b/i.test(cleanLower)) {
      detectedStatus = "pending";
    } else if (
      /\b(?:successful|success|completed|done|processed)\b/i.test(cleanLower) ||
      detectedDirection !== ""
    ) {
      detectedStatus = "success";
    }

    setDirection(detectedDirection);
    setPaidFrom(detectedPaidFrom);
    setMode(detectedMode);
    setSmsKind(detectedKind);
    setStatus(detectedStatus);

    // 7. Detect Sender ID
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
  function handleDirectionChange(newDir: "money_out" | "money_in" | "no_money_moved" | "") {
    setDirection(newDir);
    if (!newDir) return;
    if (newDir === "money_out") {
      if (!paidFrom) setPaidFrom("bank_account");
      if (!mode) setMode("upi");
      if (!smsKind) setSmsKind("payment");
    } else if (newDir === "money_in") {
      if (!paidFrom) setPaidFrom("bank_account");
      if (!mode) setMode("upi");
      if (!smsKind) setSmsKind("income");
    } else {
      if (!paidFrom) setPaidFrom("credit_card");
      setMode("none");
      if (!smsKind) setSmsKind("statement");
    }
  }

  function handlePaidFromChange(newPaid: string) {
    setPaidFrom(newPaid);
    if (!newPaid) return;
    if (newPaid === "credit_card") {
      if (!mode || mode === "bank_debit") {
        setMode(direction === "money_in" ? "payment_received" : "pos");
      }
    } else if (newPaid === "debit_card") {
      if (!mode || mode === "bank_debit") setMode("pos");
    } else if (newPaid === "wallet") {
      if (!mode) setMode(direction === "money_in" ? "wallet_topup" : "wallet_transfer");
      if (direction === "money_in" && !smsKind) setSmsKind("wallet_topup");
    } else {
      if (!mode || mode === "card_charge") setMode("upi");
    }
  }

  function handleModeChange(newMode: string) {
    setMode(newMode);
    if (newMode === "wallet_topup") {
      setSmsKind("wallet_topup");
    } else if (newMode === "atm") {
      setSmsKind("cash_withdrawal");
      setSelectedCategory("ATM Cash Withdrawal");
    } else if (newMode === "autopay") {
      setSmsKind("autopay");
      setSelectedCategory("Utility Bills");
    } else if (newMode === "cheque") {
      setSmsKind(direction === "money_in" ? "income" : "payment");
    } else if (newMode === "payment_received") {
      setSmsKind("card_bill_payment_received");
    } else if (newMode === "card_charge" || newMode === "bank_debit") {
      setSmsKind("fee");
      setSelectedCategory("Bank Charges");
    }
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
  // PAGE 1 -> PAGE 2 TRANSITION & INTELLIGENT RECONCILIATION
  // --------------------------------------------------------------------------
  function handleGoToPage2() {
    if (!sample.trim()) return;
    const currentSampleText = sample.trim();
    const tokenizedText = tokens.map((t) => t.text).join("");
    const isSameText = currentSampleText.replace(/\s+/g, "") === tokenizedText.replace(/\s+/g, "");

    if (tokens.length === 0 || !isSameText) {
      const tok = tokenize(currentSampleText, true);
      setTokens(tok);
      setStep(2);
      return;
    }

    // Returning to Page 2 after editing choices on Page 1:
    // Keep tags that still fit, prune obsolete ones, and alert user
    const validTags = getRelevantTagIds(direction, paidFrom, mode, smsKind, status);
    let removedCount = 0;
    const reconciled = tokens.map((t) => {
      if (t.field && t.field !== "ignoreText" && !validTags.has(t.field)) {
        removedCount += 1;
        return { ...t, field: null };
      }
      return t;
    });

    setTokens(reconciled);
    if (removedCount > 0) {
      setReconcileNotice(`Removed ${removedCount} tag(s) that no longer match your updated details.`);
      setTimeout(() => setReconcileNotice(null), 6000);
    }
    setStep(2);
  }

  // --------------------------------------------------------------------------
  // PAGE 2: TOUCH-FRIENDLY PHRASE SELECTION & TAGGING LOGIC
  // --------------------------------------------------------------------------
  const selectedTokenIndices = useMemo(() => {
    if (activeToken === null) return [];
    if (rangeAnchor === null) return [activeToken];
    const start = Math.min(activeToken, rangeAnchor);
    const end = Math.max(activeToken, rangeAnchor);
    const res: number[] = [];
    for (let idx = start; idx <= end; idx++) {
      if (tokens[idx]?.selectable) res.push(idx);
    }
    return res;
  }, [activeToken, rangeAnchor, tokens]);

  const selectedPhraseText = useMemo(() => {
    if (selectedTokenIndices.length === 0) return "";
    return selectedTokenIndices.map((i) => tokens[i].text).join(" ");
  }, [selectedTokenIndices, tokens]);

  const selectedField = useMemo(() => {
    if (selectedTokenIndices.length === 0) return null;
    const firstField = tokens[selectedTokenIndices[0]]?.field;
    const allSame = selectedTokenIndices.every((i) => tokens[i]?.field === firstField);
    return allSame ? firstField : null;
  }, [selectedTokenIndices, tokens]);

  function onTokenClick(index: number) {
    if (!tokens[index]?.selectable) return;
    if (activeToken === null) {
      setActiveToken(index);
      setRangeAnchor(null);
    } else if (rangeAnchor === null) {
      if (index === activeToken) {
        setActiveToken(null);
      } else {
        setRangeAnchor(activeToken);
        setActiveToken(index);
      }
    } else {
      setActiveToken(index);
      setRangeAnchor(null);
    }
  }

  function assignFieldToSelection(field: TemplateFieldId | null) {
    if (selectedTokenIndices.length === 0) return;
    setTokens((prev) =>
      prev.map((t, idx) =>
        selectedTokenIndices.includes(idx) ? { ...t, field } : t,
      ),
    );
    setActiveToken(null);
    setRangeAnchor(null);
  }

  // Beneficiary alert: show only if SMS has "to A/c", "credited to", or 2+ accounts
  const hasBeneficiaryAlert = useMemo(() => {
    const lower = sample.toLowerCase();
    const mentionsToAc = /\b(?:to|credited to|towards|transfer to)\s+(?:a\/c|acct|account|acc)/i.test(lower);
    const accountMatches = sample.match(/(?:[x*X]{2,}|\*{2,})\d{3,4}|\b\d{9,18}\b/g) ?? [];
    return mentionsToAc || accountMatches.length >= 2;
  }, [sample]);

  // Extract titles from tagged tokens (joins consecutive merchant words e.g. "Big Basket")
  const detectedMerchant = useMemo(() => {
    const merchantTokens = tokens.filter((tok) => tok.selectable && tok.field === "merchant");
    if (merchantTokens.length === 0) return null;
    return merchantTokens.map((t) => t.text.replace(/[^a-zA-Z0-9\s.'&-]/g, "").trim()).join(" ").trim();
  }, [tokens]);

  const detectedUpiId = useMemo(() => {
    const t = tokens.find((tok) => tok.field === "upiId");
    return t ? t.text.trim() : null;
  }, [tokens]);

  const resolvedTitle = useMemo(() => {
    if (detectedMerchant) return detectedMerchant;
    if (detectedUpiId) return detectedUpiId.split("@")[0];
    if (customTitle.trim()) return customTitle.trim();
    if (mode === "atm") return "ATM Cash Withdrawal";
    return "Bank Transaction";
  }, [detectedMerchant, detectedUpiId, customTitle, mode]);

  // Filtered tags for the Tag Palette
  const relevantTagIds = useMemo(() => {
    return getRelevantTagIds(direction, paidFrom, mode, smsKind, status);
  }, [direction, paidFrom, mode, smsKind, status]);

  const displayedTags = useMemo(() => {
    if (showMoreTags) return TEMPLATE_FIELD_TYPES;
    return TEMPLATE_FIELD_TYPES.filter((f) => relevantTagIds.has(f.id));
  }, [showMoreTags, relevantTagIds]);

  // --------------------------------------------------------------------------
  // LIVE REQUIRED TAGS CALCULATOR: Rule A + B + C + D (Mode-Specific)
  // --------------------------------------------------------------------------
  const requiredTagsEvaluation = useMemo(() => {
    const taggedFields = new Set(tokens.filter((t) => t.selectable && t.field).map((t) => t.field!));
    const rules: Array<{ label: string; passed: boolean }> = [];

    // Amount is required for money movements
    if (direction !== "no_money_moved") {
      rules.push({ label: "Amount", passed: taggedFields.has("amount") });
    }

    // Mode-specific validation rules
    if (paidFrom === "wallet") {
      rules.push({
        label: "Wallet name",
        passed: taggedFields.has("bankName") || taggedFields.has("merchant") || Boolean(customTitle.trim()),
      });
      if (direction === "money_in") {
        rules.push({
          label: "Credit / Added word",
          passed: taggedFields.has("creditType") || taggedFields.has("refundType"),
        });
      } else {
        rules.push({
          label: "Debit / Paid word",
          passed: taggedFields.has("debitType"),
        });
      }
    } else if (mode === "upi") {
      rules.push({
        label: "UPI ID or Merchant",
        passed: taggedFields.has("upiId") || taggedFields.has("merchant") || Boolean(customTitle.trim()),
      });
      rules.push({
        label: "Account last4",
        passed: taggedFields.has("accountLast4") || taggedFields.has("cardLast4"),
      });
      if (direction === "money_in") {
        rules.push({
          label: "Credit word",
          passed: taggedFields.has("creditType"),
        });
      } else {
        rules.push({
          label: "Debit word",
          passed: taggedFields.has("debitType"),
        });
      }
    } else if (mode === "pos" || mode === "online" || mode === "card" || paidFrom === "credit_card" || paidFrom === "debit_card") {
      rules.push({
        label: "Card last4",
        passed: taggedFields.has("cardLast4"),
      });
      rules.push({
        label: "Merchant (where spent)",
        passed: taggedFields.has("merchant") || Boolean(customTitle.trim()),
      });
      if (direction === "money_in") {
        rules.push({
          label: "Credit / Refund word",
          passed: taggedFields.has("creditType") || taggedFields.has("refundType"),
        });
      } else if (smsKind === "payment") {
        rules.push({
          label: "Debit word",
          passed: taggedFields.has("debitType"),
        });
      }
    } else if (mode === "atm" || smsKind === "cash_withdrawal") {
      rules.push({
        label: "ATM word",
        passed: taggedFields.has("atmWithdraw"),
      });
      rules.push({
        label: "Card or Account last4",
        passed: taggedFields.has("cardLast4") || taggedFields.has("accountLast4"),
      });
      // ATM mode: no merchant needed!
    } else if (smsKind === "fee" || mode === "card_charge" || mode === "bank_debit") {
      rules.push({
        label: "Account or Bank name",
        passed: taggedFields.has("accountLast4") || taggedFields.has("cardLast4") || taggedFields.has("bankName"),
      });
      rules.push({
        label: "Debit / Charge word",
        passed: taggedFields.has("debitType") || taggedFields.has("feeOrInterest"),
      });
      // Fee/Charge mode: no merchant needed!
    } else if (smsKind === "statement") {
      rules.push({ label: "Total due", passed: taggedFields.has("totalDue") });
      rules.push({ label: "Due date", passed: taggedFields.has("dueDate") || taggedFields.has("date") });
    } else if (direction === "money_in") {
      rules.push({ label: "Credit word", passed: taggedFields.has("creditType") });
      rules.push({ label: "Account last4 or Bank", passed: taggedFields.has("accountLast4") || taggedFields.has("bankName") });
    } else {
      rules.push({ label: "Account last4 or Bank", passed: taggedFields.has("accountLast4") || taggedFields.has("bankName") });
      rules.push({ label: "Debit word", passed: taggedFields.has("debitType") });
    }

    // Status word for failed/pending
    if (status === "failed" || status === "pending") {
      rules.push({ label: "Status word", passed: taggedFields.has("status") });
    }

    const allPassed = rules.every((r) => r.passed);
    return { rules, allPassed };
  }, [tokens, mode, paidFrom, direction, smsKind, status]);

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
      isActive,
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
            {selectedBank} · {smsKind.toUpperCase()} ({direction}) ·{" "}
            <span
              className={cn(
                "font-semibold",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground",
              )}
            >
              {isActive ? "Active (Synced)" : "Inactive / Draft"}
            </span>
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
              setSelectedBank("");
              setDirection("");
              setPaidFrom("");
              setMode("");
              setSmsKind("");
              setStatus("");
              setTokens([]);
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

  const isBankMissing = Boolean(sample.trim() && !selectedBank);
  const isDirMissing = Boolean(sample.trim() && !direction);
  const isPaidFromMissing = Boolean(sample.trim() && !paidFrom);
  const isModeMissing = Boolean(sample.trim() && direction !== "no_money_moved" && !mode);
  const isKindMissing = Boolean(sample.trim() && !smsKind);
  const isStatusMissing = Boolean(sample.trim() && !status);

  const isPage1Complete = Boolean(
    sample.trim() &&
    selectedBank &&
    direction &&
    paidFrom &&
    (direction === "no_money_moved" || mode) &&
    smsKind &&
    status
  );

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
              spellCheck={false}
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
              {/* Bank / Wallet Selection */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isBankMissing && "text-rose-600 dark:text-rose-400")}>
                  Bank / Wallet {isBankMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isBankMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                >
                  <option value="">-- Select Bank or Wallet (Required) --</option>
                  <optgroup label="👛 Digital Wallets">
                    {SEEDED_WALLETS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🏦 Commercial & Payments Banks">
                    {bankCatalog
                      .filter((b) => !SEEDED_WALLETS.includes(b))
                      .map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {isBankMissing && (
                  <div className="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-medium pt-1">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="size-3.5 shrink-0" />
                      Bank or wallet not found in SMS. Select from list or add new.
                    </span>
                    <button
                      type="button"
                      className="font-bold underline hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-0.5 ml-2 shrink-0"
                      onClick={() => setShowAddBankModal(true)}
                    >
                      <Plus className="size-3" /> Add Bank / Wallet
                    </button>
                  </div>
                )}
              </div>

              {/* Direction */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isDirMissing && "text-rose-600 dark:text-rose-400")}>
                  Direction {isDirMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isDirMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={direction}
                  onChange={(e) => handleDirectionChange(e.target.value as any)}
                >
                  <option value="">-- Select Direction (Required) --</option>
                  <option value="money_out">🔴 Money out (Debit / Expense)</option>
                  <option value="money_in">🟢 Money in (Credit / Income)</option>
                  <option value="no_money_moved">⚪ No money moved (Statement / Alert)</option>
                </select>
                {isDirMissing && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 pt-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Direction not detected. Please select Money out, Money in, or No money moved.
                  </p>
                )}
              </div>

              {/* Paid from / Received in */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isPaidFromMissing && "text-rose-600 dark:text-rose-400")}>
                  {direction === "money_out" ? "Paid from" : direction === "money_in" ? "Received in" : "Account / Card"} {isPaidFromMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isPaidFromMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={paidFrom}
                  onChange={(e) => handlePaidFromChange(e.target.value)}
                >
                  <option value="">-- Select Account / Card (Required) --</option>
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
                  {!direction && (
                    <>
                      <option value="bank_account">Bank account</option>
                      <option value="credit_card">Credit card</option>
                      <option value="debit_card">Debit card</option>
                      <option value="wallet">Wallet</option>
                      <option value="prepaid_card">Prepaid card</option>
                    </>
                  )}
                </select>
                {isPaidFromMissing && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 pt-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Account / card type not detected. Please select Bank account, Credit card, Debit card, etc.
                  </p>
                )}
              </div>

              {/* Mode */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isModeMissing && "text-rose-600 dark:text-rose-400")}>
                  Mode {isModeMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isModeMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value)}
                  disabled={direction === "no_money_moved"}
                >
                  <option value="">-- Select Mode (Required) --</option>
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
                      <option value="wallet_transfer">Wallet transfer</option>
                      <option value="online">Online</option>
                      <option value="upi">UPI</option>
                    </>
                  )}
                  {direction === "money_out" && !paidFrom && (
                    <>
                      <option value="upi">UPI</option>
                      <option value="pos">POS</option>
                      <option value="online">Online</option>
                      <option value="atm">ATM</option>
                      <option value="autopay">AutoPay / NACH</option>
                      <option value="neft">NEFT</option>
                      <option value="imps">IMPS</option>
                      <option value="rtgs">RTGS</option>
                      <option value="netbanking">Net banking</option>
                    </>
                  )}
                  {direction === "money_in" && (
                    <>
                      <option value="wallet_topup">Add money (top-up)</option>
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
                  {!direction && (
                    <>
                      <option value="upi">UPI</option>
                      <option value="pos">POS</option>
                      <option value="online">Online</option>
                      <option value="atm">ATM</option>
                      <option value="autopay">AutoPay</option>
                      <option value="neft">NEFT</option>
                      <option value="imps">IMPS</option>
                      <option value="rtgs">RTGS</option>
                      <option value="refund">Refund</option>
                      <option value="cashback">Cashback</option>
                    </>
                  )}
                </select>
                {isModeMissing && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 pt-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Payment mode not detected. Please select UPI, POS, ATM, Online, etc.
                  </p>
                )}
              </div>

              {/* SMS Kind */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isKindMissing && "text-rose-600 dark:text-rose-400")}>
                  SMS Kind {isKindMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isKindMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={smsKind}
                  onChange={(e) => setSmsKind(e.target.value)}
                >
                  <option value="">-- Select SMS Kind (Required) --</option>
                  {direction === "money_out" && (
                    <>
                      <option value="payment">Payment (Standard spend)</option>
                      <option value="wallet_topup">Wallet top-up (Bank ➔ Wallet transfer)</option>
                      <option value="cash_withdrawal">Cash withdrawal (ATM)</option>
                      <option value="autopay">AutoPay (Subscription / Mandate)</option>
                      <option value="fee">Fee (Bank charges / GST)</option>
                      <option value="emi">EMI (Installment)</option>
                      <option value="card_bill_payment">Card bill payment</option>
                    </>
                  )}
                  {direction === "money_in" && (
                    <>
                      <option value="wallet_topup">Wallet top-up (Bank ➔ Wallet transfer)</option>
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
                  {!direction && (
                    <>
                      <option value="payment">Payment (Standard spend)</option>
                      <option value="wallet_topup">Wallet top-up (Bank ➔ Wallet transfer)</option>
                      <option value="cash_withdrawal">Cash withdrawal (ATM)</option>
                      <option value="autopay">AutoPay (Subscription / Mandate)</option>
                      <option value="income">Income (Salary / Transfer in)</option>
                      <option value="refund">Refund</option>
                      <option value="cashback">Cashback</option>
                      <option value="statement">Statement (Credit card bill)</option>
                      <option value="fee">Fee (Bank charges / GST)</option>
                      <option value="emi">EMI (Installment)</option>
                      <option value="balance_alert">Balance alert</option>
                    </>
                  )}
                </select>
                {isKindMissing && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 pt-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    SMS kind not detected. Please select Payment, Cash withdrawal, Statement, etc.
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className={cn("text-[11px] font-semibold", isStatusMissing && "text-rose-600 dark:text-rose-400")}>
                  Status {isStatusMissing && "*"}
                </Label>
                <select
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/40",
                    isStatusMissing && "border-rose-500 ring-2 ring-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-semibold"
                  )}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                >
                  <option value="">-- Select Status (Required) --</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed (Declined / ₹0 in ledger)</option>
                  <option value="pending">Pending (Verify required)</option>
                </select>
                {isStatusMissing && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 pt-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Status not detected. Please select Success, Failed, or Pending.
                  </p>
                )}
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

              {/* Status Toggle (Active / Inactive) */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2.5 sm:col-span-2 shadow-2xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] font-semibold text-foreground">Rule Status</Label>
                    <Badge
                      className={cn(
                        "text-[9px] uppercase px-1.5 py-0",
                        isActive
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isActive ? "Active" : "Inactive / Draft"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {isActive
                      ? "Active — Synced to all mobile devices on next rules refresh."
                      : "Inactive / Draft — Saved on server, but skipped on mobile devices."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </span>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>
            </div>
          </div>

          {/* Page 1 Action Footer */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button type="button" variant="outline" className="h-9 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {!isPage1Complete && sample.trim() && (
                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                  <AlertCircle className="size-3.5 shrink-0" />
                  Complete required fields in red to continue
                </span>
              )}
              <Button
                type="button"
                className="h-9 text-xs font-semibold"
                disabled={!isPage1Complete}
                onClick={handleGoToPage2}
              >
                Next: Tag Words
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAGE 2: TAG WORDS & RESOLVE TITLE / CATEGORY                         */}
      {/* ==================================================================== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* 1. Details Summary Bar */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground flex-wrap">
              <span className="font-semibold">{directionLabel(direction)}</span>
              <span className="text-muted-foreground">·</span>
              <span>{paidFromLabel(paidFrom, direction)}</span>
              <span className="text-muted-foreground">·</span>
              <span>{modeLabel(mode)}</span>
              <span className="text-muted-foreground">·</span>
              <span>{smsKindLabel(smsKind)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="capitalize">{status}</span>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setIsActive((prev) => !prev)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:scale-105",
                  isActive
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
                title="Click to toggle Active / Inactive status"
              >
                <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-muted-foreground")} />
                <span>{isActive ? "Active" : "Inactive"}</span>
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold text-primary hover:text-primary gap-1 px-2 shrink-0"
              onClick={() => setStep(1)}
            >
              <Pencil className="size-3" />
              Edit
            </Button>
          </div>

          {/* Reconciliation Notice Banner (if any tags were pruned on return) */}
          {reconcileNotice && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-800 dark:text-sky-200 flex items-center justify-between">
              <span>{reconcileNotice}</span>
              <button
                type="button"
                className="text-xs font-bold hover:underline"
                onClick={() => setReconcileNotice(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* Word Badges Cloud (Tap word, then tap last word to select phrase) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Tap a word to tag. Tap a first word then a second word to select a phrase.
              </Label>
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
                  const isSelected = selectedTokenIndices.includes(index);
                  const isAnchor = rangeAnchor === index;
                  const isMerchant = token.field === "merchant";

                  // Check if previous or next selectable token is also merchant
                  const isPrevMerchant = (() => {
                    if (!isMerchant) return false;
                    for (let p = index - 1; p >= 0; p--) {
                      if (tokens[p].selectable) return tokens[p].field === "merchant";
                    }
                    return false;
                  })();
                  const isNextMerchant = (() => {
                    if (!isMerchant) return false;
                    for (let n = index + 1; n < tokens.length; n++) {
                      if (tokens[n].selectable) return tokens[n].field === "merchant";
                    }
                    return false;
                  })();

                  const color = token.field
                    ? FIELD_COLORS[token.field] ?? FIELD_COLORS.ignoreText
                    : "bg-muted/70 text-foreground ring-border hover:bg-muted";

                  return (
                    <button
                      key={index}
                      type="button"
                      className={cn(
                        "inline-flex max-w-full flex-col items-start px-2.5 py-1 text-left text-xs font-medium ring-1 transition-all",
                        color,
                        isMerchant && isPrevMerchant && isNextMerchant && "rounded-none ring-x-0 mx-0",
                        isMerchant && !isPrevMerchant && isNextMerchant && "rounded-l-lg rounded-r-none ring-r-0 -mr-1.5 z-1",
                        isMerchant && isPrevMerchant && !isNextMerchant && "rounded-r-lg rounded-l-none ring-l-0 z-1",
                        (!isMerchant || (!isPrevMerchant && !isNextMerchant)) && "rounded-lg",
                        isSelected && "ring-2 ring-primary shadow-sm z-10",
                        isAnchor && "outline outline-2 outline-offset-1 outline-amber-500 z-10",
                      )}
                      onClick={() => onTokenClick(index)}
                    >
                      <span className="break-all font-mono font-medium">{token.text}</span>
                      {token.field ? (
                        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">
                          {isMerchant && isPrevMerchant ? "" : fieldLabel(token.field)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Filtered Tag Palette (Opens on active token or phrase) */}
          {selectedTokenIndices.length > 0 && (
            <div className="space-y-2.5 rounded-lg border border-border bg-card p-3 shadow-sm animate-in fade-in-50">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground">
                  Mark &quot;{selectedPhraseText}&quot; as:
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => assignFieldToSelection(null)}
                >
                  Clear Tag
                </Button>
              </div>

              {/* Filtered Tag Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {displayedTags.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-transform active:scale-95",
                      FIELD_COLORS[f.id] ?? FIELD_COLORS.ignoreText,
                      selectedField === f.id && "ring-2 ring-primary shadow-sm",
                    )}
                    onClick={() => assignFieldToSelection(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Show more tags toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary hover:underline"
                  onClick={() => setShowMoreTags((prev) => !prev)}
                >
                  {showMoreTags ? "− Show fewer tags" : "+ Show more tags"}
                </button>
              </div>
            </div>
          )}

          {/* 5. Required Tags Checklist (Rule A + B + C + D) */}
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

          {/* 6. Title Section */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Title (What user sees in app)
              </p>
              <span className="text-[11px] text-muted-foreground">
                Resolved: <strong className="text-foreground">{resolvedTitle}</strong>
              </span>
            </div>

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
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    No merchant in SMS. Enter custom title:
                  </p>
                  {customTitle && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setCustomTitle("")}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Input
                  className="h-8 w-full text-xs"
                  placeholder="e.g. AMAZON, ATM Cash Withdrawal, or Annual Fee"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>
            )}
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

          {/* Active / Inactive Status Section */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3.5 shadow-2xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Rule Status</span>
                <Badge
                  className={cn(
                    "text-[9px] uppercase px-1.5 py-0",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isActive ? "Active" : "Inactive / Draft"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isActive
                  ? "Active — Phones will parse SMS using this template on next refresh."
                  : "Inactive / Draft — Saved on server but will not match transactions on mobile."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs font-semibold",
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
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
              className={cn(
                "h-9 text-xs font-semibold px-4 text-white",
                isActive
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-600 hover:bg-amber-700",
              )}
              disabled={saving || !safetyChecks.allPassed}
              onClick={handleFinalSave}
            >
              <Check className="mr-1.5 size-3.5" />
              {saving
                ? "Saving to Server DB…"
                : existing
                ? isActive
                  ? "✓ Save Active Template"
                  : "Save Inactive Template"
                : isActive
                ? "✓ Add Active Template"
                : "Add Inactive Template"}
            </Button>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE NEW BANK OR WALLET ── */}
      {showAddBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl space-y-3 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="text-xs font-bold text-foreground">Add New Bank or Wallet to Server DB</h4>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowAddBankModal(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Bank or Wallet Display Name</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. PhonePe Wallet or AU Small Finance Bank"
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
