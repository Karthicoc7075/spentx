"use client";

import { createContext, ReactNode, useContext } from "react";

export type ShareSession = {
  token: string;
  ownerId: string;
  purposeId: string;
  purposeName: string;
};

const ShareSessionContext = createContext<ShareSession | null>(null);

export function ShareSessionProvider({
  value,
  children,
}: {
  value: ShareSession;
  children: ReactNode;
}) {
  return (
    <ShareSessionContext.Provider value={value}>
      {children}
    </ShareSessionContext.Provider>
  );
}

/** Returns the active share session, or null outside a /share/[token] route. */
export function useShareSession() {
  return useContext(ShareSessionContext);
}
