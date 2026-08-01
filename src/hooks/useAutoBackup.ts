"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { gatherAllUserData, uploadBackupToStorage } from "@/lib/supabase-data";

const LAST_BACKUP_KEY = "spentx-last-auto-backup";
const LAST_HASH_KEY = "spentx-last-auto-backup-hash";

// After a data change, wait for edits to settle before backing up, and never
// run more often than the throttle interval — a burst of edits produces one
// backup, not one per keystroke.
const CHANGE_DEBOUNCE_MS = 20_000;
const MIN_BACKUP_INTERVAL_MS = 90_000;

// The first segment of every user-data query key. A success on any of these
// means the user's financial data may have changed and is worth backing up.
const BACKED_UP_KEYS = new Set([
  "accounts",
  "categories",
  "purposes",
  "transactions",
  "investments",
  "monthlyPlan",
  "planTemplates",
  "incomeStreams",
  "incomeTargets",
  "savingsGoals",
  "reflections",
  "balanceSnapshots",
  "friends",
  "outings",
  "outingExpenses",
  "outingSettlements",
  "contributors",
]);

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
 * Automatic cloud backups. Two triggers:
 *  1. Weekly (spec A5.2) — a silent snapshot on Sundays / when 7+ days overdue.
 *  2. On change (debounced) — a snapshot a short while after any data edit
 *     settles, throttled and de-duplicated by content hash so it stays cheap.
 *
 * Both write to Supabase Storage (best-effort; needs bucket policies configured)
 * and update the "Last backup" readout shown in Settings. Mounted once,
 * app-wide, in AppDataProvider.
 */
export function useAutoBackup(userId?: string) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRunRef = useRef(0);

  // 1. Weekly auto-export.
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

  // 2. Backup shortly after any data change settles.
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    async function runBackup() {
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;

        const backup = await gatherAllUserData(userId as string);
        const signature = hashString(
          JSON.stringify({ ...backup, exportDate: "" }),
        );
        if (signature === window.localStorage.getItem(LAST_HASH_KEY)) {
          // Nothing actually changed since the last backup.
          lastRunRef.current = Date.now();
          return;
        }

        await uploadBackupToStorage(userId as string, backup);
        window.localStorage.setItem(LAST_HASH_KEY, signature);
        window.localStorage.setItem(LAST_BACKUP_KEY, backup.exportDate);
        lastRunRef.current = Date.now();
      } catch {
        // Best-effort — Storage rules may not be deployed yet.
      }
    }

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const sinceLast = Date.now() - lastRunRef.current;
      const wait = Math.max(
        CHANGE_DEBOUNCE_MS,
        MIN_BACKUP_INTERVAL_MS - sinceLast,
      );
      timerRef.current = setTimeout(() => {
        void runBackup();
      }, wait);
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type !== "success") return;
      const key = event.query.queryKey?.[0];
      if (typeof key !== "string" || !BACKED_UP_KEYS.has(key)) return;
      schedule();
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, queryClient]);
}
