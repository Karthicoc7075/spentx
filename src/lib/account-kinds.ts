import type { Account } from "@/types";

/** Same kinds as the mobile app. */
export type AccountKind = "bank" | "debit_card" | "credit_card" | "wallet" | "cash";

/** Kind from account_kind when set, else derived from the legacy type. */
export function accountKindOf(account: Pick<Account, "type" | "accountKind">): AccountKind {
  const k = (account.accountKind ?? "").toLowerCase();
  if (k === "bank" || k === "debit_card" || k === "credit_card" || k === "wallet" || k === "cash") {
    return k;
  }
  const t = String(account.type ?? "").toLowerCase();
  if (t === "credit") return "credit_card";
  if (t === "wallet") return "wallet";
  if (t === "cash") return "cash";
  return "bank";
}

export function isCreditCard(account: Pick<Account, "type" | "accountKind">) {
  return accountKindOf(account) === "credit_card";
}

export const DEBIT_CARD_ID_PREFIX = "debit:";

/**
 * Debit cards: stored like the app, as last 4 digits on their bank account
 * (linked_card_last4). Returned as read-only virtual accounts.
 */
export function debitCardsOf(accounts: Account[]): Account[] {
  const out: Account[] = [];
  for (const bank of accounts) {
    if (accountKindOf(bank) !== "bank") continue;
    for (const raw of bank.linkedCardLast4 ?? []) {
      const last4 = String(raw).trim();
      if (!last4) continue;
      out.push({
        id: `${DEBIT_CARD_ID_PREFIX}${bank.id}:${last4}`,
        name: `${bank.name} Debit card`,
        type: "bank",
        accountKind: "debit_card",
        last4,
        linkedAccountId: bank.id,
        openingBalance: 0,
        isActive: true,
      });
    }
  }
  return out;
}

export function isDebitCardVirtual(account: Pick<Account, "id">) {
  return account.id.startsWith(DEBIT_CARD_ID_PREFIX);
}

/** One colour per account kind (account rows have no colour column). */
export function accountColor(account: Pick<Account, "type" | "accountKind"> | undefined) {
  if (!account) return "#94a3b8";
  switch (accountKindOf(account)) {
    case "credit_card":
      return "#e11d48";
    case "debit_card":
      return "#0ea5e9";
    case "wallet":
      return "#8b5cf6";
    case "cash":
      return "#10b981";
    default:
      return "#3b82f6";
  }
}

export function accountKindLabel(account: Pick<Account, "type" | "accountKind">) {
  switch (accountKindOf(account)) {
    case "credit_card":
      return "Credit card";
    case "debit_card":
      return "Debit card";
    case "wallet":
      return "Wallet";
    case "cash":
      return "Cash";
    default:
      return "Bank account";
  }
}
