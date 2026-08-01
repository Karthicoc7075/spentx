import type {
  AuditLog,
  AuditLogAction,
  BackupHistoryEntry,
  DefaultCategory,
  GlobalSettings,
  ShareAccessLog,
  Transaction,
  TransactionSplit,
} from "@/types";
import {
  fetchGlobalSettings,
  subscribeToGlobalSettings,
  updateDefaultCategories,
  bootstrapGlobalSettingsIfMissing,
} from "@/lib/supabase-data";

export type TransactionSplitInput = Omit<
  TransactionSplit,
  "id" | "userId" | "transactionId"
>;

export async function withAudit<T>(
  _tableName: string,
  _recordId: string,
  _action: AuditLogAction,
  _before: Record<string, unknown> | undefined,
  _after: Record<string, unknown> | undefined,
  writeFn: () => Promise<T>,
): Promise<T> {
  return writeFn();
}

export async function listAuditLogs(_userId?: string): Promise<AuditLog[]> {
  return [];
}

export function deriveSplitsFromTransaction(
  transaction: Pick<
    Transaction,
    "totalAmount" | "purposeId" | "category" | "contributorSource" | "outingId"
  >,
  explicitSplits?: TransactionSplitInput[],
): TransactionSplitInput[] {
  if (explicitSplits && explicitSplits.length > 0) return explicitSplits;
  return [
    {
      purposeId: transaction.purposeId,
      categoryId: transaction.category,
      contributorId: transaction.contributorSource,
      outingId: transaction.outingId ?? undefined,
      amount: transaction.totalAmount,
    },
  ];
}

export async function writeTransactionWithSplits(): Promise<void> {
  return;
}

export async function deleteTransactionSplits(): Promise<void> {
  return;
}

export async function fetchTransactionSplits(): Promise<TransactionSplit[]> {
  return [];
}

export function subscribeToTransactionSplits(
  _userId: string | undefined,
  onData: (splits: TransactionSplit[]) => void,
) {
  onData([]);
  return () => undefined;
}

export async function logShareAccess(
  _shareId: string,
  _ownerId: string,
  _purposeId: string,
  _token: string,
  _page: string,
): Promise<void> {
  return;
}

export async function listShareAccessLogs(_ownerId?: string): Promise<ShareAccessLog[]> {
  return [];
}

export async function createBackupHistoryEntry(
  userId: string,
  entry: Omit<BackupHistoryEntry, "id" | "userId" | "createdAt"> &
    Partial<Pick<BackupHistoryEntry, "createdAt">>,
): Promise<BackupHistoryEntry> {
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    ...entry,
  };
}

export async function listBackupHistory(_userId?: string): Promise<BackupHistoryEntry[]> {
  return [];
}

export {
  bootstrapGlobalSettingsIfMissing,
  fetchGlobalSettings,
  subscribeToGlobalSettings,
  updateDefaultCategories,
};

export type { DefaultCategory, GlobalSettings };