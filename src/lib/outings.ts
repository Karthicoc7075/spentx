import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { OUTING_ANALYTICS_TAG, resolveOutingCategoryLabel } from "@/lib/analytics-filters";
import type {
  ExpenseSplit,
  Outing,
  OutingExpense,
  OutingSettlement,
  SplitType,
  Transaction,
  TripMember,
  TripSummary,
} from "@/types";

export function buildEqualSplits(
  amount: number,
  memberIds: string[],
): ExpenseSplit[] {
  if (!memberIds.length) return [];
  const share = Math.round(amount / memberIds.length);
  const remainder = amount - share * memberIds.length;

  return memberIds.map((memberId, index) => ({
    memberId,
    amount: share + (index === 0 ? remainder : 0),
  }));
}

export function buildSoloSplit(
  amount: number,
  memberId: string,
): ExpenseSplit[] {
  return [{ memberId, amount }];
}

export function buildExpenseSplits(
  amount: number,
  splitType: SplitType,
  members: TripMember[],
  paidByMemberId: string,
  participantIds: string[],
  customSplits?: ExpenseSplit[],
) {
  if (splitType === "solo") {
    return buildSoloSplit(amount, paidByMemberId);
  }
  if (splitType === "custom" && customSplits?.length) {
    return customSplits;
  }
  const ids =
    participantIds.length > 0
      ? participantIds
      : members.map((member) => member.id);
  return buildEqualSplits(amount, ids);
}

export function computeMemberBalances(
  members: TripMember[],
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
) {
  const balances = new Map(members.map((member) => [member.id, 0]));

  for (const expense of expenses) {
    balances.set(
      expense.paidByMemberId,
      (balances.get(expense.paidByMemberId) ?? 0) + expense.amount,
    );
    for (const split of expense.splits) {
      balances.set(
        split.memberId,
        (balances.get(split.memberId) ?? 0) - split.amount,
      );
    }
  }

  for (const settlement of settlements) {
    balances.set(
      settlement.fromMemberId,
      (balances.get(settlement.fromMemberId) ?? 0) + settlement.amount,
    );
    balances.set(
      settlement.toMemberId,
      (balances.get(settlement.toMemberId) ?? 0) - settlement.amount,
    );
  }

  return members.map((member) => ({
    member,
    balance: balances.get(member.id) ?? 0,
  }));
}

export function getCurrentUserMember(members: TripMember[]) {
  return members.find((member) => member.isCurrentUser) ?? members[0];
}

export function computeTripSummary(
  outing: Outing,
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
): TripSummary {
  const currentMember = getCurrentUserMember(outing.members);
  const totalSpent = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  const yourShare = expenses.reduce((sum, expense) => {
    const split = expense.splits.find(
      (item) => item.memberId === currentMember?.id,
    );
    return sum + (split?.amount ?? 0);
  }, 0);

  const balances = computeMemberBalances(
    outing.members,
    expenses,
    settlements,
  );
  const currentBalance =
    balances.find((item) => item.member.id === currentMember?.id)?.balance ?? 0;
  const pendingSettlements = Math.max(0, -currentBalance);

  return { totalSpent, yourShare, pendingSettlements };
}

export function computeSpendingByCategory(expenses: OutingExpense[]) {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(
      expense.category,
      (totals.get(expense.category) ?? 0) + expense.amount,
    );
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeSpendingByMember(
  outing: Outing,
  expenses: OutingExpense[],
) {
  const totals = new Map(outing.members.map((member) => [member.id, 0]));

  for (const expense of expenses) {
    for (const split of expense.splits) {
      totals.set(
        split.memberId,
        (totals.get(split.memberId) ?? 0) + split.amount,
      );
    }
  }

  return outing.members
    .map((member) => ({
      member,
      amount: totals.get(member.id) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type DebtEdge = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

export function simplifyDebts(
  balances: Array<{ member: TripMember; balance: number }>,
): DebtEdge[] {
  const creditors: { id: string; name: string; amount: number }[] = [];
  const debtors: { id: string; name: string; amount: number }[] = [];

  for (const item of balances) {
    if (item.balance > 0.01) {
      creditors.push({
        id: item.member.id,
        name: item.member.name,
        amount: item.balance,
      });
    } else if (item.balance < -0.01) {
      debtors.push({
        id: item.member.id,
        name: item.member.name,
        amount: -item.balance,
      });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const edges: DebtEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settle = Math.min(creditors[i].amount, debtors[j].amount);
    if (settle > 0.01) {
      edges.push({
        fromId: debtors[j].id,
        fromName: debtors[j].name,
        toId: creditors[i].id,
        toName: creditors[i].name,
        amount: Math.round(settle * 100) / 100,
      });
    }
    creditors[i].amount -= settle;
    debtors[j].amount -= settle;
    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  return edges;
}

export function getMemberPaidAndShare(
  memberId: string,
  expenses: OutingExpense[],
) {
  const paid = expenses
    .filter((expense) => expense.paidByMemberId === memberId)
    .reduce((sum, expense) => sum + expense.amount, 0);

  const share = expenses.reduce((sum, expense) => {
    const split = expense.splits.find((item) => item.memberId === memberId);
    return sum + (split?.amount ?? 0);
  }, 0);

  return { paid, share };
}

export type MemberNetBalance = {
  key: string;
  name: string;
  balance: number;
};

/** Aggregates every outing's own per-trip balances (computeMemberBalances,
 * scoped to that outing's own member/expense/settlement ids) into a single
 * net owed/owing figure per person across all outings — the same
 * computation FriendsPage already uses for one friend at a time, generalized
 * across every member so a chart can show "who owes whom" globally. */
export function computeNetBalancesByMember(
  outings: Outing[],
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
): MemberNetBalance[] {
  const totals = new Map<string, MemberNetBalance>();

  for (const outing of outings) {
    const outingExpenses = expenses.filter((item) => item.outingId === outing.id);
    const outingSettlements = settlements.filter((item) => item.outingId === outing.id);
    const balances = computeMemberBalances(outing.members, outingExpenses, outingSettlements);

    for (const { member, balance } of balances) {
      // Framed relative to "you" — your own balance against yourself isn't
      // a meaningful bar in a "who owes whom" chart.
      if (member.isCurrentUser) continue;
      const key = member.friendId ?? member.id;
      const existing = totals.get(key);
      if (existing) {
        existing.balance += balance;
      } else {
        totals.set(key, { key, name: member.name, balance });
      }
    }
  }

  return [...totals.values()].filter((item) => Math.abs(item.balance) >= 1);
}

export function getPendingSettlements(
  members: TripMember[],
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
) {
  return computeMemberBalances(members, expenses, settlements).filter(
    (item) => Math.abs(item.balance) >= 1,
  );
}

/** Tag on the single personal-ledger row that represents an outing total. */
export const OUTING_ROLLUP_TAG = "outing-rollup";

/** Note prefix written by [buildOutingRollupDraft] — used when tags are missing. */
export const OUTING_ROLLUP_NOTE_PREFIX = "Outing total";

export function isOutingRollupTransaction(
  transaction: Transaction,
  outingId?: string,
) {
  if (transaction.type !== "expense") return false;
  if (transaction.category === "Settlements") return false;
  if (transaction.category === "Transfer") return false;
  if (outingId && transaction.outingId !== outingId) return false;
  // Rollups are always outing-linked.
  if (!transaction.outingId) return false;

  const tags = transaction.tags ?? [];
  if (tags.includes(OUTING_ROLLUP_TAG)) return true;

  const note = (transaction.note ?? "").trim();
  const description = (transaction.description ?? "").trim();

  // Explicit rollup copy only — do NOT treat note===merchant as rollup
  // (that hid normal spends whose note happened to match the title).
  if (note.toLowerCase().startsWith(OUTING_ROLLUP_NOTE_PREFIX.toLowerCase())) {
    return true;
  }
  if (
    description.toLowerCase().startsWith(OUTING_ROLLUP_NOTE_PREFIX.toLowerCase())
  ) {
    return true;
  }
  // Mobile stamp when creating rollups
  if ((transaction.time ?? "").trim().toLowerCase() === "trip total") {
    return true;
  }

  return false;
}

export function findOutingRollupTransaction(
  transactions: Transaction[],
  outingId: string,
) {
  return (
    transactions.find((transaction) =>
      isOutingRollupTransaction(transaction, outingId),
    ) ?? null
  );
}

export function hasOutingRollupTransaction(
  transactions: Transaction[],
  outingId: string,
) {
  return Boolean(findOutingRollupTransaction(transactions, outingId));
}

/**
 * Canonical outing spend total (web + mobile must match).
 *
 * Count each rupee once:
 *  1. Every outing_expenses row (manual cash + bank-linked trip costs)
 *  2. PLUS ledger expenses tagged to this outing that are NOT already
 *     represented by an expense.linkedTransactionId and are NOT the
 *     display-only "Outing total" rollup row
 *
 * Never sum rollup + expenses (that was showing 2000 → 3000/4000).
 */
export function computeOutingRollupAmount(
  expenses: OutingExpense[],
  _currentMemberId?: string | undefined,
  ledgerTransactions: Transaction[] = [],
  outingId?: string,
) {
  const fromExpenses = expenses.reduce(
    (sum, expense) => sum + (Number(expense.amount) || 0),
    0,
  );

  if (!outingId || ledgerTransactions.length === 0) {
    return fromExpenses;
  }

  // Ledger rows already counted via linked_transaction_id on an outing expense
  // must not be double-added into the display total.
  const fromLedger = unlinkedOutingLedgerRows(
    expenses,
    ledgerTransactions,
    outingId,
  ).reduce((sum, tx) => sum + (Number(tx.totalAmount ?? tx.amount ?? 0) || 0), 0);

  return fromExpenses + fromLedger;
}

/**
 * Ledger rows tagged to this outing that no outing_expenses row already
 * represents — the user's own spends that never became a trip expense.
 * Shared by the trip total and the user-paid total so both count each
 * rupee exactly once.
 */
function unlinkedOutingLedgerRows(
  expenses: OutingExpense[],
  ledgerTransactions: Transaction[],
  outingId: string,
) {
  const linkedLedgerIds = new Set(
    expenses
      .map((e) => e.linkedTransactionId)
      .filter((id): id is string => Boolean(id)),
  );

  return ledgerTransactions.filter((tx) => {
    if (tx.outingId !== outingId) return false;
    if (tx.type !== "expense") return false;
    // Display-only trip total line — never part of the total it represents.
    if (isOutingRollupTransaction(tx, outingId)) return false;
    return !linkedLedgerIds.has(tx.id);
  });
}

/**
 * What the CURRENT USER actually paid out of pocket for this outing — the
 * amount the Transactions-page rollup row shows, so the personal ledger
 * never counts a friend's payment as your spend.
 *
 * Counts:
 *  1. outing_expenses this user is the payer of
 *  2. PLUS outing-tagged ledger rows with no linked expense (those came off
 *     this user's own account by definition)
 *
 * Contrast with [computeOutingRollupAmount], which is the WHOLE trip total
 * (all members) and remains what `outings.total_spent` stores.
 */
export function computeOutingUserPaidAmount(
  outing: Outing,
  expenses: OutingExpense[],
  ledgerTransactions: Transaction[] = [],
  outingId?: string,
) {
  const currentMember = getCurrentUserMember(outing.members);
  const fromExpenses = expenses.reduce((sum, expense) => {
    if (!currentMember || expense.paidByMemberId !== currentMember.id) return sum;
    return sum + (Number(expense.amount) || 0);
  }, 0);

  const id = outingId ?? outing.id;
  if (!id || ledgerTransactions.length === 0) return fromExpenses;

  const fromLedger = unlinkedOutingLedgerRows(
    expenses,
    ledgerTransactions,
    id,
  ).reduce((sum, tx) => sum + (Number(tx.totalAmount ?? tx.amount ?? 0) || 0), 0);

  return fromExpenses + fromLedger;
}

/**
 * Distinct account names behind the current user's payments on this outing —
 * drives the "Mixed" account label on the rollup row when more than one
 * account was used.
 */
export function computeOutingUserAccountNames(
  outing: Outing,
  expenses: OutingExpense[],
  ledgerTransactions: Transaction[] = [],
  outingId?: string,
) {
  const currentMember = getCurrentUserMember(outing.members);
  const names = new Set<string>();

  for (const expense of expenses) {
    if (!currentMember || expense.paidByMemberId !== currentMember.id) continue;
    const name = (expense.accountName || "").trim();
    if (name) names.add(name);
  }

  const id = outingId ?? outing.id;
  if (id && ledgerTransactions.length > 0) {
    for (const tx of unlinkedOutingLedgerRows(expenses, ledgerTransactions, id)) {
      const name = (tx.accountName || tx.account || "").trim();
      if (name) names.add(name);
    }
  }

  return [...names];
}

/** All rollup rows for an outing (should be at most one). */
export function findAllOutingRollupTransactions(
  transactions: Transaction[],
  outingId: string,
) {
  return transactions.filter((transaction) =>
    isOutingRollupTransaction(transaction, outingId),
  );
}

export function buildOutingRollupDraft(
  outing: Outing,
  totalSpent: number,
  defaultAccount: string,
  defaultCategory = "",
  /** Prefer latest expense date so the row appears in the right month filter. */
  asOfDate?: string,
): Omit<Transaction, "id"> {
  const dateRaw =
    asOfDate ||
    outing.endDate ||
    outing.startDate ||
    new Date().toISOString();
  const dateIso = dateRaw.includes("T")
    ? dateRaw
    : new Date(`${dateRaw.slice(0, 10)}T12:00:00`).toISOString();

  return {
    type: "expense",
    amount: totalSpent,
    totalAmount: totalSpent,
    merchant: outing.name,
    // The rollup represents the whole trip, so it carries the outing's own
    // category (not whichever category the first expense happened to use).
    category: outing.category || defaultCategory || "Travel",
    account: defaultAccount,
    purpose: outing.purposeId || PERSONAL_PURPOSE_ID,
    purposeId: outing.purposeId || PERSONAL_PURPOSE_ID,
    source: "manual",
    entrySource: "manual",
    date: dateIso,
    transactionDate: dateIso,
    // Keep tag + note prefix so rollup stays detectable even if tags drop in transit.
    note: `${OUTING_ROLLUP_NOTE_PREFIX} · ${outing.name}`,
    description: `${OUTING_ROLLUP_NOTE_PREFIX} · ${outing.name}`,
    paymentMethod: "UPI",
    status: "completed",
    outingId: outing.id,
    tags: [OUTING_ROLLUP_TAG],
  };
}

/**
 * True for a real outing-linked ledger row that should be hidden on the
 * Transactions list because a display rollup already represents that trip.
 *
 * Pass the full ledger so we only hide individuals when a rollup exists —
 * otherwise outing spends would vanish from the list entirely.
 */
export function isIndividualOutingLedgerTransaction(
  transaction: Transaction,
  allTransactions: Transaction[] = [],
) {
  if (!transaction.outingId) return false;
  if (isOutingRollupTransaction(transaction)) return false;
  // No rollup for this outing yet → keep the individual row visible.
  if (!allTransactions.length) return true;
  return allTransactions.some((t) =>
    isOutingRollupTransaction(t, transaction.outingId!),
  );
}

/**
 * Transactions list view model:
 *  - every normal (non-outing) transaction
 *  - outing-linked individuals only when that outing has no rollup
 *  - exactly one rollup line per outing with LIVE totals from expenses
 *  - never hide the rest of the ledger down to a single row by mistake
 *
 * Pass `expenses` so the rollup amount always matches outing detail
 * (e.g. "test" ₹8,788) even when the stored rollup row is still stuck
 * on the first expense amount (₹1,000).
 *
 * Pass `outings` to additionally overlay the display-only fields that must
 * not be persisted on the ledger row: the amount narrowed to what the
 * current user actually paid, the outing's own category, and an account
 * label of "Mixed" when the user paid from more than one account. Omit it
 * and the rows keep their stored values (Dashboard uses this shape).
 */
export function buildTransactionsListRows(
  ledgerTransactions: Transaction[],
  expenses: OutingExpense[] = [],
  outings: Outing[] = [],
): Transaction[] {
  const outingById = new Map(outings.map((outing) => [outing.id, outing]));
  const hasRollupFor = new Set(
    ledgerTransactions
      .filter((t) => isOutingRollupTransaction(t))
      .map((t) => t.outingId)
      .filter((id): id is string => Boolean(id)),
  );

  const bestRollupByOuting = new Map<string, Transaction>();
  const rows: Transaction[] = [];

  for (const transaction of ledgerTransactions) {
    if (isOutingRollupTransaction(transaction) && transaction.outingId) {
      const prev = bestRollupByOuting.get(transaction.outingId);
      const amount = Number(transaction.totalAmount ?? transaction.amount ?? 0);
      const prevAmount = Number(prev?.totalAmount ?? prev?.amount ?? 0);
      if (!prev || amount >= prevAmount) {
        bestRollupByOuting.set(transaction.outingId, transaction);
      }
      continue;
    }

    // Hide individual outing spends in transaction lists
    if (transaction.outingId && !isOutingRollupTransaction(transaction)) {
      continue;
    }

    rows.push(transaction);
  }

  // Synthesize rollups for active outings that don't have a DB rollup row yet
  for (const outing of outings) {
    if (bestRollupByOuting.has(outing.id)) continue;
    const outingExpenses = expenses.filter((e) => e.outingId === outing.id);
    if (!outingExpenses.length) continue;

    const userPaid = computeOutingUserPaidAmount(
      outing,
      outingExpenses,
      ledgerTransactions,
      outing.id,
    );
    const amount = userPaid > 0 ? userPaid : computeOutingRollupAmount(outingExpenses, undefined, ledgerTransactions, outing.id);
    if (amount <= 0) continue;

    const category = resolveOutingCategoryLabel(outing.category, outing.name);
    const dateRaw =
      latestOutingExpenseDate(outingExpenses) ||
      outing.endDate ||
      outing.startDate ||
      new Date().toISOString();
    const dateIso = dateRaw.includes("T")
      ? dateRaw
      : new Date(`${dateRaw.slice(0, 10)}T12:00:00`).toISOString();

    const accountNames = computeOutingUserAccountNames(
      outing,
      outingExpenses,
      ledgerTransactions,
      outing.id,
    );
    const accountLabel = accountNames.length > 1 ? "Mixed" : accountNames[0] || "Cash";

    bestRollupByOuting.set(outing.id, {
      id: `outing-rollup:${outing.id}`,
      type: "expense",
      amount,
      totalAmount: amount,
      merchant: outing.name || category,
      category,
      account: accountLabel,
      accountName: accountLabel,
      rollupAccountNames: accountNames,
      outingExpenseTitles: outingExpenses.map((e) => e.description).filter(Boolean),
      purpose: PERSONAL_PURPOSE_ID,
      purposeId: PERSONAL_PURPOSE_ID,
      source: "manual",
      entrySource: "manual",
      date: dateIso,
      transactionDate: dateIso,
      note: `Outing · ${category}`,
      description: `Outing · ${category}`,
      paymentMethod: "UPI",
      status: "completed",
      outingId: outing.id,
      tags: [OUTING_ANALYTICS_TAG],
    });
  }

  const withLiveTotals = [...bestRollupByOuting.values()].map((rollup) => {
    const outingId = rollup.outingId;
    if (!outingId) return rollup;

    const outingExpenses = expenses.filter((e) => e.outingId === outingId);
    const outing = outingById.get(outingId);

    const liveAmount = outing
      ? computeOutingUserPaidAmount(
          outing,
          outingExpenses,
          ledgerTransactions,
          outingId,
        )
      : computeOutingRollupAmount(
          outingExpenses,
          undefined,
          ledgerTransactions,
          outingId,
        );

    if (liveAmount <= 0) return rollup;

    const next: Transaction = { ...rollup };
    next.amount = liveAmount;
    next.totalAmount = liveAmount;
    next.outingExpenseTitles = outingExpenses.map((e) => e.description).filter(Boolean);

    if (outing) {
      const category = resolveOutingCategoryLabel(outing.category, outing.name);
      next.category = category;
      next.merchant = outing.name || category;

      const accountNames = computeOutingUserAccountNames(
        outing,
        outingExpenses,
        ledgerTransactions,
        outingId,
      );
      if (accountNames.length > 0) {
        const label = accountNames.length > 1 ? "Mixed" : accountNames[0];
        next.accountName = label;
        next.account = label;
        next.rollupAccountNames = accountNames;
      }
    }

    return next;
  });

  return [...rows, ...withLiveTotals];
}

export function latestOutingExpenseDate(expenses: OutingExpense[]) {
  if (expenses.length === 0) return undefined;
  return expenses
    .map((expense) => expense.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}