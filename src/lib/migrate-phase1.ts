import { deriveMonthKey } from "@/lib/firestore-schema";
import { mapEntrySourceFromStore } from "@/lib/firestore-helpers";
import { defaultPurposes } from "@/lib/mock-data";
import { resolvePurposeId } from "@/lib/purposes";
import type { Account, MonthlyPlan, Purpose, Transaction } from "@/types";

export function normalizeTransactionPurpose(
  transaction: Transaction,
  purposes: Purpose[] = defaultPurposes,
): Partial<Transaction> {
  const patch: Partial<Transaction> = {};
  const purpose = resolvePurposeId(transaction.purpose, purposes);
  if (purpose !== transaction.purpose) {
    patch.purpose = purpose;
  }

  if (!transaction.monthKey && transaction.date) {
    patch.monthKey = deriveMonthKey(transaction.date.slice(0, 10));
  }

  if (!transaction.entrySource) {
    patch.entrySource = mapEntrySourceFromStore(
      undefined,
      transaction.source,
      transaction.isAutoDetected,
    );
  }

  if (!transaction.status) {
    patch.status = "completed";
  }

  return patch;
}

export function normalizeAccountFields(account: Account): Partial<Account> {
  const patch: Partial<Account> = {};
  if (account.is_active === undefined) {
    patch.is_active = true;
  }
  if (account.openingBalance === undefined) {
    patch.openingBalance = 0;
  }
  if (!account.createdAt) {
    patch.createdAt = new Date().toISOString();
  }
  return patch;
}

export function normalizeMonthlyPlanPurpose(plan: MonthlyPlan): Partial<MonthlyPlan> {
  if (plan.purposeId) return {};
  return { purposeId: "personal" };
}

export function normalizePurposeDocument(purpose: Purpose): Purpose {
  const fallback = defaultPurposes.find((item) => item.id === purpose.id);
  return {
    ...purpose,
    color: purpose.color ?? fallback?.color ?? "#64748b",
    is_active: purpose.is_active ?? purpose.isActive ?? true,
    createdAt: purpose.createdAt ?? new Date().toISOString(),
  };
}