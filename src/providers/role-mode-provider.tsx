"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export type RoleViewMode = "user" | "admin";

type RoleModeContextValue = {
  mode: RoleViewMode;
  isAdmin: boolean;
  isUserView: boolean;
  isAdminView: boolean;
  setMode: (nextMode: RoleViewMode) => void;
  toggleMode: () => void;
};

const RoleModeContext = createContext<RoleModeContextValue>({
  mode: "user",
  isAdmin: false,
  isUserView: true,
  isAdminView: false,
  setMode: () => {},
  toggleMode: () => {},
});

const STORAGE_KEY = "spentx_role_view_mode";
const listeners = new Set<() => void>();

function readStoredMode(): RoleViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "admin" ? "admin" : "user";
  } catch {
    return "user";
  }
}

function writeStoredMode(mode: RoleViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * View mode (user vs admin UI) for admin accounts. Purely presentational:
 * admin access itself is enforced server-side (/admin layout + RPC guards).
 * The stored preference is read through useSyncExternalStore with a "user"
 * server snapshot, so SSR and the first client render always agree (no
 * hydration mismatch); /admin/* routes are always admin mode.
 */
export function RoleModeProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useIsAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const storedMode = useSyncExternalStore(subscribe, readStoredMode, () => "user" as RoleViewMode);
  const onAdminRoute = pathname.startsWith("/admin");
  const mode: RoleViewMode = !isAdmin ? "user" : onAdminRoute ? "admin" : storedMode;

  const setMode = useCallback(
    (nextMode: RoleViewMode) => {
      if (!isAdmin) return;
      writeStoredMode(nextMode);
      if (nextMode === "admin" && !pathname.startsWith("/admin")) router.push("/admin");
      if (nextMode === "user" && pathname.startsWith("/admin")) router.push("/");
    },
    [isAdmin, pathname, router],
  );

  const toggleMode = useCallback(() => {
    if (!isAdmin) return;
    setMode(mode === "admin" ? "user" : "admin");
  }, [isAdmin, mode, setMode]);

  const value = useMemo<RoleModeContextValue>(
    () => ({
      mode,
      isAdmin,
      isUserView: mode === "user",
      isAdminView: mode === "admin" && isAdmin,
      setMode,
      toggleMode,
    }),
    [mode, isAdmin, setMode, toggleMode],
  );

  return <RoleModeContext.Provider value={value}>{children}</RoleModeContext.Provider>;
}

export function useRoleMode() {
  return useContext(RoleModeContext);
}
