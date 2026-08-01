"use client";

import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppDataProvider } from "@/providers/app-data-provider";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ViewerProvider } from "@/providers/viewer-provider";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SupabaseProvider>
          <ViewerProvider>
            <AppDataProvider>
              <TooltipProvider>
                <ToastProvider>{children}</ToastProvider>
              </TooltipProvider>
            </AppDataProvider>
          </ViewerProvider>
        </SupabaseProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
