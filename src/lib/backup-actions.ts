import {
  buildBackupZipBytes,
  gatherAllUserData,
  uploadBackupToStorage,
} from "@/lib/supabase-data";

const LAST_BACKUP_STORAGE_KEY = "spentx-last-auto-backup";

function downloadBackupZip(exportDate: string, bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spentx-backup-${exportDate.slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Same account-wide backup Settings > Data & Backups runs — one JSON per
 * table + manifest, downloaded locally and best-effort uploaded to Storage.
 * Shared so every "Backup" entry point (Settings, Outing Detail, ...) stays
 * in sync on a single source of truth for "last backed up". */
export async function runAccountBackup(userId: string): Promise<string> {
  const backup = await gatherAllUserData(userId);
  const bytes = buildBackupZipBytes(backup);
  downloadBackupZip(backup.exportDate, bytes);
  try {
    await uploadBackupToStorage(userId, backup);
  } catch {
    // Cloud upload is best-effort — the local download already succeeded.
  }
  window.localStorage.setItem(LAST_BACKUP_STORAGE_KEY, backup.exportDate);
  return backup.exportDate;
}

export function getLastBackupAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
}
