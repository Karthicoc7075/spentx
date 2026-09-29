"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
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

export function RoleModeProvider({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useIsAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const [mode, setModeState] = useState<RoleViewMode>(() => {
    if (typeof window === "undefined") return "user";
    if (pathname.startsWith("/admin")) return "admin";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "admin" || saved === "user") return saved;
    } catch {
      /* ignore */
    }
    return "user";
  });

  // Keep mode in sync with route navigation:
  // If user navigates to /admin/*, mode automatically activates "admin".
  useEffect(() => {
    if (pathname.startsWith("/admin") && isAdmin) {
      setModeState("admin");
      try {
        localStorage.setItem(STORAGE_KEY, "admin");
      } catch {
        /* ignore */
      }
    }
  }, [pathname, isAdmin]);

  // If the account is NOT an admin, mode is locked to "user" (cannot be bypassed).
  const effectiveMode: RoleViewMode = isAdmin ? mode : "user";

  const setMode = useCallback(
    (nextMode: RoleViewMode) => {
      if (!isAdmin) return; // Security: normal users cannot switch mode

      setModeState(nextMode);
      try {
        localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        /* ignore */
      }

      if (nextMode === "admin") {
        if (!pathname.startsWith("/admin")) {
          router.push("/admin");
        }
      } else {
        if (pathname.startsWith("/admin")) {
          router.push("/");
        }
      }
    },
    [isAdmin, pathname, router],
  );

  const toggleMode = useCallback(() => {
    if (!isAdmin) return;
    const nextMode = effectiveMode === "admin" ? "user" : "admin";
    setMode(nextMode);
  }, [isAdmin, effectiveMode, setMode]);

  const value = useMemo<RoleModeContextValue>(
    () => ({
      mode: effectiveMode,
      isAdmin,
      isUserView: effectiveMode === "user",
      isAdminView: effectiveMode === "admin" && isAdmin,
      setMode,
      toggleMode,
    }),
    [effectiveMode, isAdmin, setMode, toggleMode],
  );

  return (
    <RoleModeContext.Provider value={value}>
      {children}
    </RoleModeContext.Provider>
  );
}

export function useRoleMode() {
  return useContext(RoleModeContext);
}
