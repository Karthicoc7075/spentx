"use client";

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  auth,
  ensureUserWorkspace,
  fetchUserProfile,
  isFirebaseConfigured,
  setProfileSavedListener,
} from "@/lib/firebase";
import type { User } from "@/types";

type FirebaseContextValue = {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isConfigured: boolean;
  isLoading: boolean;
};

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  firebaseUser: null,
  isConfigured: false,
  isLoading: false,
});

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem("spentx_cached_user");
    if (!saved) return null;
    return JSON.parse(saved) as User;
  } catch {
    return null;
  }
}

function persistCachedUser(user: User | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    localStorage.removeItem("spentx_cached_user");
    localStorage.setItem("spentx_has_session", "false");
    return;
  }

  localStorage.setItem("spentx_cached_user", JSON.stringify(user));
  localStorage.setItem("spentx_has_session", "true");
}

function buildUserFromFirebase(
  firebaseUser: FirebaseUser,
  profileName?: string | null,
): User {
  return {
    id: firebaseUser.uid,
    name: profileName ?? firebaseUser.displayName ?? "SpentX User",
    email: firebaseUser.email ?? "",
    photoUrl: firebaseUser.photoURL ?? undefined,
  };
}

function readHasSessionFlag() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("spentx_has_session") === "true";
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [cachedUser, setCachedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => isFirebaseConfigured);

  useLayoutEffect(() => {
    const cached = readCachedUser();
    const hasSession = readHasSessionFlag();

    if (cached) {
      setCachedUser(cached);
      setProfileName(cached.name);
      setIsLoading(false);
      return;
    }

    if (!hasSession) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function syncProfileName(userId: string) {
      if (!auth) return;

      const current = auth.currentUser;
      if (!current || current.uid !== userId) return;

      try {
        await current.reload();
      } catch {
        // Best effort only — don't block the app on profile refresh.
      }

      setFirebaseUser(auth.currentUser);

      const profile = await fetchUserProfile(userId).catch(() => null);
      const name = profile?.name ?? auth.currentUser?.displayName ?? "SpentX User";
      setProfileName(name);

      if (auth.currentUser) {
        const userObj = buildUserFromFirebase(auth.currentUser, name);
        setCachedUser(userObj);
        persistCachedUser(userObj);
      }
    }

    setProfileSavedListener((userId) => {
      void syncProfileName(userId);
    });

    return () => setProfileSavedListener(null);
  }, []);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    function applyFirebaseUser(nextUser: FirebaseUser | null) {
      if (cancelled) return;

      // Anonymous sessions exist only for no-login /share links; the main
      // app treats them as signed out (no workspace, no cached user).
      if (nextUser?.isAnonymous) {
        nextUser = null;
      }

      setFirebaseUser(nextUser);
      setIsLoading(false);

      if (!nextUser) {
        setProfileName(null);
        setCachedUser(null);
        persistCachedUser(null);
        return;
      }

      const name = nextUser.displayName ?? profileName ?? "SpentX User";
      setProfileName(name);

      const initialUserObj = buildUserFromFirebase(nextUser, name);
      setCachedUser(initialUserObj);
      persistCachedUser(initialUserObj);

      void (async () => {
        const workspace = await ensureUserWorkspace(nextUser.uid, {
          name,
          email: nextUser.email ?? "",
          photoURL: nextUser.photoURL ?? undefined,
        }).catch(() => null);

        const profile =
          workspace?.profile ??
          (await fetchUserProfile(nextUser.uid).catch(() => null));
        const updatedName = profile?.name ?? nextUser.displayName ?? "SpentX User";
        if (cancelled) return;

        setProfileName(updatedName);
        const userObj = buildUserFromFirebase(nextUser, updatedName);
        setCachedUser(userObj);
        persistCachedUser(userObj);
      })();
    }

    const unsubscribe = onAuthStateChanged(auth, applyFirebaseUser);

    void (async () => {
      try {
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 1200);
          }),
        ]);
      } catch {
        // Continue with whatever auth state is available.
      }

      if (cancelled) return;

      if (auth.currentUser) {
        applyFirebaseUser(auth.currentUser);
      } else {
        setIsLoading(false);
      }
    })();

    const hardTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
      unsubscribe();
    };
  }, []);

  const value = useMemo<FirebaseContextValue>(() => {
    const user = firebaseUser
      ? buildUserFromFirebase(firebaseUser, profileName)
      : cachedUser;

    return {
      user,
      firebaseUser,
      isConfigured: isFirebaseConfigured,
      isLoading,
    };
  }, [firebaseUser, isLoading, profileName, cachedUser]);

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}