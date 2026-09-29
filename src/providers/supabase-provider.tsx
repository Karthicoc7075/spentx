"use client";

import {
  isAuthApiError,
  isAuthSessionMissingError,
  type User as SupabaseUser,
} from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ensureUserWorkspace,
  fetchUserProfile,
  isSupabaseConfigured,
  setProfileSavedListener,
  subscribeToUserRevoked,
} from "@/lib/supabase-data";
import type { User } from "@/types";

type AuthContextValue = {
  user: User | null;
  authUser: SupabaseUser | null;
  isConfigured: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authUser: null,
  isConfigured: false,
  isLoading: false,
});

// Only these say "this account/session no longer exists". Everything else an
// auth call can return — a 401 from an access token that expired while a
// refresh was already in flight, a 4xx bubbled up through /api/proxy, a
// rotated-token blip — is transient and must never end a 1-year session.
const REVOKED_ERROR_CODES = new Set([
  "user_not_found",
  "session_not_found",
  "refresh_token_not_found",
  "session_expired",
  "user_banned",
]);

function isRevocationError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthApiError(error)) return false;
  return REVOKED_ERROR_CODES.has(error.code ?? "");
}

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

function buildUserFromSupabase(
  supabaseUser: SupabaseUser,
  profileName?: string | null,
  profileJoinedAt?: string | null,
  profilePhotoUrl?: string | null,
): User {
  return {
    id: supabaseUser.id,
    name:
      profileName ??
      (supabaseUser.user_metadata?.name as string | undefined) ??
      "SpentX User",
    email: supabaseUser.email ?? "",
    photoUrl:
      profilePhotoUrl ??
      (supabaseUser.user_metadata?.avatar_url as string | undefined) ??
      undefined,
    createdAt:
      profileJoinedAt ??
      supabaseUser.created_at ??
      undefined,
  };
}

function readHasSessionFlag() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("spentx_has_session") === "true";
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [cachedUser, setCachedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => isSupabaseConfigured);

  useLayoutEffect(() => {
    const cached = readCachedUser();
    const hasSession = readHasSessionFlag();

    if (cached) {
      setCachedUser(cached);
      setProfileName(cached.name);
      if (cached.photoUrl) setProfilePhotoUrl(cached.photoUrl);
      setIsLoading(false);
      return;
    }

    if (!hasSession) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function syncProfileName(userId: string) {
      const profile = await fetchUserProfile(userId).catch(() => null);
      const name = profile?.name ?? "SpentX User";
      setProfileName(name);
      setProfilePhotoUrl(profile?.photoURL ?? null);

      setSupabaseUser((current) => {
        if (!current || current.id !== userId) return current;
        const userObj = buildUserFromSupabase(
          current,
          name,
          profile?.joinedAt,
          profile?.photoURL,
        );
        setCachedUser(userObj);
        persistCachedUser(userObj);
        return current;
      });
    }

    setProfileSavedListener((userId) => {
      void syncProfileName(userId);
    });

    return () => setProfileSavedListener(null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // Registered before createClient() so a synchronous throw there (e.g. a
    // malformed Supabase URL/key) can't strand the user on "Checking your
    // session..." forever — this timeout is the only thing that would have
    // caught it, and it must exist regardless of what happens below.
    const hardTimeout = window.setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 2500);

    // Dedupes getUser() + onAuthStateChange(INITIAL_SESSION) which both fire
    // with the same user on every full page load.
    let lastAppliedUserId: string | null | undefined;
    let workspacePromise: Promise<void> | null = null;

    async function applySupabaseUser(
      nextUser: SupabaseUser | null,
      options?: { forceWorkspace?: boolean },
    ) {
      if (cancelled) return;

      const nextId = nextUser?.id ?? null;
      const sameUser = lastAppliedUserId === nextId && nextId !== undefined;
      lastAppliedUserId = nextId;

      setSupabaseUser(nextUser);
      setIsLoading(false);

      if (!nextUser) {
        setProfileName(null);
        setCachedUser(null);
        persistCachedUser(null);
        workspacePromise = null;
        return;
      }

      const initialName =
        (nextUser.user_metadata?.name as string | undefined) ??
        profileName ??
        "SpentX User";
      setProfileName(initialName);

      const initialUserObj = buildUserFromSupabase(nextUser, initialName);
      setCachedUser(initialUserObj);
      persistCachedUser(initialUserObj);

      // Skip a second workspace ensure when auth emits twice for the same user.
      if (sameUser && !options?.forceWorkspace && workspacePromise) {
        await workspacePromise;
        return;
      }

      workspacePromise = (async () => {
        const workspace = await ensureUserWorkspace(nextUser.id, {
          name: initialName,
          email: nextUser.email ?? "",
          photoURL:
            (nextUser.user_metadata?.avatar_url as string | undefined) ??
            undefined,
        }).catch((error) => {
          console.error(
            `[AuthProvider] ensureUserWorkspace threw for uid=${nextUser.id}`,
            error,
          );
          return null;
        });

        const profile =
          workspace?.profile ??
          (await fetchUserProfile(nextUser.id).catch(() => null));
        const updatedName =
          profile?.name ??
          (nextUser.user_metadata?.name as string | undefined) ??
          "SpentX User";
        if (cancelled) return;

        setProfileName(updatedName);
        setProfilePhotoUrl(profile?.photoURL ?? null);
        const userObj = buildUserFromSupabase(
          nextUser,
          updatedName,
          profile?.joinedAt,
          profile?.photoURL,
        );
        setCachedUser(userObj);
        persistCachedUser(userObj);
      })();

      await workspacePromise;
    }

    try {
      const supabase = createClient();

      void supabase.auth
        .getUser()
        .then(({ data }) => applySupabaseUser(data.user ?? null))
        .catch(() => setIsLoading(false));

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        // Token refresh is not a new login — don't re-run workspace setup.
        if (event === "TOKEN_REFRESHED") return;
        void applySupabaseUser(session?.user ?? null, {
          forceWorkspace: event === "SIGNED_IN",
        });
      });

      return () => {
        cancelled = true;
        clearTimeout(hardTimeout);
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("[AuthProvider] Failed to initialize Supabase client", error);
      setIsLoading(false);
      return () => {
        cancelled = true;
        clearTimeout(hardTimeout);
      };
    }
  }, []);

  // Forced logout when an admin deletes this account. Two layers, both
  // active whenever a session exists:
  //  1. Realtime broadcast on this user's own status channel — the admin
  //     delete route sends this the instant the delete succeeds, so an
  //     already-open tab signs itself out immediately rather than waiting
  //     for its JWT to expire or for the next getUser() poll.
  //  2. A periodic getUser() revalidation (and one on window focus) as the
  //     fallback for the rare case the broadcast is missed — e.g. the tab's
  //     websocket was reconnecting at the exact moment of deletion. Neither
  //     layer replaces the other; the broadcast is the fast path, the poll
  //     is the safety net under it.
  //
  // Only an error that names the account or session as gone counts as
  // revocation (see isRevocationError), mirroring the mobile client's
  // AuthService.verifyAccountStillExists() — and even then only when a
  // confirming re-check agrees. Everything else — a network blip, the dev
  // server recompiling the proxy route mid-request, a transient 5xx, a 401
  // from an access token that expired while its refresh was still in
  // flight — must NOT sign the user out; the next poll or focus check will
  // simply try again. This poll is the safety net under the broadcast, not
  // a session timer: a signed-in user stays signed in until they log out.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseUser?.id) return;

    let cancelled = false;
    let revokedStrikes = 0;
    let confirmTimer: number | undefined;
    let lastCheckAt = 0;
    const supabase = createClient();

    async function forceSignOutIfRevoked() {
      if (cancelled) return;
      lastCheckAt = Date.now();
      const { error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!isRevocationError(error)) {
        revokedStrikes = 0;
        return;
      }

      revokedStrikes += 1;
      if (revokedStrikes < 2) {
        // One rejection is not proof the account is gone — confirm shortly.
        confirmTimer = window.setTimeout(() => {
          void forceSignOutIfRevoked();
        }, 5000);
        return;
      }

      await signOutAndRedirect();
    }

    async function signOutAndRedirect() {
      if (cancelled) return;
      cancelled = true;
      // Local scope: clear THIS browser only. A global sign-out would revoke
      // every refresh token this account holds, killing the user's other
      // devices (mobile included) as a side effect.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      if (typeof window !== "undefined") {
        window.location.href = "/auth/sign-in";
      }
    }

    const unsubscribeRevoked = subscribeToUserRevoked(supabaseUser.id, () => {
      void signOutAndRedirect();
    });

    const pollInterval = window.setInterval(() => {
      void forceSignOutIfRevoked();
    }, 60 * 1000);

    // Tab focus fires on every alt-tab; don't turn that into an auth call.
    function handleFocus() {
      if (Date.now() - lastCheckAt < 60 * 1000) return;
      void forceSignOutIfRevoked();
    }
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      unsubscribeRevoked();
      window.clearInterval(pollInterval);
      window.clearTimeout(confirmTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [supabaseUser?.id]);

  const value = useMemo<AuthContextValue>(() => {
    const user = supabaseUser
      ? buildUserFromSupabase(supabaseUser, profileName, null, profilePhotoUrl)
      : cachedUser;

    return {
      user,
      authUser: supabaseUser,
      isConfigured: isSupabaseConfigured,
      isLoading,
    };
  }, [supabaseUser, isLoading, profileName, profilePhotoUrl, cachedUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  return useContext(AuthContext);
}

// Admin impersonation: re-provides the SAME auth context with the target
// user's identity for a contained subtree (/admin/users/[id]/impersonate/*),
// so every existing hook and page component inside it operates on the
// target's data without forking any component. This is a CLIENT-side display
// identity only — the network layer still authenticates as the admin, and
// the server proxy enforces the real scope substitution and attribution.
export function ImpersonatedAuthProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const parent = useContext(AuthContext);
  const value = useMemo<AuthContextValue>(
    () => ({ ...parent, user, isLoading: false }),
    [parent, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}