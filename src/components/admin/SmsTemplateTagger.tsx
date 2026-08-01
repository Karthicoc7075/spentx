"use client";

/**
 * Mobile-style SMS template trainer for admin:
 * 1) Paste a bank SMS
 * 2) Each word is a badge — click to assign field type
 * 3) Builds templatePattern + extractionMap for sms_template_rules
 *
 * Example (HDFC card debit):
 *   Spent Rs.587 From HDFC Bank Card x8191 At PAULPANDI KATHIRESAN
 *   On 2026-02-28:19:28:51 Bal Rs.1027.78 …
 * → Debit word, Amount, Bank, Card last4, Title (multi-word), Date+Time, Balance
 */

import { ArrowLeft, Check, X } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SmsRuleMode, SmsTemplateRule, SmsTemplateRuleType } from "@/types";

/** Field chips shown when marking a word — expanded for card / datetime / phone. */
export const TEMPLATE_FIELD_TYPES = [
  { id: "amount", label: "Amount", group: "money" },
  { id: "balance", label: "Balance", group: "money" },
  { id: "title", label: "Title / Merchant", group: "who" },
  { id: "merchantName", label: "Merchant name", group: "who" },
  { id: "bankName", label: "Bank", group: "who" },
  { id: "accountLast4", label: "Account last4", group: "card" },
  { id: "cardLast4", label: "Card last4", group: "card" },
  { id: "cardNumber", label: "Card number", group: "card" },
  { id: "accountNumber", label: "Account no.", group: "card" },
  { id: "upiId", label: "UPI ID", group: "ids" },
  { id: "referenceId", label: "Ref / UTR", group: "ids" },
  { id: "phone", label: "Phone / helpline", group: "ids" },
  { id: "date", label: "Date only", group: "when" },
  { id: "time", label: "Time only", group: "when" },
  { id: "dateTime", label: "Date + time (one word)", group: "when" },
  { id: "debitType", label: "Debit word (Spent/Paid…)", group: "type" },
  { id: "creditType", label: "Credit word", group: "type" },
  { id: "transferType", label: "Transfer word", group: "type" },
  { id: "atmWithdraw", label: "ATM word", group: "type" },
  { id: "cardPayment", label: "Card word", group: "type" },
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
  amount: "bg-emerald-500/20 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300",
  title: "bg-violet-500/20 text-violet-700 ring-violet-500/40 dark:text-violet-300",
  merchantName: "bg-violet-500/25 text-violet-800 ring-violet-500/40 dark:text-violet-200",
  bankName: "bg-sky-500/20 text-sky-700 ring-sky-500/40 dark:text-sky-300",
  accountLast4: "bg-cyan-500/20 text-cyan-700 ring-cyan-500/40 dark:text-cyan-300",
  cardLast4: "bg-blue-500/25 text-blue-800 ring-blue-500/40 dark:text-blue-200",
  cardNumber: "bg-blue-500/20 text-blue-700 ring-blue-500/40 dark:text-blue-300",
  accountNumber: "bg-cyan-500/15 text-cyan-800 ring-cyan-500/30 dark:text-cyan-200",
  upiId: "bg-indigo-500/20 text-indigo-700 ring-indigo-500/40 dark:text-indigo-300",
  referenceId: "bg-fuchsia-500/20 text-fuchsia-700 ring-fuchsia-500/40 dark:text-fuchsia-300",
  phone: "bg-slate-500/20 text-slate-700 ring-slate-500/40 dark:text-slate-300",
  date: "bg-amber-500/20 text-amber-800 ring-amber-500/40 dark:text-amber-300",
  time: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-200",
  dateTime: "bg-orange-500/20 text-orange-800 ring-orange-500/40 dark:text-orange-200",
  balance: "bg-teal-500/20 text-teal-700 ring-teal-500/40 dark:text-teal-300",
  debitType: "bg-rose-500/20 text-rose-700 ring-rose-500/40 dark:text-rose-300",
  creditType: "bg-green-500/20 text-green-700 ring-green-500/40 dark:text-green-300",
  transferType: "bg-orange-500/25 text-orange-800 ring-orange-500/40 dark:text-orange-200",
  atmWithdraw: "bg-rose-500/15 text-rose-600 ring-rose-500/30",
  cardPayment: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-300",
  ignoreText: "bg-muted text-muted-foreground ring-border",
};

const FIELD_GROUPS: Array<{ id: string; label: string }> = [
  { id: "money", label: "Money" },
  { id: "who", label: "Who / where" },
  { id: "card", label: "Card / account" },
  { id: "ids", label: "IDs / phone" },
  { id: "when", label: "Date & time" },
  { id: "type", label: "Txn type words" },
  { id: "misc", label: "Other" },
];

function fieldLabel(id: string) {
  return TEMPLATE_FIELD_TYPES.find((f) => f.id === id)?.label ?? id;
}

function tokenTag(field: string) {
  // dateTime → {DATETIME} for pattern
  return `{${field.toUpperCase()}}`;
}

/**
 * Auto-tag a single word. `prev` is previous selectable word (for context like
 * "Card x8191", "Bal Rs.1027.78").
 */
function autoDetectField(text: string, prev?: string): TemplateFieldId | null {
  const lower = text.toLowerCase().trim();
  const prevLower = (prev ?? "").toLowerCase().trim();

  // Combined date+time: 2026-02-28:19:28:51 or 2026-02-28 19:28:51 as one token
  if (
    /^\d{4}[-/]\d{2}[-/]\d{2}[ T:]\d{1,2}:\d{2}(?::\d{2})?$/.test(text) ||
    /^\d{2}[-/]\d{2}[-/]\d{2,4}[ T:]\d{1,2}:\d{2}(?::\d{2})?$/.test(text)
  ) {
    return "dateTime";
  }

  // Amount / balance amount after "Bal"
  if (/^(?:rs\.?|₹|inr)?[0-9,]+(?:\.[0-9]{1,2})?$/i.test(text)) {
    if (prevLower === "bal" || prevLower === "balance" || prevLower.startsWith("avl")) {
      return "balance";
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

  if (text.includes("@")) return "upiId";

  // Phone / helpline (often with /SMS glued)
  if (/^\d{8,}(?:\/[a-z]+)?$/i.test(text) || /^1[89]\d{8,}/.test(text)) {
    return "phone";
  }
  if (/^\d{10,}$/.test(text)) return "phone";

  if (/^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(text) || /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text)) {
    return "date";
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return "time";

  // Long ref numbers (not phone)
  if (/^\d{9,12}$/.test(text) && !text.startsWith("18") && !text.startsWith("19")) {
    return "referenceId";
  }

  // Debit / credit / transfer type words
  if (
    ["debited", "spent", "sent", "paid", "withdrawn", "purchase"].some(
      (k) => lower === k || lower.startsWith(k),
    )
  ) {
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

  // Noise after "Not You?" / BLOCK / Call
  if (
    ["not", "you?", "you", "call", "block", "sms", "dc", "to"].includes(lower) ||
    lower.includes("1800") ||
    lower.includes("/sms")
  ) {
    if (lower.includes("1800") || lower.includes("/sms")) return "phone";
    // leave "Not You?" etc for user to ignore
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

/** Second pass: fix Bal Rs.x, multi-token context. */
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

    // "Bal Rs.1027.78" → amount after Bal should be balance
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

    // After "At" next capitalized words → title (first word only; user extends phrase)
    if (prevLower === "at" && /^[A-Za-z]/.test(text) && !next[i].field) {
      next[i] = { ...next[i], field: "title" };
    }

    // Helpline glued: 18002586161/SMS
    if (/^\d{8,}\//.test(text) || lower.includes("18002586161")) {
      next[i] = { ...next[i], field: "phone" };
    }

    // BLOCK DC 8191 — ignore block keywords, card last4 for bare 4 digits after DC
    if (prevLower === "dc" && /^\d{4}$/.test(text)) {
      next[i] = { ...next[i], field: "cardLast4" };
    }
    if (["block", "not", "you?", "call"].includes(lower) && !next[i].field) {
      next[i] = { ...next[i], field: "ignoreText" };
    }
  }

  // Propagate title to following ALLCAPS name tokens (PAULPANDI KATHIRESAN)
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

function inferTypeMode(sample: string): {
  type: SmsTemplateRuleType;
  mode: SmsRuleMode;
} {
  const lower = sample.toLowerCase();
  let type: SmsTemplateRuleType = "debit";
  if (
    lower.includes("credited") ||
    lower.includes("received") ||
    lower.includes("deposited")
  ) {
    type = "credit";
  } else if (lower.includes("transfer") || lower.includes("atm")) {
    type = "transfer";
  } else if (
    lower.includes("spent") ||
    lower.includes("debited") ||
    lower.includes("paid") ||
    lower.includes("sent")
  ) {
    type = "debit";
  }

  let mode: SmsRuleMode = "upi";
  if (lower.includes("card") || lower.includes(" pos ") || lower.includes("dc ")) {
    mode = "card";
  } else if (lower.includes("atm")) {
    mode = "atm";
  } else if (lower.includes("upi") || lower.includes("@")) {
    mode = "upi";
  }

  return { type, mode };
}

function inferBankName(sample: string, tokens: Token[]): string {
  const tagged = tokens.find((t) => t.field === "bankName")?.text;
  if (tagged) return tagged.replace(/[^a-zA-Z]/g, "") || tagged;
  const lower = sample.toLowerCase();
  for (const b of [
    "HDFC",
    "SBI",
    "ICICI",
    "Axis",
    "Kotak",
    "PNB",
    "Canara",
    "IDFC",
  ]) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  return "";
}

/** Build template pattern + extraction map from tagged tokens. */
export function buildTemplateFromTags(input: {
  sampleMessage: string;
  tokens: Token[];
  bankName: string;
  type: SmsTemplateRuleType;
  mode: SmsRuleMode;
  id?: string;
}): Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt"> | null {
  const { sampleMessage, tokens, bankName, type, mode, id } = input;
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
    // Merge consecutive same-field words (multi-word Title: PAULPANDI KATHIRESAN)
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
    // Normalize cardLast4 → accountLast4 for engine compatibility, keep cardLast4 in map too
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
    // Store original field id so admin can re-edit; engines read amount/title/etc.
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

  return {
    id: id ?? crypto.randomUUID(),
    bankName: bankName.trim() || bankFromTag || "Unknown",
    type,
    mode,
    templatePattern: template,
    extractionMap,
    keywords: keywords.slice(0, 20),
    sampleMessage,
    similarityThreshold: 0.65,
    isActive: true,
  };
}

type SmsTemplateTaggerProps = {
  onCancel: () => void;
  onSave: (rule: Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt">) => void;
  saving?: boolean;
  initialSample?: string;
  existing?: SmsTemplateRule | null;
  /** When true, omit outer card chrome (parent dialog already frames the UI). */
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
  const [step, setStep] = useState<"paste" | "tag">(
    existing?.sampleMessage || initialSample ? "tag" : "paste",
  );
  const [sample, setSample] = useState(
    existing?.sampleMessage || initialSample || "",
  );
  const [tokens, setTokens] = useState<Token[]>(() => {
    if (existing?.sampleMessage) {
      return applyExistingTags(tokenize(existing.sampleMessage, false), existing);
    }
    if (initialSample) return tokenize(initialSample, true);
    return [];
  });
  const [activeToken, setActiveToken] = useState<number | null>(null);
  /** Phrase range: first word index, then Shift+click second to select span */
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [type, setType] = useState<SmsTemplateRuleType>(
    (existing?.type as SmsTemplateRuleType) ?? "debit",
  );
  const [mode, setMode] = useState<SmsRuleMode>(
    (existing?.mode as SmsRuleMode) ?? "card",
  );

  const taggedCount = useMemo(
    () => tokens.filter((t) => t.selectable && t.field && t.field !== "ignoreText").length,
    [tokens],
  );

  function goTag() {
    const text = sample.trim();
    if (!text) return;
    setSample(text);
    const tok = tokenize(text, true);
    setTokens(tok);
    const inferred = inferTypeMode(text);
    setType(inferred.type);
    setMode(inferred.mode);
    setBankName((b) => b || inferBankName(text, tok));
    setStep("tag");
    setActiveToken(null);
    setRangeAnchor(null);
  }

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

  function handleSave() {
    const rule = buildTemplateFromTags({
      sampleMessage: sample,
      tokens,
      bankName,
      type,
      mode,
      id: existing?.id,
    });
    if (!rule) return;
    onSave(rule);
  }

  const shell = cn(
    "space-y-4",
    !embedded && "rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4",
  );

  if (step === "paste") {
    return (
      <div className={shell}>
        {!embedded ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Paste bank SMS</p>
            <Button className="h-8" type="button" variant="ghost" onClick={onCancel}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm font-semibold">1 · Paste bank SMS</p>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Example:{" "}
          <span className="font-mono text-[11px]">
            Spent Rs.587 From HDFC Bank Card x8191 At PAULPANDI KATHIRESAN On
            2026-02-28:19:28:51 Bal Rs.1027.78 …
          </span>
          <br />
          Next: tap each word → mark Amount, Card last4, Title, Date+time, Balance…
        </p>
        <textarea
          className="min-h-36 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="Spent Rs.587 From HDFC Bank Card x8191 At PAULPANDI KATHIRESAN On 2026-02-28:19:28:51 Bal Rs.1027.78 …"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          autoFocus
        />
        <div className="flex sticky bottom-0 gap-2 bg-background/80 py-2 backdrop-blur-sm">
          <Button
            className="h-9"
            disabled={!sample.trim()}
            type="button"
            onClick={goTag}
          >
            Next — tag words
          </Button>
          <Button className="h-9" type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            className="h-8 px-2"
            type="button"
            variant="ghost"
            onClick={() => {
              setStep("paste");
              setActiveToken(null);
              setRangeAnchor(null);
            }}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="text-sm font-semibold">2 · Tag each word</p>
            <p className="text-[11px] text-muted-foreground">
              Tap badge → pick type. Shift+click two words for multi-word Title
              (e.g. PAULPANDI KATHIRESAN). {taggedCount} tagged.
            </p>
          </div>
        </div>
        {!embedded ? (
          <Button className="h-8" type="button" variant="ghost" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {rangeAnchor != null ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
          Phrase mode: Shift+click the <strong>last</strong> word, then choose a
          type (applies to the whole range).
        </p>
      ) : null}

      {/* Word badges */}
      <div className="rounded-xl border border-border bg-background p-3">
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
              : "bg-muted/60 text-foreground ring-border hover:bg-muted";
            return (
              <button
                key={index}
                type="button"
                className={cn(
                  "inline-flex max-w-full flex-col items-start rounded-lg px-2 py-1 text-left text-xs font-medium ring-1 transition-colors",
                  color,
                  (activeToken === index || inRange) && "ring-2 ring-primary",
                  rangeAnchor === index && "outline outline-2 outline-offset-1 outline-amber-500",
                )}
                onClick={(e) => onTokenClick(index, e)}
              >
                <span className="break-all font-mono">{token.text}</span>
                {token.field ? (
                  <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide opacity-80">
                    {fieldLabel(token.field)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Field picker — grouped */}
      {activeToken != null && tokens[activeToken]?.selectable ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-semibold text-muted-foreground">
            Mark &quot;{tokens[activeToken].text}
            {rangeAnchor != null && rangeAnchor !== activeToken
              ? ` … ${tokens[activeToken].text}`
              : ""}
            &quot; as:
          </p>
          <button
            type="button"
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            onClick={() => assignField(activeToken, null)}
          >
            Clear
          </button>
          {FIELD_GROUPS.map((group) => {
            const fields = TEMPLATE_FIELD_TYPES.filter((f) => f.group === group.id);
            if (!fields.length) return null;
            return (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fields.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                        FIELD_COLORS[f.id],
                        tokens[activeToken].field === f.id && "ring-2 ring-primary",
                      )}
                      onClick={() => assignField(activeToken, f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Auto-tags: <strong>Spent</strong> → Debit word, <strong>Rs.587</strong> →
          Amount, <strong>HDFC</strong> → Bank, <strong>x8191</strong> → Card last4,{" "}
          <strong>PAULPANDI KATHIRESAN</strong> → Title,{" "}
          <strong>2026-02-28:19:28:51</strong> → Date+time, <strong>Bal Rs.…</strong>{" "}
          → Balance. Helpline <strong>1800…/SMS</strong> → Phone / Ignore.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
            Bank name
          </Label>
          <Input
            placeholder="HDFC"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
            Type (split)
          </Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as SmsTemplateRuleType)}
          >
            <option value="debit">debit (Spent / Paid / Debited)</option>
            <option value="credit">credit (Credited / Received)</option>
            <option value="transfer">transfer (ATM / Transfer)</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
            Mode
          </Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as SmsRuleMode)}
          >
            <option value="card">card</option>
            <option value="upi">upi</option>
            <option value="atm">atm</option>
          </select>
        </div>
      </div>

      {taggedCount > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/80 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
            Template preview
          </p>
          <p className="break-all font-mono text-[11px] leading-relaxed text-foreground">
            {buildTemplateFromTags({
              sampleMessage: sample,
              tokens,
              bankName,
              type,
              mode,
            })?.templatePattern ?? "—"}
          </p>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm">
        <Button
          className="h-9"
          disabled={saving || taggedCount === 0}
          type="button"
          onClick={handleSave}
        >
          <Check className="mr-1.5 size-3.5" />
          {saving ? "Saving…" : "Save template"}
        </Button>
        <Button className="h-9" type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="h-9 text-xs"
          type="button"
          variant="ghost"
          onClick={() => {
            setRangeAnchor(activeToken);
          }}
        >
          Start multi-word phrase
        </Button>
      </div>
    </div>
  );
}

function applyExistingTags(tokens: Token[], rule: SmsTemplateRule): Token[] {
  const map = rule.extractionMap ?? {};
  return tokens.map((t) => {
    if (!t.selectable) return t;
    for (const [original, field] of Object.entries(map)) {
      if (original.includes(t.text) || t.text.includes(original)) {
        return { ...t, field: field as TemplateFieldId };
      }
    }
    return t;
  });
}
