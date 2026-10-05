"use client";

import "@/lib/crypto-polyfill";
import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppDataProvider } from "@/providers/app-data-provider";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ViewerProvider } from "@/providers/viewer-provider";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";

import { RoleModeProvider } from "@/providers/role-mode-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SupabaseProvider>
          <ViewerProvider>
            <RoleModeProvider>
              <ToastProvider>
                <AppDataProvider>
                  <TooltipProvider>{children}</TooltipProvider>
                </AppDataProvider>
              </ToastProvider>
            </RoleModeProvider>
          </ViewerProvider>
        </SupabaseProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
