"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
} from "react";
import { usePurposeShares } from "@/hooks/usePurposeShares";
import { getViewerShares } from "@/lib/purpose-shares";
import { useAuthReady } from "@/hooks/useAuthReady";

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
  const { user } = useAuthReady();
  const { shares, isLoading } = usePurposeShares();

  const value = useMemo<ViewerContextValue>(() => {
    const viewerShares = getViewerShares(shares, user?.id, user?.email);
    const ownedShareIds = new Set(
      shares.filter((share) => share.ownerId === user?.id).map((share) => share.id),
    );
    const activeViewerShares = viewerShares.filter(
      (share) => !ownedShareIds.has(share.id),
    );

    if (activeViewerShares.length === 0) {
      return {
        isReadOnlyViewer: false,
        dataOwnerId: user?.id,
        sharedPurposeIds: [],
        ownerLabel: "",
        isLoading,
      };
    }

    const ownerIds = [...new Set(activeViewerShares.map((share) => share.ownerId))];
    const ownerId = ownerIds[0];

    return {
      isReadOnlyViewer: true,
      dataOwnerId: ownerId,
      sharedPurposeIds: [
        ...new Set(activeViewerShares.map((share) => share.purposeId)),
      ],
      ownerLabel: "shared household",
      isLoading,
    };
  }, [isLoading, shares, user?.email, user?.id]);

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
}

export function useViewerAccess() {
  return useContext(ViewerContext);
}