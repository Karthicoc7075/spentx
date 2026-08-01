"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
} from "react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useShareSession } from "@/providers/share-provider";

type ViewerContextValue = {
  isReadOnlyViewer: boolean;
  dataOwnerId: string | undefined;
  sharedPurposeIds: string[];
  ownerLabel: string;
  isLoading: boolean;
};

const ViewerContext = createContext<ViewerContextValue>({
  isReadOnlyViewer: false,
  dataOwnerId: undefined,
  sharedPurposeIds: [],
  ownerLabel: "",
  isLoading: false,
});

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { user, authLoading } = useAuthReady();
  const isLoading = authLoading;

  const value = useMemo<ViewerContextValue>(() => {
    // Signed-in users always work in their own workspace. Shared read-only
    // access is handled on /share/[token], not by switching dataOwnerId here.
    return {
      isReadOnlyViewer: false,
      dataOwnerId: user?.id,
      sharedPurposeIds: [],
      ownerLabel: "",
      isLoading,
    };
  }, [isLoading, user?.id]);

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
}

export function useViewerAccess() {
  const authValue = useContext(ViewerContext);
  const share = useShareSession();

  // Anonymous /share/[token] visitors never get a Supabase Auth session
  // (auth.uid() stays null), so they can't flow through the normal
  // auth-derived ViewerContext value above — a resolved share session
  // takes over dataOwnerId/sharedPurposeIds instead.
  if (share) {
    return {
      isReadOnlyViewer: true,
      dataOwnerId: share.ownerId,
      sharedPurposeIds: [share.purposeId],
      ownerLabel: share.purposeName,
      isLoading: false,
    };
  }

  return authValue;
}