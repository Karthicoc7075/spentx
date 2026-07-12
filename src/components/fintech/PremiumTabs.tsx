"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Premium tab components must be used within PremiumTabs");
  }
  return context;
}

export function PremiumTabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const context = useMemo(() => ({ value, setValue }), [value]);

  return (
    <TabsContext.Provider value={context}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function PremiumTabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap gap-0.5 border-b border-border/60 sm:flex-nowrap sm:gap-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PremiumTabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: activeValue, setValue } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      className={cn("premium-tab-trigger shrink-0", className)}
      data-active={isActive}
      type="button"
      onClick={() => setValue(value)}
    >
      {children}
    </button>
  );
}

export function PremiumTabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: activeValue } = useTabsContext();
  if (activeValue !== value) return null;

  return <div className={cn("mt-6 focus-visible:outline-none", className)}>{children}</div>;
}