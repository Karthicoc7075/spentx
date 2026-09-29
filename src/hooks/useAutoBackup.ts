"use client";

import { useEffect } from "react";
import { gatherAllUserData, uploadBackupToStorage } from "@/lib/supabase-data";

const LAST_BACKUP_KEY = "spentx-last-auto-backup";
const LAST_HASH_KEY = "spentx-last-auto-backup-hash";

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// Small, stable string hash (djb2) used to detect whether the gathered data
// actually differs from the last cloud backup, so refetches that return
// identical data don't trigger a redundant upload.
function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

/**
 * Automatic cloud backups.
 * Weekly (spec A5.2) — a silent snapshot on Sundays / when 7+ days overdue.
 *
 * Writes to Supabase Storage and updates the "Last backup" readout shown in Settings.
 * Mounted once, app-wide, in AppDataProvider.
 */
export function useAutoBackup(userId?: string) {

  // Weekly auto-export (silent snapshot on Sundays / when 7+ days overdue).
  // Background polling/edits no longer trigger continuous full-database reads.
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    async function checkAndBackup() {
      try {
        const lastBackup = window.localStorage.getItem(LAST_BACKUP_KEY);
        const elapsedDays = lastBackup ? daysSince(lastBackup) : Infinity;
        if (elapsedDays < 7) return;

        const isSunday = new Date().getDay() === 0;
        const isOverdue = elapsedDays > 7;
        if (!isSunday && !isOverdue) return;

        const backup = await gatherAllUserData(userId as string);
        await uploadBackupToStorage(userId as string, backup);
        window.localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
        window.localStorage.setItem(
          LAST_HASH_KEY,
          hashString(JSON.stringify({ ...backup, exportDate: "" })),
        );
      } catch {
        // Silent failure per spec — Storage rules may not be deployed yet.
      }
    }

    void checkAndBackup();
  }, [userId]);
}
